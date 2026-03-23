import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemberStore, type Member } from "@/stores/member.store";

const TEXT_EMOTICONS: [RegExp, string][] = [
  [/(?<!\w):\)(?!\w)/g, "🙂"],
  [/(?<!\w):\((?!\w)/g, "😞"],
  [/(?<!\w):D(?!\w)/g, "😄"],
  [/(?<!\w):P(?!\w)/gi, "😛"],
  [/(?<!\w);[\)]/g, "😉"],
  [/(?<!\w):O(?!\w)/gi, "😮"],
  [/(?<!\w)<3(?!\w)/g, "❤️"],
  [/(?<!\w):'\((?!\w)/g, "😢"],
  [/(?<!\w)XD(?!\w)/gi, "😆"],
  [/(?<!\w):\|(?!\w)/g, "😐"],
  [/(?<!\w):\/(?!\w)/g, "😕"],
  [/(?<!\w)\^\^(?!\w)/g, "😊"],
  [/(?<!\w)>:\((?!\w)/g, "😠"],
  [/(?<!\w)B\)(?!\w)/g, "😎"],
  [/(?<!\w)O:\)(?!\w)/g, "😇"],
];

function convertEmoticons(text: string): string {
  let result = text;
  for (const [pattern, emoji] of TEXT_EMOTICONS) {
    result = result.replace(pattern, emoji);
  }
  return result;
}

function buildMemberLookup(members: Member[]) {
  const byUsername = new Map<string, Member>();
  for (const m of members) {
    byUsername.set(m.user.username.toLowerCase(), m);
  }
  return byUsername;
}

export type ChannelRef = { id: string; serverId: string; name: string };

function buildChannelLookup(channels: ChannelRef[]) {
  const byName = new Map<string, ChannelRef>();
  for (const c of channels) {
    byName.set(c.name.toLowerCase(), c);
  }
  return byName;
}

function processMentions(
  text: string,
  byUsername: Map<string, Member>,
): string {
  return text.replace(/@(\w+)/g, (full, name: string) => {
    const member = byUsername.get(name.toLowerCase());
    if (!member) return full;
    const display = member.user.displayName ?? member.user.username;
    return `[@${display}](mention:${member.user.username})`;
  });
}

function processChannelMentions(
  text: string,
  byName: Map<string, ChannelRef>,
): string {
  return text.replace(/#([\w][\w-]*)/g, (full, name: string) => {
    const channel = byName.get(name.toLowerCase());
    if (!channel) return full;
    return `[#${channel.name}](channel:${channel.serverId}/${channel.id})`;
  });
}

export function MarkdownContent({
  content,
  className = "",
  onMentionClick,
  channels,
  onChannelClick,
}: {
  content: string;
  className?: string;
  onMentionClick?: (username: string, rect: DOMRect) => void;
  channels?: ChannelRef[];
  onChannelClick?: (serverId: string, channelId: string) => void;
}) {
  const members = useMemberStore((s) => s.members);
  const byUsername = useMemo(() => buildMemberLookup(members), [members]);
  const byChannelName = useMemo(
    () => buildChannelLookup(channels ?? []),
    [channels],
  );

  const processed = useMemo(() => {
    let text = convertEmoticons(content);
    text = processMentions(text, byUsername);
    if (byChannelName.size > 0) {
      text = processChannelMentions(text, byChannelName);
    }
    return text;
  }, [content, byUsername, byChannelName]);

  return (
    <div className={`markdown-body ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        url.startsWith("mention:") || url.startsWith("channel:")
          ? url
          : defaultUrlTransform(url)
      }
      components={{
        p: ({ children }) => (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-200">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-bold text-white">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        code: (props) => {
          const { children, className: codeClassName } = props;
          const isBlock = typeof codeClassName === "string" && codeClassName.startsWith("language-");
          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-md bg-surface-darkest p-3 text-sm text-gray-200">
                {children}
              </code>
            );
          }
          return (
            <code className="rounded bg-surface-darkest px-1.5 py-0.5 text-sm text-code">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-1 overflow-x-auto rounded-md bg-surface-darkest text-sm">
            {children}
          </pre>
        ),
        a: ({ href, children }) => {
          if (href?.startsWith("mention:")) {
            const username = href.slice("mention:".length);
            return (
              <span
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded bg-primary/20 px-1 text-primary hover:underline"
                onClick={(e) => {
                  if (onMentionClick) {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onMentionClick(username, rect);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && onMentionClick) {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onMentionClick(username, rect);
                  }
                }}
              >
                {children}
              </span>
            );
          }
          if (href?.startsWith("channel:")) {
            const parts = href.slice("channel:".length).split("/");
            const serverId = parts[0];
            const channelId = parts[1];
            return (
              <span
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded bg-primary/20 px-1 text-primary hover:underline"
                onClick={() => {
                  if (onChannelClick && serverId && channelId) {
                    onChannelClick(serverId, channelId);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && onChannelClick && serverId && channelId) {
                    onChannelClick(serverId, channelId);
                  }
                }}
              >
                {children}
              </span>
            );
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:underline"
            >
              {children}
            </a>
          );
        },
        ul: ({ children }) => (
          <ul className="ml-4 list-disc space-y-0.5 text-[15px] text-gray-200">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="ml-4 list-decimal space-y-0.5 text-[15px] text-gray-200">
            {children}
          </ol>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-500 pl-3 text-gray-400">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-2 border-white/10" />,
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-white">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-bold text-white">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-bold text-white">{children}</h3>
        ),
        del: ({ children }) => (
          <del className="text-gray-400 line-through">{children}</del>
        ),
        table: ({ children }) => (
          <table className="my-1 border-collapse text-sm text-gray-200">
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th className="border border-white/10 bg-surface-darkest px-3 py-1.5 text-left font-semibold text-white">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-white/10 px-3 py-1.5">{children}</td>
        ),
      }}
    >
      {processed}
    </ReactMarkdown>
    </div>
  );
}
