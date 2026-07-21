import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator'

export class UpdateActivitySettingsDto {
  @IsOptional()
  @IsBoolean()
  shareEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  shareOnline?: boolean

  @IsOptional()
  @IsEnum(['friends_all', 'friends_small', 'friends_only'])
  defaultSharing?: 'friends_all' | 'friends_small' | 'friends_only'

  @IsOptional()
  @IsBoolean()
  shareGames?: boolean

  @IsOptional()
  @IsBoolean()
  shareMusic?: boolean
}

export class UpsertRegisteredGameDto {
  @IsString()
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsEnum(['steam', 'process', 'smtc', 'manual'])
  source?: 'steam' | 'process' | 'smtc' | 'manual'

  @IsOptional()
  @IsString()
  @MaxLength(160)
  executable?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(32)
  steamAppId?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string | null

  @IsOptional()
  @IsBoolean()
  verified?: boolean
}

export class UpdateRegisteredGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsBoolean()
  hidden?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string | null
}

export class SetServerActivityDto {
  @IsBoolean()
  hidden!: boolean
}

export class UploadActivityIconDto {
  /** data:image/...;base64,.... payload of the icon. */
  @IsString()
  @MaxLength(2_000_000)
  dataUrl!: string

  /** Stable cache key (e.g. executable-name hash) for dedup. */
  @IsString()
  @MaxLength(80)
  key!: string
}
