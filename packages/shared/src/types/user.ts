export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export type UserStatus = "online" | "idle" | "dnd" | "offline";

export interface UserProfile extends User {
  memberSince?: string;
  role?: ServerRole;
}

export type ServerRole = "owner" | "admin" | "member";
