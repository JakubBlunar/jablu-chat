import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator'
import { Transform } from 'class-transformer'

export class CreateServerDto {
  @IsString()
  @Length(1, 100)
  name: string
}

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string

  @IsOptional()
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'vanityCode must be lowercase letters, numbers, and hyphens' })
  @Transform(({ value }) => (value === '' ? null : value))
  vanityCode?: string | null

  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => (value === '' ? null : value))
  welcomeChannelId?: string | null

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  @Transform(({ value }) => (value === '' ? null : value))
  welcomeMessage?: string | null

  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => (value === '' ? null : value))
  afkChannelId?: string | null

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  afkTimeout?: number
}

export class UpdateMemberRoleDto {
  @IsUUID()
  roleId: string
}
