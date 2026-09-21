import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { TranslationService } from './translation.service'
import { TranslationPreferenceDto, TranslateMessageDto } from './dto'

@Controller('translation')
@UseGuards(UnifiedAuthGuard)
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  /** Capability probe: is translation configured and which languages exist. */
  @Get('capabilities')
  capabilities() {
    return this.translation.capabilities()
  }

  /** The user's stored target language (or null). */
  @Get('preference')
  preference(@CurrentUser() user: { id: string }) {
    return this.translation.getPreference(user.id)
  }

  /** Store (or clear, with empty/omitted targetLang) the target language. */
  @Post('preference')
  setPreference(@CurrentUser() user: { id: string }, @Body() dto: TranslationPreferenceDto) {
    return this.translation.setPreference(user.id, dto.targetLang)
  }

  /**
   * Translate a message on demand. The server re-fetches the message, checks
   * channel/DM access, extracts only natural-language segments and sends those
   * to the MT engine — code, URLs and mentions are preserved verbatim.
   * Translations are never stored.
   */
  @Post('translate')
  translate(@CurrentUser() user: { id: string }, @Body() dto: TranslateMessageDto) {
    return this.translation.translateMessage(user.id, dto.messageId, dto.targetLang)
  }
}
