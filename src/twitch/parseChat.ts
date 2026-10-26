export type ParsedChatMessage =
  | { kind: 'dare'; text: string; bits: number }
  | { kind: 'appeal' }
  | { kind: 'vote'; choice: 'overrule' | 'uphold' }
  | null;

export interface ParseChatOptions { requireBits: boolean }

interface ChatMessagePayload {
  message?: { text?: string };
  cheer?: { bits?: number };
}

export function parseChatMessage(payload: ChatMessagePayload, options: ParseChatOptions): ParsedChatMessage {
  const text = payload.message?.text?.trim() ?? '';
  if (/^!appeal$/i.test(text)) return { kind: 'appeal' };
  if (/^!overrule$/i.test(text)) return { kind: 'vote', choice: 'overrule' };
  if (/^!uphold$/i.test(text)) return { kind: 'vote', choice: 'uphold' };
  const dare = text.match(/^!dare\s+(.+?)\s*$/i);
  const bits = payload.cheer?.bits ?? 0;
  if (dare?.[1] && Number.isInteger(bits) && bits > 0) return { kind: 'dare', text: dare[1], bits };
  if (dare?.[1] && !options.requireBits && bits === 0) return { kind: 'dare', text: dare[1], bits: 0 };
  return null;
}
