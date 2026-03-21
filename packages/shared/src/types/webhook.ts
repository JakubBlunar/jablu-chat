export interface Webhook {
  id: string;
  channelId: string;
  name: string;
  avatarUrl: string | null;
  token?: string;
  createdById: string;
  createdAt: string;
}
