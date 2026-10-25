import { toFile } from 'openai/uploads';
import { config } from '../config.js';
import { getOpenAIClient } from './openai.js';

let fallbackSelected = false;

export async function transcribeChunk(wavOrWebm: Buffer, mime: string): Promise<string> {
  const client = getOpenAIClient();
  const configuredModel = config.OPENAI_STT_MODEL || 'whisper-1';
  const file = await toFile(wavOrWebm, mime.includes('webm') ? 'chunk.webm' : 'chunk.wav', { type: mime });
  const model = fallbackSelected ? 'whisper-1' : configuredModel;
  try {
    const result = await client.audio.transcriptions.create({ file, model });
    return result.text;
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    if (status !== 404 || model === 'whisper-1') throw error;
    fallbackSelected = true;
    const fallback = await client.audio.transcriptions.create({ file, model: 'whisper-1' });
    return fallback.text;
  }
}
