import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { defer, finalize } from 'rxjs'
import { UploadsService } from './uploads.service'

export type UploadRequest = Request & { uploadSignal?: AbortSignal }

@Injectable()
export class UploadAdmissionInterceptor implements NestInterceptor {
  constructor(private readonly uploads: UploadsService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<UploadRequest>()
    const response = context.switchToHttp().getResponse<Response>()
    const abort = new AbortController()
    const cancel = () => abort.abort()
    const close = () => { if (!response.writableEnded) cancel() }
    request.uploadSignal = abort.signal
    request.once('aborted', cancel)
    response.once('close', close)
    const cleanup = () => { request.removeListener('aborted', cancel); response.removeListener('close', close) }
    if (request.aborted || response.destroyed) cancel()
    let release: () => void
    try { release = await this.uploads.acquireUpload(abort.signal) } catch (error) { cleanup(); throw error }
    return defer(() => next.handle()).pipe(finalize(() => { cleanup(); release() }))
  }
}
