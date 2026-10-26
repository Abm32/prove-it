import assert from 'node:assert/strict';
import test from 'node:test';
import { completeJson, resolveSttKey } from '../src/ai/client.js';

interface Payload { ok: boolean; value: number }
const schema = { name: 'payload', schema: { type: 'object', additionalProperties: false } };
const valid = (value: unknown): value is Payload => !!value && typeof value === 'object'
  && typeof (value as Payload).ok === 'boolean' && typeof (value as Payload).value === 'number';

function stubClient(responses: Array<unknown | Error>, seen: Array<Record<string, unknown>>) {
  return {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => {
          seen.push(params);
          const next = responses.shift();
          if (next instanceof Error) throw next;
          return next;
        },
      },
    },
  };
}

const completion = (content: string) => ({ choices: [{ message: { content } }] });

test('completeJson parses and validates strict json_schema responses', async () => {
  const seen: Array<Record<string, unknown>> = [];
  const value = await completeJson({
    client: stubClient([completion('{"ok":true,"value":7}')], seen),
    model: 'test-model', schema, messages: [{ role: 'system', content: 'Return JSON.' }], validate: valid,
  });
  assert.deepEqual(value, { ok: true, value: 7 });
  assert.deepEqual(seen[0]?.response_format, { type: 'json_schema', json_schema: { name: 'payload', strict: true, schema: schema.schema } });
});

test('completeJson retries schema rejection with json_object and schema guidance', async () => {
  const seen: Array<Record<string, unknown>> = [];
  const value = await completeJson({
    client: stubClient([Object.assign(new Error('Unsupported response_format json_schema'), { status: 400 }), completion('{"ok":true,"value":9}')], seen),
    model: 'test-model', schema, messages: [{ role: 'system', content: 'Return JSON.' }], validate: valid,
  });
  assert.deepEqual(value, { ok: true, value: 9 });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1]?.response_format, { type: 'json_object' });
  assert.match(String((seen[1]?.messages as Array<{ content: string }>)[0]?.content), /matching this schema/);
});

test('completeJson strips fenced JSON before parsing', async () => {
  const value = await completeJson({
    client: stubClient([completion('```json\n{"ok":true,"value":3}\n```')], []),
    model: 'test-model', schema, messages: [{ role: 'system', content: 'Return JSON.' }], validate: valid,
  });
  assert.deepEqual(value, { ok: true, value: 3 });
});

test('completeJson ignores provider-specific extra message fields', async () => {
  const response = completion('{"ok":true,"value":4}');
  response.choices[0]!.message.extra_content = { google: { thought_signature: 'opaque-signature' } };
  const value = await completeJson({
    client: stubClient([response], []),
    model: 'test-model', schema, messages: [{ role: 'system', content: 'Return JSON.' }], validate: valid,
  });
  assert.deepEqual(value, { ok: true, value: 4 });
});

test('completeJson rejects invalid values', async () => {
  await assert.rejects(completeJson({
    client: stubClient([completion('{"ok":true,"value":"bad"}')], []),
    model: 'test-model', schema, messages: [{ role: 'system', content: 'Return JSON.' }], validate: valid,
  }), /returned an invalid result/);
});

test('STT API key falls back to the shared AI key', () => {
  assert.equal(resolveSttKey({ STT_API_KEY: '', AI_API_KEY: 'gemini-key' }), 'gemini-key');
  assert.equal(resolveSttKey({ STT_API_KEY: 'groq-key', AI_API_KEY: 'gemini-key' }), 'groq-key');
});
