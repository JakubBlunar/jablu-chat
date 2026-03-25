import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessToken } from 'livekit-server-sdk'

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
    channelId: string,
    isAdmin = false
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
}
