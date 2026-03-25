import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import type { Member } from '@/stores/member.store'

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'div',
    'span',
    'img',
    'video',
    'audio',
    'source',
    'br',
    'hr',
    'details',
    'summary'
  ],
  attributes: {
    ...defaultSchema.attributes,
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'className', 'class'],
    video: ['src', 'controls', 'autoPlay', 'muted', 'playsInline', 'className', 'class'],
    audio: ['src', 'controls', 'autoPlay', 'className', 'class'],
    source: ['src', 'type'],
    a: ['href', 'target', 'rel', 'className', 'class'],
    div: ['className', 'class'],
    span: ['className', 'class', 'role', 'tabIndex'],
    p: ['className', 'class'],
    strong: ['className', 'class'],
    em: ['className', 'class']
  }
}

type HighlighterComponent = typeof import('react-syntax-highlighter').Prism
type HighlighterStyle = Record<string, React.CSSProperties>

let cachedHighlighter: HighlighterComponent | null = null
let cachedStyle: HighlighterStyle | null = null
let loadPromise: Promise<void> | null = null

function loadHighlighter(): Promise<void> {
  if (cachedHighlighter) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = Promise.all([
    import('react-syntax-highlighter').then((m) => {
      cachedHighlighter = m.Prism
    }),
    import('react-syntax-highlighter/dist/esm/styles/prism').then((m) => {
      cachedStyle = m.oneDark as HighlighterStyle
    })
  ]).then(() => {})
  return loadPromise
}

const TEXT_EMOTICONS: [RegExp, string][] = [
  [/(?<!\w):\)(?!\w)/g, '🙂'],
  [/(?<!\w):\((?!\w)/g, '😞'],
  [/(?<!\w):D(?!\w)/g, '😄'],
  [/(?<!\w):P(?!\w)/gi, '😛'],
  [/(?<!\w);[\)]/g, '😉'],
  [/(?<!\w):O(?!\w)/gi, '😮'],
  [/(?<!\w)<3(?!\w)/g, '❤️'],
  [/(?<!\w):'\((?!\w)/g, '😢'],
  [/(?<!\w)XD(?!\w)/gi, '😆'],
  [/(?<!\w):\|(?!\w)/g, '😐'],
  [/(?<!\w):\/(?!\w)/g, '😕'],
  [/(?<!\w)\^\^(?!\w)/g, '😊'],
  [/(?<!\w)>:\((?!\w)/g, '😠'],
  [/(?<!\w)B\)(?!\w)/g, '😎'],
  [/(?<!\w)O:\)(?!\w)/g, '😇']
]

function convertEmoticons(text: string): string {
  let result = text
  for (const [pattern, emoji] of TEXT_EMOTICONS) {
    result = result.replace(pattern, emoji)
  }
  return result
}

export type ChannelRef = { id: string; serverId: string; name: string }

function buildChannelLookup(channels: ChannelRef[]) {
  const byName = new Map<string, ChannelRef>()
  for (const c of channels) {
    byName.set(c.name.toLowerCase(), c)
  }
  return byName
}

function processMentions(text: string, byUsername: Map<string, Member>): string {
  return text.replace(/@(\w+)/g, (full, name: string) => {
    const member = byUsername.get(name.toLowerCase())
    if (!member) return full
    const display = member.user.displayName ?? member.user.username
    return `[@${display}](mention:${member.user.username})`
  })
}

function processChannelMentions(text: string, byName: Map<string, ChannelRef>): string {
  return text.replace(/#([\w][\w-]*)/g, (full, name: string) => {
    const channel = byName.get(name.toLowerCase())
    if (!channel) return full
    return `[#${channel.name}](channel:${channel.serverId}/${channel.id})`
  })
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(!!cachedHighlighter)

  useEffect(() => {
    if (cachedHighlighter) return
    void loadHighlighter().then(() => setReady(true))
  }, [])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code])

  const SyntaxHighlighter = cachedHighlighter
  const style = cachedStyle

  return (
    <div className="group/code relative my-1 overflow-hidden rounded-md bg-[#282c34] text-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1">
        <span className="text-xs text-gray-400">{language || 'code'}</span>
        <button type="button" onClick={handleCopy} className="text-xs text-gray-400 transition hover:text-white">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {ready && SyntaxHighlighter && style ? (
        <SyntaxHighlighter
          style={style}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '0.75rem 1rem',
            background: 'transparent',
            fontSize: '0.875rem'
          }}
          codeTagProps={{
            style: { fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace" }
          }}
        >
          {code}
        </SyntaxHighlighter>
      ) : (
        <pre style={{ margin: 0, padding: '0.75rem 1rem', background: 'transparent', fontSize: '0.875rem' }}>
          <code style={{ fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace" }}>
            {code}
          </code>
        </pre>
      )}
    </div>
  )
}

export function MarkdownContent({
  content,
  className = '',
  onMentionClick,
  channels,
  onChannelClick,
  membersByUsername
}: {
  content: string
  className?: string
  onMentionClick?: (username: string, rect: DOMRect) => void
  channels?: ChannelRef[]
  onChannelClick?: (serverId: string, channelId: string) => void
  membersByUsername?: Map<string, Member>
}) {
  const byUsername = membersByUsername ?? new Map<string, Member>()
  const byChannelName = useMemo(() => buildChannelLookup(channels ?? []), [channels])

  const processed = useMemo(() => {
    let text = convertEmoticons(content)
    text = processMentions(text, byUsername)
    if (byChannelName.size > 0) {
      text = processChannelMentions(text, byChannelName)
    }
    return text
  }, [content, byUsername, byChannelName])

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        urlTransform={(url) =>
          url.startsWith('mention:') ||
          url.startsWith('channel:') ||
          url.startsWith('steam://') ||
          url.startsWith('com.epicgames.launcher://')
            ? url
            : defaultUrlTransform(url)
        }
        components={{
          p: ({ children }) => (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-200">{children}</p>
          ),
          strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: (props) => {
            const { children, className: codeClassName } = props
            const match = /language-(\w+)/.exec(codeClassName || '')
            if (match) {
              const code = String(children).replace(/\n$/, '')
              return <CodeBlock language={match[1]} code={code} />
            }
            const isBlock = typeof children === 'string' && children.includes('\n')
            if (isBlock) {
              return <CodeBlock language="" code={String(children).replace(/\n$/, '')} />
            }
            return <code className="rounded bg-surface-darkest px-1.5 py-0.5 text-sm text-code">{children}</code>
          },
          pre: ({ children }) => <>{children}</>,
          a: ({ href, children }) => {
            if (href?.startsWith('mention:')) {
              const username = href.slice('mention:'.length)
              return (
                <span
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded bg-primary/20 px-1 text-primary hover:underline"
                  onClick={(e) => {
                    if (onMentionClick) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      onMentionClick(username, rect)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && onMentionClick) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      onMentionClick(username, rect)
                    }
                  }}
                >
                  {children}
                </span>
              )
            }
            if (href?.startsWith('channel:')) {
              const parts = href.slice('channel:'.length).split('/')
              const serverId = parts[0]
              const channelId = parts[1]
              return (
                <span
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded bg-primary/20 px-1 text-primary hover:underline"
                  onClick={() => {
                    if (onChannelClick && serverId && channelId) {
                      onChannelClick(serverId, channelId)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && onChannelClick && serverId && channelId) {
                      onChannelClick(serverId, channelId)
                    }
                  }}
                >
                  {children}
                </span>
              )
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="text-link hover:underline"
              >
                {children}
              </a>
            )
          },
          ul: ({ children }) => <ul className="ml-4 list-disc space-y-0.5 text-[15px] text-gray-200">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal space-y-0.5 text-[15px] text-gray-200">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-500 pl-3 text-gray-400">{children}</blockquote>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ''}
              className="my-1 max-h-72 max-w-full rounded-lg object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          ),
          hr: () => <hr className="my-2 border-white/10" />,
          h1: ({ children }) => <h1 className="text-xl font-bold text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-bold text-white">{children}</h3>,
          del: ({ children }) => <del className="text-gray-400 line-through">{children}</del>,
          table: ({ children }) => <table className="my-1 border-collapse text-sm text-gray-200">{children}</table>,
          th: ({ children }) => (
            <th className="border border-white/10 bg-surface-darkest px-3 py-1.5 text-left font-semibold text-white">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-white/10 px-3 py-1.5">{children}</td>
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
