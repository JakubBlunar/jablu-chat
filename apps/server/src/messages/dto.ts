import { MAX_MESSAGE_LENGTH } from '@chat/shared'
import type { MessageEmbed } from '@chat/shared'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator'

export class EmbedFieldDto {
  @IsString()
  @MaxLength(256)
  name!: string

  @IsString()
  @MaxLength(1024)
  value!: string

  @IsOptional()
  @IsBoolean()
  inline?: boolean
}

export class EmbedAuthorDto {
  @IsString()
  @MaxLength(256)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  iconUrl?: string
}

export class EmbedFooterDto {
  @IsString()
  @MaxLength(2048)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  iconUrl?: string
}

export class EmbedImageDto {
  @IsString()
  @MaxLength(2048)
  url!: string
}

export class EmbedDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0xFFFFFF)
  color?: number

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => EmbedFieldDto)
  fields?: EmbedFieldDto[]

  @IsOptional()
  @ValidateNested()
  @Type(() => EmbedImageDto)
  thumbnail?: EmbedImageDto

  @IsOptional()
  @ValidateNested()
  @Type(() => EmbedImageDto)
  image?: EmbedImageDto

  @IsOptional()
  @ValidateNested()
  @Type(() => EmbedFooterDto)
  footer?: EmbedFooterDto

  @IsOptional()
  @ValidateNested()
  @Type(() => EmbedAuthorDto)
  author?: EmbedAuthorDto

  @IsOptional()
  @IsString()
  timestamp?: string
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  content?: string

  @IsOptional()
  @IsUUID()
  replyToId?: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  attachmentIds?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EmbedDto)
  embeds?: EmbedDto[]
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  content!: string
}

export class MessageQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @IsUUID()
  around?: string

  @IsOptional()
  @IsString()
  after?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class ToggleReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  emoji!: string

  @IsOptional()
  isCustom?: boolean
}
