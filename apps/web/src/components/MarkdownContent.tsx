import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export function MarkdownContent({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const processed = useMemo(() => convertEmoticons(content), [content]);

  return (
    <div className={`markdown-body ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
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
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link hover:underline"
          >
            {children}
          </a>
        ),
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
