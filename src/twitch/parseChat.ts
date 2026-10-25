export type ParsedChatMessage =
  | { kind: 'dare'; text: string; bits: number }
  | { kind: 'appeal' }
  | null;

interface ChatMessagePayload {
  message?: { text?: string };
  cheer?: { bits?: number };
}

export function parseChatMessage(payload: ChatMessagePayload): ParsedChatMessage {
  const text = payload.message?.text?.trim() ?? '';
  if (/^!appeal$/i.test(text)) return { kind: 'appeal' };
  const dare = text.match(/^!dare\s+(.+?)\s*$/i);
  const bits = payload.cheer?.bits ?? 0;
  if (dare?.[1] && Number.isInteger(bits) && bits > 0) return { kind: 'dare', text: dare[1], bits };
  return null;
}
