export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    username: string
    displayName: string | null
    email: string
    avatarUrl: string | null
    bio: string | null
    status: string
    manualStatus: string | null
    manualStatusExpiresAt: string | null
    customStatus: string | null
    dmPrivacy: string
    lastSeenAt: string | null
    createdAt: string
  }
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  password: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}
