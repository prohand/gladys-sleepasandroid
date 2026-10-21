import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, PHASE_VALUES, alarmTime, eventsOfGroup, parsePayload } from '../src/events.js';

test('a JSON payload is read from an object, a string or a Buffer', () => {
  const expected = {
    event: 'alarm_alert_start',
    value1: '1761112800000',
    value2: 'Work',
    value3: null,
  };
  const body = { event: 'alarm_alert_start', value1: '1761112800000', value2: 'Work' };
  assert.deepEqual(parsePayload(body), expected);
  assert.deepEqual(parsePayload(JSON.stringify(body)), expected);
  assert.deepEqual(parsePayload(Buffer.from(JSON.stringify(body))), expected);
});

test('a form-encoded body is read too', () => {
  assert.deepEqual(parsePayload('event=rem&value1='), {
    event: 'rem',
    value1: null,
    value2: null,
    value3: null,
  });
});

test('what is not an event is refused', () => {
  assert.equal(parsePayload(null), null);
  assert.equal(parsePayload('{not json'), null);
  assert.equal(parsePayload('hello'), null);
  assert.equal(parsePayload([]), null);
  assert.equal(parsePayload({ value1: 'x' }), null);
  assert.equal(parsePayload({ event: 'DROP TABLE;' }), null);
});

test('numbers sent as numbers become strings, long values are cut', () => {
  const parsed = parsePayload({
    event: 'alarm_rescheduled',
    value1: 1761112800000,
    value2: 'x'.repeat(900),
  });
  assert.equal(parsed.value1, '1761112800000');
  assert.equal(parsed.value2.length, 500);
});

test('the alarm time reads milliseconds, and seconds too', () => {
  assert.equal(alarmTime('1761112800000'), 1761112800000);
  assert.equal(alarmTime('1761112800'), 1761112800000);
  assert.equal(alarmTime(null), null);
  assert.equal(alarmTime('tomorrow'), null);
});

test('every catalog event has a group, a key and four labels', () => {
  const keys = new Set();
  for (const [name, event] of Object.entries(EVENTS)) {
    assert.match(name, /^[a-z_]+$/);
    assert.ok(['tracking', 'alarm', 'phase', 'sound', 'other'].includes(event.group), name);
    assert.ok(!keys.has(`${event.group}:${event.key}`), `duplicate key ${event.key}`);
    keys.add(`${event.group}:${event.key}`);
    assert.deepEqual(Object.keys(event.label), ['en', 'fr', 'de', 'es'], name);
  }
});

test('every phase event has a value for the hypnogram', () => {
  for (const event of eventsOfGroup('phase')) {
    assert.equal(typeof PHASE_VALUES[event.name], 'number', event.name);
  }
});
