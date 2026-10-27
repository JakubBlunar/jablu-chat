import { EventEmitter } from 'node:events'
import type { ExecutionContext } from '@nestjs/common'
import { firstValueFrom, of } from 'rxjs'
import { UploadAdmissionInterceptor } from './upload-admission.interceptor'
import type { UploadsService } from './uploads.service'

it('waits before invoking multipart parsing and cleans up capacity and disconnect listeners', async () => {
  let admit!: (release: () => void) => void
  const acquireUpload = jest.fn(() => new Promise<() => void>(resolve => { admit = resolve }))
  const request = new EventEmitter()
  const response = Object.assign(new EventEmitter(), { writableEnded: false })
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext
  const handler = { handle: jest.fn(() => of('parsed')) }
  const interceptor = new UploadAdmissionInterceptor({ acquireUpload } as unknown as UploadsService)
  const pending = interceptor.intercept(context, handler)
  expect(handler.handle).not.toHaveBeenCalled()
  const release = jest.fn()
  admit(release)
  const result = await pending
  expect(await firstValueFrom(result)).toBe('parsed')
  expect(release).toHaveBeenCalledTimes(1)
  expect(response.listenerCount('close')).toBe(0)
  expect(request.listenerCount('aborted')).toBe(0)
})

it('cancels queued admission when the client disconnects', async () => {
  const acquireUpload = jest.fn((signal: AbortSignal) => new Promise<() => void>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const request = new EventEmitter()
  const response = new EventEmitter()
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext
  const handler = { handle: jest.fn() }
  const pending = new UploadAdmissionInterceptor({ acquireUpload } as unknown as UploadsService).intercept(context, handler)
  const rejected = expect(pending).rejects.toThrow()
  response.emit('close')
  await rejected
  expect(handler.handle).not.toHaveBeenCalled()
  expect(response.listenerCount('close')).toBe(0)
})
