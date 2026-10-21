// Routing (which sleeper), transport badges and the state file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeConfig } from '../src/config.js';
import { sleeperForQuery, sleeperForTopic, topicFilters, webhookUrlFor } from '../src/router.js';
import { CHANNELS, transportOf } from '../src/transports.js';
import { StateStore } from '../src/store.js';

const two = normalizeConfig({ sleepers: 'Alice, Bob', mqtt_topic: 'SleepAsAndroid' });

test('topics: the base one is the first sleeper, a sub-topic names one', () => {
  assert.deepEqual(topicFilters(two), ['SleepAsAndroid', 'SleepAsAndroid/+']);
  assert.equal(sleeperForTopic(two, 'SleepAsAndroid').id, 'alice');
  assert.equal(sleeperForTopic(two, 'SleepAsAndroid/Bob').id, 'bob');
  assert.equal(sleeperForTopic(two, 'SleepAsAndroid/eve'), null);
  assert.equal(sleeperForTopic(two, 'Other'), null);
});

test('webhook: no query is the first sleeper, ?sleeper= names one', () => {
  assert.equal(sleeperForQuery(two, undefined).id, 'alice');
  assert.equal(sleeperForQuery(two, { sleeper: '' }).id, 'alice');
  assert.equal(sleeperForQuery(two, { sleeper: 'BOB' }).id, 'bob');
  assert.equal(sleeperForQuery(two, { sleeper: ['bob', 'x'] }).id, 'bob');
  assert.equal(sleeperForQuery(two, { sleeper: 'eve' }), null);
});

test('the URL to type gets ?sleeper= only when there are several sleepers', () => {
  const url = 'https://api.gladysgateway.com/v1/api/webhook/abc?k=1';
  assert.equal(webhookUrlFor(url, normalizeConfig(), { id: 'default' }), url);
  assert.equal(webhookUrlFor(url, two, { id: 'bob' }), `${url}&sleeper=bob`);
});

const status = (overrides) => ({
  preferLocal: true,
  mqttConfigured: true,
  mqttConnected: true,
  webhookAvailable: true,
  lastChannel: null,
  ...overrides,
});

test('the badge follows the channel the events really arrive by', () => {
  assert.deepEqual(transportOf(status()), { transport: 'local' });
  assert.deepEqual(transportOf(status({ preferLocal: false })), { transport: 'cloud' });
  assert.deepEqual(transportOf(status({ lastChannel: CHANNELS.WEBHOOK })), { transport: 'cloud' });
  assert.deepEqual(transportOf(status({ mqttConfigured: false, mqttConnected: false })), {
    transport: 'cloud',
  });
  assert.deepEqual(transportOf(status({ mqttConnected: false, webhookAvailable: false })), {
    transport: 'unreachable',
  });
});

test('local preferred but the broker down: cloud, degraded, with the reason', () => {
  const badge = transportOf(status({ mqttConnected: false, lastChannel: CHANNELS.MQTT }));
  assert.equal(badge.transport, 'cloud');
  assert.equal(badge.degraded, true);
  assert.deepEqual(Object.keys(badge.message), ['en', 'fr', 'de', 'es']);
  for (const text of Object.values(badge.message)) {
    assert.ok(text.length <= 200);
  }
});

test('the state file survives a restart, and a broken one is replaced', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'saa-'));
  try {
    const store = await new StateStore(directory).load();
    store.set('alice', { ...store.get('alice'), tracking: true, trackingSince: 42 });
    await store.flush();
    const again = await new StateStore(directory).load();
    assert.equal(again.get('alice').trackingSince, 42);
    assert.equal(again.get('bob').tracking, false);

    await writeFile(path.join(directory, 'sleepers.json'), '{broken');
    const fresh = await new StateStore(directory).load();
    assert.equal(fresh.get('alice').tracking, false);
    fresh.set('alice', fresh.get('alice'));
    await fresh.flush();
    JSON.parse(await readFile(path.join(directory, 'sleepers.json'), 'utf8'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
