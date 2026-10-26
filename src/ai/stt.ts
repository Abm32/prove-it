import { toFile } from 'openai/uploads';
import { config } from '../config.js';
import { getSttClient } from './client.js';

let lastWarningAt = 0;

export async function transcribeChunk(wavOrWebm: Buffer, mime: string): Promise<string> {
  try {
    const client = getSttClient();
    const file = await toFile(wavOrWebm, mime.includes('webm') ? 'chunk.webm' : 'chunk.wav', { type: mime });
    const result = await client.audio.transcriptions.create({ file, model: config.STT_MODEL });
    return result.text;
  } catch (error) {
    const now = Date.now();
    if (now - lastWarningAt >= 60_000) {
      lastWarningAt = now;
      console.warn('Speech transcription is unavailable; referee will continue without this transcript.', error);
    }
    return '';
  }
}
