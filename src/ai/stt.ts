import { toFile } from 'openai/uploads';
import { config } from '../config.js';
import { getSttClient, warnThrottled } from './client.js';

export function normalizeTranscript(text: string): string {
  const trimmed = text.trim();
  return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : '';
}

export async function transcribeChunk(wavOrWebm: Buffer, mime: string): Promise<string> {
  try {
    const client = getSttClient();
    const file = await toFile(wavOrWebm, mime.includes('webm') ? 'chunk.webm' : 'chunk.wav', { type: mime });
    const result = await client.audio.transcriptions.create({ file, model: config.STT_MODEL });
    return normalizeTranscript(result.text);
  } catch (error) {
    warnThrottled('speech-transcription', 'Speech transcription is unavailable; referee will continue without this transcript.', error);
    return '';
  }
}
