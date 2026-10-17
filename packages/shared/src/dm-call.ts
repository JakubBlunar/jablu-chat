export function getDmCallUrl(conversationId: string, callId: string): string {
  return `/channels/@me/${encodeURIComponent(conversationId)}?call=${encodeURIComponent(callId)}`
}
