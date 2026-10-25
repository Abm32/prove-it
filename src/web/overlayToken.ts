import { createHmac, timingSafeEqual } from 'node:crypto';

function signature(uid: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(uid).digest();
}

export function createOverlayToken(uid: string, secret: string): string {
  return `${uid}.${signature(uid, secret).toString('hex')}`;
}

export function verifyOverlayToken(token: string, secret: string): string | null {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const uid = token.slice(0, separator);
  const signatureHex = token.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/i.test(signatureHex)) return null;
  const provided = Buffer.from(signatureHex, 'hex');
  const expected = signature(uid, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return uid;
}
