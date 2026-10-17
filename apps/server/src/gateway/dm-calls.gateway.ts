import { HttpException, Logger, UseFilters, UseGuards } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets'
import { IsUUID } from 'class-validator'
import type { DmCallReply } from '@chat/shared'
import { Server, Socket } from 'socket.io'
import { DmCallsService } from '../voice/dm-calls.service'
import { WsConversationIdDto, WsVoiceStateDto } from './gateway.dto'
import { WsExceptionFilter } from './ws-exception.filter'
import { WsJwtGuard, type WsUser } from './ws-jwt.guard'
import { WsThrottle, WsThrottleGuard } from './ws-throttle.guard'

export class WsDmCallIdDto {
  @IsUUID()
  callId!: string
}

export class WsDmCallStateDto extends WsVoiceStateDto {
  @IsUUID()
  callId!: string
}

@WebSocketGateway({ namespace: '/' })
@UseGuards(WsJwtGuard, WsThrottleGuard)
@UseFilters(WsExceptionFilter)
export class DmCallsGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(DmCallsGateway.name)

  constructor(private readonly calls: DmCallsService) {}

  afterInit(server: Server) {
    this.calls.setEmitter((ids, event, payload) => server.to(ids.map((id) => `user:${id}`)).emit(event, payload))
  }

  handleDisconnect(client: Socket) {
    this.calls.leaveSocket(client.id)
  }

  @WsThrottle(3, 30)
  @SubscribeMessage('dm:call:start')
  start(@ConnectedSocket() client: Socket, @MessageBody() body: WsConversationIdDto) {
    return this.reply(async () => {
      const call = await this.calls.start(body.conversationId, this.user(client), client.id)
      if (!client.connected) this.calls.leaveSocket(client.id)
      return call
    })
  }

  @SubscribeMessage('dm:call:accept')
  accept(@ConnectedSocket() client: Socket, @MessageBody() body: WsDmCallIdDto) {
    return this.reply(async () => {
      const call = await this.calls.accept(body.callId, this.user(client), client.id)
      if (!client.connected) this.calls.leaveSocket(client.id)
      return call
    })
  }

  @SubscribeMessage('dm:call:decline')
  decline(@ConnectedSocket() client: Socket, @MessageBody() body: WsDmCallIdDto) {
    return this.reply(() => this.calls.decline(body.callId, this.user(client).id))
  }

  @SubscribeMessage('dm:call:leave')
  leave(@ConnectedSocket() client: Socket, @MessageBody() body: WsDmCallIdDto) {
    return this.reply(() => this.calls.leave(body.callId, this.user(client).id, client.id))
  }

  @SubscribeMessage('dm:call:sync')
  sync(@ConnectedSocket() client: Socket) {
    return this.reply(() => this.calls.sync(this.user(client).id))
  }

  @SubscribeMessage('dm:call:state')
  state(@ConnectedSocket() client: Socket, @MessageBody() body: WsDmCallStateDto) {
    return this.reply(() => this.calls.state(body.callId, this.user(client).id, client.id, body))
  }

  private user(client: Socket): WsUser {
    return (client.data as { user: WsUser }).user
  }

  private async reply<T>(action: () => Promise<T>): Promise<DmCallReply<T>> {
    try {
      return { ok: true, data: await action() }
    } catch (error) {
      if (error instanceof HttpException) return { ok: false, error: error.message }
      this.logger.error('DM call operation failed', error)
      return { ok: false, error: 'Could not complete the call operation' }
    }
  }
}
