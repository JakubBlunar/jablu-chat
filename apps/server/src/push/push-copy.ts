import { messagePreviewText } from '@chat/shared'
import type { AppLocale } from '@chat/shared'

export type PushLocale = AppLocale

export type LocalizedPushCopy = Record<PushLocale, { title: string; body: string }>

export function messagePushCopy(
  titles: Record<PushLocale, string>,
  content?: string,
  attachments?: { type: string }[]
): LocalizedPushCopy {
  const preview = messagePreviewText(content)
  return {
    en: { title: titles.en, body: preview || attachmentPreview('en', attachments) },
    cs: { title: titles.cs, body: preview || attachmentPreview('cs', attachments) },
    sk: { title: titles.sk, body: preview || attachmentPreview('sk', attachments) }
  }
}

export function friendRequestPushCopy(name: string): LocalizedPushCopy {
  return {
    en: { title: 'Friend Request', body: `${name} sent you a friend request` },
    cs: { title: 'Žádost o přátelství', body: `${name} vám poslal(a) žádost o přátelství` },
    sk: { title: 'Žiadosť o priateľstvo', body: `${name} vám poslal(a) žiadosť o priateľstvo` }
  }
}

export function friendAcceptedPushCopy(name: string): LocalizedPushCopy {
  return {
    en: { title: 'Friend request accepted', body: `${name} accepted your friend request` },
    cs: { title: 'Žádost přijata', body: `${name} přijal(a) vaši žádost o přátelství` },
    sk: { title: 'Žiadosť prijatá', body: `${name} prijal(a) vašu žiadosť o priateľstvo` }
  }
}

export function moderationPushCopy(
  action: 'kick' | 'ban' | 'timeout',
  serverName: string,
  reason?: string
): LocalizedPushCopy {
  const body = {
    en:
      action === 'ban'
        ? `You were banned from ${serverName}`
        : action === 'kick'
          ? `You were removed from ${serverName}`
          : `You were timed out in ${serverName}`,
    cs:
      action === 'ban'
        ? `Na serveru ${serverName} vám byl udělen zákaz`
        : action === 'kick'
          ? `Byli jste odebráni ze serveru ${serverName}`
          : `Na serveru ${serverName} máte dočasně zakázáno psát`,
    sk:
      action === 'ban'
        ? `Na serveri ${serverName} vám bol udelený zákaz`
        : action === 'kick'
          ? `Boli ste odstránení zo servera ${serverName}`
          : `Na serveri ${serverName} máte dočasne zakázané písať`
  }
  const withReason = (value: string) => (reason ? `${value}: ${reason}` : value)

  return {
    en: { title: serverName, body: withReason(body.en) },
    cs: { title: serverName, body: withReason(body.cs) },
    sk: { title: serverName, body: withReason(body.sk) }
  }
}

export function eventStartedPushCopy(name: string, description?: string | null): LocalizedPushCopy {
  const body = description?.slice(0, 100)
  return {
    en: { title: `Event starting: ${name}`, body: body ?? 'An event is starting now!' },
    cs: { title: `Začíná událost: ${name}`, body: body ?? 'Událost právě začíná!' },
    sk: { title: `Začína udalosť: ${name}`, body: body ?? 'Udalosť sa práve začína!' }
  }
}

export function eventReminderPushCopy(name: string): LocalizedPushCopy {
  return {
    en: { title: `Starting soon: ${name}`, body: 'This event starts in 30 minutes!' },
    cs: { title: `Brzy začíná: ${name}`, body: 'Tato událost začíná za 30 minut!' },
    sk: { title: `Čoskoro sa začína: ${name}`, body: 'Táto udalosť sa začína o 30 minút!' }
  }
}

export function incomingVoiceCallPushCopy(name: string): LocalizedPushCopy {
  return {
    en: { title: 'Incoming voice call', body: `${name} is calling. Open Jablu to join.` },
    cs: { title: 'Příchozí hlasový hovor', body: `${name} vám volá. Otevřete Jablu a připojte se.` },
    sk: { title: 'Prichádzajúci hlasový hovor', body: `${name} vám volá. Otvorte Jablu a pripojte sa.` }
  }
}

function attachmentPreview(locale: PushLocale, attachments?: { type: string }[]): string {
  if (!attachments || attachments.length === 0) {
    return locale === 'cs' ? '[příloha]' : locale === 'sk' ? '[príloha]' : '[attachment]'
  }

  if (attachments.length > 1) {
    const count = attachments.length
    if (locale === 'cs') {
      const noun = count === 1 ? 'soubor' : count < 5 ? 'soubory' : 'souborů'
      return `odeslal(a) ${count} ${noun}`
    }
    if (locale === 'sk') {
      const noun = count === 1 ? 'súbor' : count < 5 ? 'súbory' : 'súborov'
      return `odoslal(a) ${count} ${noun}`
    }
    return `sent ${count} files`
  }

  const type = attachments[0].type
  if (locale === 'cs') {
    return type === 'image' ? 'odeslal(a) obrázek'
      : type === 'video' ? 'odeslal(a) video'
        : type === 'gif' ? 'odeslal(a) GIF'
          : 'odeslal(a) soubor'
  }
  if (locale === 'sk') {
    return type === 'image' ? 'odoslal(a) obrázok'
      : type === 'video' ? 'odoslal(a) video'
        : type === 'gif' ? 'odoslal(a) GIF'
          : 'odoslal(a) súbor'
  }
  return type === 'image' ? 'sent an image'
    : type === 'video' ? 'sent a video'
      : type === 'gif' ? 'sent a GIF'
        : 'sent a file'
}
