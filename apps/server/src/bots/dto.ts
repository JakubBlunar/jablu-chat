import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { Permission } from '@chat/shared'

const VALID_PERMISSIONS = Object.keys(Permission)

export class CreateBotDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(32)
  username!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  displayName!: string

  @IsString()
  @IsOptional()
  @MaxLength(256)
  description?: string

  @IsBoolean()
  @IsOptional()
  public?: boolean
}

export class UpdateBotDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(64)
  displayName?: string

  @IsString()
  @IsOptional()
  @MaxLength(256)
  description?: string

  @IsBoolean()
  @IsOptional()
  public?: boolean
}

export class AddBotToServerDto {
  @IsString()
  @IsNotEmpty()
  username!: string
}

class BotCommandParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  type!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  description!: string

  @IsOptional()
  required?: boolean
}

class BotCommandDefDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  description!: string

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BotCommandParamDto)
  parameters?: BotCommandParamDto[]

  @IsString()
  @IsOptional()
  @IsIn(VALID_PERMISSIONS, { message: `requiredPermission must be one of: ${Object.keys(Permission).join(', ')}` })
  requiredPermission?: string
}

export class SyncCommandsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BotCommandDefDto)
  commands!: BotCommandDefDto[]
}
