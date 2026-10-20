import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import { WsException } from '@nestjs/websockets'
import { Socket } from 'socket.io'

@Catch()
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>()

    let message: string
    let retryable = true
    let event: string | undefined
    let retryAfter: number | undefined

    if (exception instanceof HttpException) {
      retryable = exception.getStatus() >= 500 || exception.getStatus() === 429
      const response = exception.getResponse()
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const inner = (response as { message: unknown }).message
        message = Array.isArray(inner) ? inner.join('; ') : String(inner)
      } else {
        message = exception.message
      }
    } else if (exception instanceof WsException) {
      const error = exception.getError()
      message = typeof error === 'string' ? error : String((error as { message?: string }).message ?? error)
      if (typeof error === 'object' && error !== null) {
        if ('event' in error && typeof error.event === 'string') event = error.event
        if ('retryAfter' in error && typeof error.retryAfter === 'number') retryAfter = error.retryAfter
      }
    } else if (exception instanceof Error) {
      this.logger.error('Unhandled WS exception', exception.stack)
      message = 'Internal error'
    } else {
      message = 'Internal error'
    }

    const metadata = {
      ...(event !== undefined ? { event } : {}),
      ...(retryAfter !== undefined ? { retryAfter } : {})
    }
    const acknowledge = host.getArgByIndex<unknown>(2)
    if (typeof acknowledge === 'function') {
      acknowledge({ ok: false, error: message, retryable, ...metadata })
    } else {
      client.emit('exception', { status: 'error', message, ...metadata })
    }
  }
}
