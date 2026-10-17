import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

@Injectable()
export class VoiceService {
  private readonly apiKey: string
  private readonly apiSecret: string
  private readonly livekitUrl: string

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('LIVEKIT_API_KEY', '')
    this.apiSecret = config.get<string>('LIVEKIT_API_SECRET', '')
    this.livekitUrl = config.get<string>('LIVEKIT_URL', '')
  }

  async generateToken(
    userId: string,
    username: string,
    channelId: string
  ): Promise<{ token: string; url: string }> {
    const roomName = `voice:${channelId}`

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: username
    })

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    })

    const token = await at.toJwt()
    return { token, url: this.livekitUrl }
  }

  get isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret && this.livekitUrl)
  }

  async generateDmToken(userId: string, username: string, callId: string) {
    const token = new AccessToken(this.apiKey, this.apiSecret, { identity: userId, name: username, ttl: 60 })
    token.addGrant({
      room: `dm-call:${callId}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true
    })
    return { token: await token.toJwt(), url: this.livekitUrl }
  }

  async deleteDmRoom(callId: string) {
    const client = new RoomServiceClient(this.livekitUrl.replace(/^ws/, 'http'), this.apiKey, this.apiSecret)
    try {
      await client.deleteRoom(`dm-call:${callId}`)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'not_found') return
      throw error
    }
  }
}
