import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class TranslateMessageDto {
  @IsString()
  messageId: string

  @IsOptional()
  @IsString()
  @MaxLength(8)
  targetLang?: string
}

export class TranslationPreferenceDto {
  /**
   * Language code to translate *into* (e.g. "cs"). Omit (or send "") to clear
   * the stored preference and fall back to the client locale.
   */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  targetLang?: string
}
