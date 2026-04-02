export class RestClient {
  private baseUrl: string
  private token: string

  constructor(serverUrl: string, token: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/api'
    this.token = token
  }

  async sendMessage(channelId: string, content: string): Promise<any> {
    return this.post(`/channels/${channelId}/messages`, { content })
  }

  async editMessage(channelId: string, messageId: string, content: string): Promise<any> {
    return this.patch(`/channels/${channelId}/messages/${messageId}`, { content })
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.delete(`/channels/${channelId}/messages/${messageId}`)
  }

  async sendDmMessage(conversationId: string, content: string): Promise<any> {
    return this.post(`/dm/${conversationId}/messages`, { content })
  }

  async syncCommands(commands: Array<{ name: string; description: string; parameters?: any[]; requiredPermission?: string }>): Promise<void> {
    await this.put('/bots/@me/commands', { commands })
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = this.baseUrl + path
    const headers: Record<string, string> = {
      'Authorization': `Bot ${this.token}`,
      'Content-Type': 'application/json'
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000)
    })

    if (!res.ok) {
      await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}`)
    }

    const contentType = res.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return res.json()
    }
    return undefined
  }

  private post(path: string, body: unknown) {
    return this.request('POST', path, body)
  }

  private patch(path: string, body: unknown) {
    return this.request('PATCH', path, body)
  }

  private put(path: string, body: unknown) {
    return this.request('PUT', path, body)
  }

  private delete(path: string) {
    return this.request('DELETE', path)
  }
}
