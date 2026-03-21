import type { ServerRole } from "./user.js";

export interface Server {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  createdAt: string;
}

export interface ServerMember {
  userId: string;
  serverId: string;
  role: ServerRole;
  joinedAt: string;
  user?: {
    id: string;
    username: string;
    avatarUrl: string | null;
    status: string;
  };
}
