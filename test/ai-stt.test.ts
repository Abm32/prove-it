import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTranscript } from '../src/ai/stt.js';

test('normalizes whitespace and punctuation-only transcription to empty text', () => {
  assert.equal(normalizeTranscript(' .'), '');
  assert.equal(normalizeTranscript('   ...   '), '');
  assert.equal(normalizeTranscript('  café 42!  '), 'café 42!');
});
