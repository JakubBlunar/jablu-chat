import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common'
import { WsException } from '@nestjs/websockets'
import { Socket } from 'socket.io'

@Catch()
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>()

    let message: string

    if (exception instanceof BadRequestException) {
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
    } else if (exception instanceof Error) {
      this.logger.error('Unhandled WS exception', exception.stack)
      message = 'Internal error'
    } else {
      message = 'Internal error'
    }

    client.emit('exception', { status: 'error', message })
  }
}
