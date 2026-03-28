import type { Deal } from './types.js'

const SOURCE_EMOJI: Record<string, string> = {
  'Epic Games': '🎮',
  Steam: '🎯',
  GOG: '🏴‍☠️',
  'Humble Bundle': '📦',
  'itch.io': '🕹️',
  PC: '💻'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

function buildPriceLine(deal: Deal): string {
  const parts: string[] = []
  if (deal.originalPrice) {
    parts.push(`${deal.originalPrice} **Free**`)
  } else {
    parts.push('**Free**')
  }
  if (deal.freeUntil) {
    parts.push(`until ${formatDate(deal.freeUntil)}`)
  }
  return parts.join(' ')
}

function buildLinks(deal: Deal): string {
  const parts = [`[Open in browser ↗](${deal.url})`]
  if (deal.clientUrl) {
    if (deal.source === 'Steam') {
      parts.push(`[Open in Steam ↗](${deal.clientUrl})`)
    } else if (deal.source === 'Epic Games') {
      parts.push(`[Open in Epic Games Launcher ↗](${deal.clientUrl})`)
    }
  }
  return parts.join('    ')
}

export function formatDeal(deal: Deal): string {
  const emoji = SOURCE_EMOJI[deal.source] ?? '🎁'

  const lines = [`${emoji} **${deal.source}**`, '', `**${deal.title}**`, buildPriceLine(deal), '', buildLinks(deal)]

  if (deal.imageUrl) {
    lines.push('', `![${deal.title}](${deal.imageUrl})`)
  }

  return lines.join('\n')
}

export function formatBatchSummary(deals: Deal[]): string {
  if (deals.length === 0) return ''

  const grouped = new Map<string, Deal[]>()
  for (const deal of deals) {
    const list = grouped.get(deal.source) ?? []
    list.push(deal)
    grouped.set(deal.source, list)
  }

  const sections: string[] = []
  for (const [source, items] of grouped) {
    const emoji = SOURCE_EMOJI[source] ?? '🎁'
    const header = `${emoji} **Free on ${source}**`
    const list = items.map((d) => `• **${d.title}** — ${buildLinks(d)}`).join('\n')
    sections.push(`${header}\n${list}`)
  }

  return sections.join('\n\n')
}
