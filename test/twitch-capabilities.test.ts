import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilitiesFor } from '../src/twitch/capabilities.js';

test('affiliate and partner channels get paid Twitch surfaces', () => {
  const expected = { channelPoints: true, bits: true, clips: true, polls: true, mode: 'points' };
  assert.deepEqual(capabilitiesFor('affiliate'), expected);
  assert.deepEqual(capabilitiesFor('partner'), expected);
});

test('non-affiliate channels use chat mode without affiliate features', () => {
  assert.deepEqual(capabilitiesFor(''), { channelPoints: false, bits: false, clips: false, polls: false, mode: 'chat' });
});
