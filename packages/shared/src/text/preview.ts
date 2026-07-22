/**
 * Produce a plain-text preview of a message for notifications.
 *
 * Strips markdown/HTML so raw markup never leaks into a notification title or
 * body. In particular this removes HTML tags together with their attributes
 * (e.g. `style="color:#F6F6F6"`), which previously surfaced color tokens in
 * desktop notification previews.
 */
export function messagePreviewText(content: string | undefined | null, maxLen = 100): string {
  if (!content) return ''
  let text = content

  // Fenced code blocks -> inner text (drop the ``` fences and language tag).
  text = text.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, '$1')
  // Images ![alt](url) -> alt  (must run before the link rule).
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Links [text](url) -> text.
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // HTML tags including attributes (removes leaked color tokens etc.).
  text = text.replace(/<[^>]*>/g, '')
  // Spoilers ||text|| -> text.
  text = text.replace(/\|\|([\s\S]+?)\|\|/g, '$1')
  // Inline code `code` -> code.
  text = text.replace(/`([^`]+)`/g, '$1')
  // Emphasis markers (paired) -> inner text.
  text = text.replace(/\*\*([\s\S]+?)\*\*/g, '$1')
  text = text.replace(/__([\s\S]+?)__/g, '$1')
  text = text.replace(/~~([\s\S]+?)~~/g, '$1')
  text = text.replace(/\*([\s\S]+?)\*/g, '$1')
  text = text.replace(/_([\s\S]+?)_/g, '$1')
  // Leading heading (#) / blockquote (>) markers per line.
  text = text.replace(/^\s{0,3}(#{1,6}|>)\s?/gm, '')
  // Collapse all whitespace/newlines to single spaces.
  text = text.replace(/\s+/g, ' ').trim()

  return text.length > maxLen ? text.slice(0, maxLen) : text
}
