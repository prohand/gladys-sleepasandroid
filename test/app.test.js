// The whole integration through the SDK's fake Gladys: what Gladys receives
// when the phone sends events by MQTT or by the Gladys Plus webhook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { registerHandlers } from '../src/app.js';
import { createFakeSubscriberFactory } from './helpers/fakeSubscriber.js';
import { createMemoryStore } from './helpers/memoryStore.js';

const WEBHOOK_URL = 'https://api.gladysgateway.com/v1/api/webhook/abc123';
const ALICE = 'ext:test-integration:sleeper:alice';
const BOB = 'ext:test-integration:sleeper:bob';

async function start({ config = {}, webhooks = true, now } = {}) {
  const gladys = createFakeGladys({
    config: { sleepers: 'Alice, Bob', mqtt_url: 'mqtt://192.168.1.10', ...config },
    webhooks: webhooks
      ? {
          available: true,
          webhooks: [{ key: 'events', mode: 'fire_and_forget', url: WEBHOOK_URL }],
        }
      : { available: false, webhooks: [] },
  });
  const createSubscriber = createFakeSubscriberFactory();
  const store = createMemoryStore();
  let clock = Date.UTC(2026, 9, 21, 21, 0);
  const service = registerHandlers(gladys, {
    store,
    createSubscriber,
    now: now ?? (() => clock),
  });
  await gladys.connect();
  return {
    gladys,
    service,
    store,
    mqtt: createSubscriber.last(),
    createSubscriber,
    advance: (ms) => {
      clock += ms;
    },
  };
}

test('connecting publishes one device per sleeper and a ready status', async () => {
  const { gladys, mqtt } = await start();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => [d.name, d.external_id]),
    [
      ['Sleep as Android — Alice', ALICE],
      ['Sleep as Android — Bob', BOB],
    ],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(mqtt.options.filters, ['SleepAsAndroid', 'SleepAsAndroid/+']);
  assert.equal(mqtt.started, true);
  // The webhook is up, MQTT not yet: cloud, degraded (local is preferred).
  const badge = gladys.fake.transports.find((t) => t.device_external_id === ALICE);
  assert.equal(badge.transport, 'cloud');
  assert.equal(badge.degraded, true);
});

test('an MQTT event updates the device and fires the scene triggers', async () => {
  const { gladys, service, mqtt } = await start();
  mqtt.up();
  mqtt.deliver('SleepAsAndroid/bob', { event: 'sleep_tracking_started' });
  await service.queue;

  assert.equal(gladys.fake.lastState(`${BOB}:tracking`), 1);
  assert.equal(gladys.fake.lastState(`${BOB}:sleep-phase`), 0);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    ['tracking_changed', 'any_event'],
  );
  assert.deepEqual(gladys.fake.sceneEvents[0].data, {
    device: BOB,
    sleeper: 'Bob',
    state: 'started',
    duration_hours: null,
  });
  assert.ok(gladys.fake.widgetRefreshes.includes('sleep'));
  const badge = gladys.fake.transports.findLast((t) => t.device_external_id === BOB);
  assert.equal(badge.transport, 'local');
});

test('the bare topic and a URL without sleeper go to the first sleeper', async () => {
  const { gladys, service, mqtt } = await start();
  mqtt.deliver('SleepAsAndroid', { event: 'deep_sleep' });
  await gladys.fake.webhook('events', { method: 'POST', body: { event: 'sound_event_snore' } });
  await service.queue;
  assert.equal(gladys.fake.lastState(`${ALICE}:sleep-phase`), 3);
  assert.deepEqual(
    gladys.fake.sceneEvents.filter((e) => e.key === 'sound_detected').map((e) => e.data.sleeper),
    ['Alice'],
  );
});

test('a webhook with ?sleeper= reaches that sleeper; an unknown one is ignored', async () => {
  const { gladys, service } = await start();
  await gladys.fake.webhook('events', {
    query: { sleeper: 'bob' },
    body: JSON.stringify({ event: 'alarm_alert_start', value1: '1761112800000', value2: 'Work' }),
  });
  await gladys.fake.webhook('events', { query: { sleeper: 'eve' }, body: { event: 'rem' } });
  await service.queue;
  assert.equal(gladys.fake.lastState(`${BOB}:alarm-ringing`), 1);
  const alarm = gladys.fake.sceneEvents.find((e) => e.key === 'alarm_event');
  assert.deepEqual(alarm.data, {
    device: BOB,
    sleeper: 'Bob',
    event: 'alert_start',
    alarm_time: '2025-10-22 08:00',
    alarm_label: 'Work',
  });
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === 'any_event').length, 1);
});

test('the same event by both channels counts once, a repeat on one channel twice', async () => {
  const { gladys, service, mqtt, advance } = await start();
  mqtt.deliver('SleepAsAndroid', { event: 'sound_event_snore' });
  await gladys.fake.webhook('events', { body: { event: 'sound_event_snore' } });
  advance(2_000);
  mqtt.deliver('SleepAsAndroid', { event: 'sound_event_snore' });
  await service.queue;
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === 'sound_detected').length, 2);
  advance(20_000);
  await gladys.fake.webhook('events', { body: { event: 'sound_event_snore' } });
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === 'sound_detected').length, 3);
});

test('a night tracked end to end publishes the slept duration', async () => {
  const { gladys, service, mqtt, advance } = await start();
  mqtt.deliver('SleepAsAndroid', { event: 'sleep_tracking_started' });
  advance(7 * 3_600_000);
  mqtt.deliver('SleepAsAndroid', { event: 'sleep_tracking_stopped' });
  await service.queue;
  assert.equal(gladys.fake.lastState(`${ALICE}:last-sleep-duration`), 7);
  const stopped = gladys.fake.sceneEvents.findLast((e) => e.key === 'tracking_changed');
  assert.equal(stopped.data.duration_hours, 7);
});

test('garbage is ignored and does not stop the next event', async () => {
  const { gladys, service, mqtt } = await start();
  mqtt.emit('message', 'SleepAsAndroid', Buffer.from('not json'));
  mqtt.deliver('Other/topic', { event: 'rem' });
  mqtt.deliver('SleepAsAndroid', { event: 'rem' });
  await service.queue;
  assert.equal(gladys.fake.lastState(`${ALICE}:sleep-phase`), 1);
});

test('a Gladys refusal is logged, the state is still kept', async (t) => {
  const { gladys, service, store, mqtt } = await start();
  t.mock.method(gladys, 'publishStates', async () => {
    throw new Error('429');
  });
  mqtt.deliver('SleepAsAndroid', { event: 'sleep_tracking_started' });
  await service.queue;
  assert.equal(store.get('alice').tracking, true);
});

test('Test the connection gives the topic and the URL of each sleeper', async () => {
  const { gladys, mqtt } = await start();
  mqtt.up();
  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  const { en, fr, de, es } = ack.data.message;
  assert.match(en, /MQTT: connected to mqtt:\/\/192\.168\.1\.10:1883/);
  assert.match(
    en,
    /Alice — topic SleepAsAndroid — URL https:\/\/api\.gladysgateway\.com\S*sleeper=alice/,
  );
  assert.match(en, /Bob — topic SleepAsAndroid\/bob — URL \S*sleeper=bob/);
  assert.ok(fr && de && es);
});

test('without any channel, the status asks for one', async () => {
  const { gladys } = await start({ config: { mqtt_url: '' }, webhooks: false });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Configure an MQTT broker or Gladys Plus/);
  const badge = gladys.fake.transports.findLast((t) => t.device_external_id === ALICE);
  assert.equal(badge.transport, 'unreachable');
});

test('a bad broker address is shown, not thrown', async () => {
  const { gladys, createSubscriber } = await start({ config: { mqtt_url: 'http://x' } });
  assert.equal(createSubscriber.created.length, 0);
  assert.match(gladys.fake.connectionStatus.message.fr, /Adresse du broker MQTT invalide/);
});

test('saving the configuration restarts MQTT only when it changed', async () => {
  const { gladys, createSubscriber, mqtt } = await start();
  await gladys.fake.configUpdated({ ...gladys.fake.config, time_zone: 'Europe/Berlin' });
  assert.equal(createSubscriber.created.length, 1);
  await gladys.fake.configUpdated({ ...gladys.fake.config, mqtt_topic: 'saa' });
  assert.equal(createSubscriber.created.length, 2);
  assert.equal(mqtt.stopped, true);
  assert.deepEqual(createSubscriber.last().options.filters, ['saa', 'saa/+']);
});

test('Gladys Plus linked later moves the badge to cloud', async () => {
  const { gladys } = await start({ config: { mqtt_url: '' }, webhooks: false });
  await gladys.fake.webhookUpdated({
    available: true,
    webhooks: [{ key: 'events', mode: 'fire_and_forget', url: WEBHOOK_URL }],
  });
  const badge = gladys.fake.transports.findLast((t) => t.device_external_id === ALICE);
  assert.equal(badge.transport, 'cloud');
  assert.equal(badge.degraded, undefined);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('Simulate an event plays it for real, without moving the badge', async () => {
  const { gladys } = await start();
  const ack = await gladys.fake.action('simulate_event', {
    device: BOB,
    event: 'alarm_alert_start',
  });
  assert.match(ack.data.message.en, /"Alarm ringing" played for Bob/);
  assert.equal(gladys.fake.lastState(`${BOB}:alarm-ringing`), 1);
  assert.ok(gladys.fake.sceneEvents.some((e) => e.key === 'alarm_event'));
  const unknown = await gladys.fake.action('simulate_event', { device: 'nope', event: 'rem' });
  assert.match(unknown.data.message.en, /Unknown/);
});

test('the scene actions read and reset a sleeper', async () => {
  const { gladys, service, mqtt } = await start();
  mqtt.deliver('SleepAsAndroid/bob', { event: 'sleep_tracking_started' });
  mqtt.deliver('SleepAsAndroid/bob', { event: 'deep_sleep' });
  await service.queue;

  const status = await gladys.fake.sceneAction('get_sleep_status', { device: BOB });
  assert.deepEqual(status.data.outputs, {
    tracking: true,
    phase: 'deep_sleep',
    alarm_ringing: false,
    next_alarm: '',
    last_event: 'deep_sleep',
    last_sleep_hours: 0,
  });

  const events = gladys.fake.sceneEvents.length;
  const reset = await gladys.fake.sceneAction('reset_sleeper', { device: BOB });
  assert.deepEqual(reset.data.outputs, { reset: true });
  assert.equal(gladys.fake.lastState(`${BOB}:tracking`), 0);
  // No scene event in answer to a scene action: it would loop.
  assert.equal(gladys.fake.sceneEvents.length, events);

  const missing = await gladys.fake.sceneAction('get_sleep_status', { device: 'nope' });
  assert.equal(missing.success, false);
});

test('the widget renders as sent, for the chosen or the first sleeper', async () => {
  const { gladys, service, mqtt } = await start();
  mqtt.up();
  mqtt.deliver('SleepAsAndroid', {
    event: 'alarm_rescheduled',
    value1: String(Date.UTC(2026, 9, 22, 5, 30)),
    value2: 'Work',
  });
  await service.queue;

  for (const settings of [{}, { device: BOB }]) {
    const ack = await gladys.fake.widgetGet('sleep', { settings });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
  }
  const { content } = (await gladys.fake.widgetGet('sleep')).data;
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.equal(rows[1].value, '2026-10-22 07:30 · Work');
  assert.equal(rows[3].value, 'MQTT');
  const chart = content.components.find((c) => c.type === 'chart');
  assert.deepEqual(chart.device_features, [`${ALICE}:sleep-phase`]);

  const gone = await gladys.fake.widgetGet('sleep', {
    settings: { device: 'ext:test-integration:sleeper:eve' },
  });
  assert.deepEqual(validateWidgetContent(gone.data.content), []);
});

test('the widget Reset button resets the sleeper', async () => {
  const { gladys, service, mqtt } = await start();
  mqtt.deliver('SleepAsAndroid', { event: 'alarm_alert_start' });
  await service.queue;
  const ack = await gladys.fake.widgetAction('sleep', 'reset', { device: ALICE });
  assert.equal(ack.success, true);
  assert.equal(gladys.fake.lastState(`${ALICE}:alarm-ringing`), 0);
  const unknown = await gladys.fake.widgetAction('sleep', 'dance', {});
  assert.equal(unknown.success, false);
});
