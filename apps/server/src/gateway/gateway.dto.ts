import { MAX_MESSAGE_LENGTH } from '@chat/shared'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from 'class-validator'

export class WsSendMessageDto {
  @IsUUID()
  channelId!: string

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
  @IsUUID()
  threadParentId?: string

  @IsOptional()
  @IsUUID()
  targetBotAppId?: string

  @IsOptional()
  @IsUUID()
  forwardFromMessageId?: string
}

export class WsEditMessageDto {
  @IsUUID()
  messageId!: string

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  content!: string
}

export class WsMessageIdDto {
  @IsUUID()
  messageId!: string
}

export class WsReactionToggleDto {
  @IsUUID()
  messageId!: string

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  emoji!: string

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean
}

export class WsMessageChannelDto {
  @IsUUID()
  messageId!: string

  @IsUUID()
  channelId!: string
}

export class WsPollVoteDto {
  @IsUUID()
  pollId!: string

  @IsUUID()
  optionId!: string
}

export class WsChannelIdDto {
  @IsUUID()
  channelId!: string
}

export class WsDmSendDto {
  @IsUUID()
  conversationId!: string

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
  @IsUUID()
  targetBotAppId?: string

  @IsOptional()
  @IsUUID()
  forwardFromMessageId?: string
}

export class WsDmEditDto {
  @IsUUID()
  conversationId!: string

  @IsUUID()
  messageId!: string

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  content!: string
}

export class WsDmMessageDto {
  @IsUUID()
  conversationId!: string

  @IsUUID()
  messageId!: string
}

export class WsConversationIdDto {
  @IsUUID()
  conversationId!: string
}

export class WsActivityUpdateDto {
  @IsEnum(['game', 'music'])
  kind!: 'game' | 'music'

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  details?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(256)
  state?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startedAt?: string
}

export class WsPresenceStateDto {
  /** `visible` means the app is on screen: window shown and not minimised, or a foreground tab. */
  @IsEnum(['visible', 'hidden'])
  visibility!: 'visible' | 'hidden'

  @IsOptional()
  @IsBoolean()
  focused?: boolean
}

export class WsVoiceStateDto {
  @IsOptional()
  @IsBoolean()
  muted?: boolean

  @IsOptional()
  @IsBoolean()
  deafened?: boolean

  @IsOptional()
  @IsBoolean()
  camera?: boolean

  @IsOptional()
  @IsBoolean()
  screenShare?: boolean
}
