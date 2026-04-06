import { IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class RegisterDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, hyphens, and underscores'
  })
  username: string

  @IsEmail()
  email: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string

  @IsOptional()
  @IsString()
  inviteCode?: string
}

export class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(190)
  bio?: string
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string
}

export class ChangeEmailDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string
}

const STATUS_DURATION_PRESETS = ['15m', '1h', '8h', '24h', '3d', 'forever'] as const

export class UpdateStatusDto {
  @IsEnum(['online', 'idle', 'dnd', 'offline'])
  status: 'online' | 'idle' | 'dnd' | 'offline'

  /** How long manual status applies (idle / dnd / invisible). Ignored for Online. Defaults to 1h. */
  @IsOptional()
  @IsIn(STATUS_DURATION_PRESETS)
  duration?: (typeof STATUS_DURATION_PRESETS)[number]
}

export class UpdateDmPrivacyDto {
  @IsEnum(['everyone', 'friends_only'])
  dmPrivacy: 'everyone' | 'friends_only'
}

export class UpdateCustomStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  customStatus: string | null
}
