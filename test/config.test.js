import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  parseBrokerUrl,
  parseSleepers,
  slugify,
} from '../src/config.js';

test('slugify keeps what a user can type in a topic or a URL', () => {
  assert.equal(slugify('Élodie'), 'elodie');
  assert.equal(slugify('  Jean Pierre '), 'jean-pierre');
  assert.equal(slugify('Zoë & Max!'), 'zoe-max');
  assert.equal(slugify('***'), '');
});

test('no sleeper declared means one default sleeper', () => {
  assert.deepEqual(parseSleepers(''), [{ id: 'default', name: 'Sleep as Android' }]);
  assert.deepEqual(parseSleepers(' , ;'), [{ id: 'default', name: 'Sleep as Android' }]);
});

test('sleepers are read from a comma list, duplicates dropped', () => {
  assert.deepEqual(parseSleepers('Alice, Bob; alice\nÉlodie'), [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
    { id: 'elodie', name: 'Élodie' },
  ]);
});

test('the broker address is read however it was typed', () => {
  assert.equal(parseBrokerUrl(''), null);
  assert.deepEqual(parseBrokerUrl('192.168.1.10'), {
    secure: false,
    host: '192.168.1.10',
    port: 1883,
  });
  assert.deepEqual(parseBrokerUrl('tcp://broker.lan:1884'), {
    secure: false,
    host: 'broker.lan',
    port: 1884,
  });
  assert.deepEqual(parseBrokerUrl('ssl://broker.lan'), {
    secure: true,
    host: 'broker.lan',
    port: 8883,
  });
  assert.deepEqual(parseBrokerUrl('mqtt://[fd00::1]:1883'), {
    secure: false,
    host: 'fd00::1',
    port: 1883,
  });
  assert.throws(() => parseBrokerUrl('http://broker.lan'), /unsupported scheme/);
});

test('normalizeConfig fills the defaults and never throws on a bad broker', () => {
  const config = normalizeConfig();
  assert.equal(config.mqtt_topic, DEFAULT_CONFIG.mqtt_topic);
  assert.equal(config.broker, null);
  assert.equal(config.GLADYS_PREFER_LOCAL, true);
  assert.equal(config.sleeperList.length, 1);

  const bad = normalizeConfig({ mqtt_url: 'http://x', mqtt_topic: 'saa/', time_zone: ' ' });
  assert.equal(bad.broker, null);
  assert.match(bad.brokerError, /unsupported scheme/);
  assert.equal(bad.mqtt_topic, 'saa');
  assert.equal(bad.time_zone, 'Europe/Paris');
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: false }).GLADYS_PREFER_LOCAL, false);
});
