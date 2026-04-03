import { MAX_MESSAGE_LENGTH } from '@chat/shared'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { EmbedDto } from '../messages/dto'

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string
}

export class ExecuteWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  content?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EmbedDto)
  embeds?: EmbedDto[]
}
