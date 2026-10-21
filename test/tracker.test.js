import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { FEATURES } from '../src/device.js';
import {
  applyEvent,
  buildStates,
  initialState,
  isTracking,
  nextAlarmText,
  resetState,
} from '../src/tracker.js';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 21, 21, 0); // 23:00 in Paris

function play(events, start = initialState()) {
  let state = start;
  let last;
  for (const [event, at, value1 = null, value2 = null] of events) {
    last = applyEvent(state, { event, value1, value2, value3: null }, at);
    state = last.state;
  }
  return { state, last };
}

test('a night: started, phases, stopped gives the slept duration', () => {
  const { state, last } = play([
    ['sleep_tracking_started', T0],
    ['light_sleep', T0 + 0.5 * HOUR],
    ['deep_sleep', T0 + 1 * HOUR],
    ['rem', T0 + 3 * HOUR],
    ['sleep_tracking_stopped', T0 + 7.5 * HOUR],
  ]);
  assert.equal(last.durationHours, 7.5);
  assert.equal(state.lastSleepHours, 7.5);
  assert.equal(state.tracking, false);
  assert.equal(state.phase, 'awake');
  assert.ok(last.changed.includes(FEATURES.LAST_SLEEP_DURATION));
  assert.ok(last.changed.includes(FEATURES.TRACKING));
});

test('a pause is not counted as sleep, and the tracking reads off meanwhile', () => {
  const { state: paused } = play([
    ['sleep_tracking_started', T0],
    ['sleep_tracking_paused', T0 + 2 * HOUR],
  ]);
  assert.equal(isTracking(paused), false);
  const { last } = play(
    [
      ['sleep_tracking_resumed', T0 + 2.5 * HOUR],
      ['sleep_tracking_stopped', T0 + 8 * HOUR],
    ],
    paused,
  );
  assert.equal(last.durationHours, 7.5);
});

test('a session stopped while paused stops counting at the pause', () => {
  const { last } = play([
    ['sleep_tracking_started', T0],
    ['sleep_tracking_paused', T0 + 6 * HOUR],
    ['sleep_tracking_stopped', T0 + 7 * HOUR],
  ]);
  assert.equal(last.durationHours, 6);
});

test('a stop without a known start gives no duration', () => {
  const { last } = play([['sleep_tracking_stopped', T0]]);
  assert.equal(last.durationHours, null);
  assert.ok(!last.changed.includes(FEATURES.LAST_SLEEP_DURATION));
});

test('a resume after a missed start opens the session there', () => {
  const { state } = play([['sleep_tracking_resumed', T0]]);
  assert.equal(isTracking(state), true);
  assert.equal(state.trackingSince, T0);
});

test('the alarm rings, is snoozed, rings again and is dismissed', () => {
  const ring = String(T0 + 8 * HOUR);
  const snoozeEnd = String(T0 + 8 * HOUR + 600_000);
  let { state, last } = play([
    ['alarm_rescheduled', T0, ring, 'Work'],
    ['alarm_alert_start', T0 + 8 * HOUR, ring, 'Work'],
  ]);
  assert.equal(state.alarmRinging, true);
  assert.ok(last.changed.includes(FEATURES.ALARM_RINGING));
  ({ state } = play([['alarm_snooze_clicked', T0 + 8 * HOUR + 60_000, snoozeEnd, 'Work']], state));
  assert.equal(state.alarmRinging, false);
  assert.equal(state.nextAlarm.at, Number(snoozeEnd));
  ({ state } = play([['alarm_alert_dismiss', T0 + 8.2 * HOUR]], state));
  assert.equal(state.alarmRinging, false);
});

test('a reschedule without a time means no alarm left', () => {
  const { state } = play([
    ['alarm_rescheduled', T0, String(T0 + HOUR), null],
    ['alarm_rescheduled', T0 + 1],
  ]);
  assert.equal(state.nextAlarm, null);
  assert.equal(nextAlarmText(state, 'Europe/Paris'), '—');
});

test('the next alarm is written in the configured time zone', () => {
  const { state } = play([['alarm_rescheduled', T0, String(Date.UTC(2026, 9, 22, 5, 30)), 'Work']]);
  assert.equal(nextAlarmText(state, 'Europe/Paris'), '2026-10-22 07:30 · Work');
  assert.equal(nextAlarmText(state, 'America/Montreal'), '2026-10-22 01:30 · Work');
  assert.equal(nextAlarmText(state, 'Nowhere/Land'), '2026-10-22 05:30 · Work');
});

test('only the features that changed are published', () => {
  const { state, last } = play([['sound_event_snore', T0]]);
  assert.deepEqual(last.changed, [FEATURES.LAST_EVENT]);
  const gladys = createFakeGladys();
  assert.deepEqual(buildStates(gladys, 'alice', state, last.changed, 'UTC'), [
    {
      device_feature_external_id: 'ext:test-integration:sleeper:alice:last-event',
      text: 'sound_event_snore',
    },
  ]);
});

test('every feature has a value once a night has been tracked', () => {
  const { state } = play([
    ['sleep_tracking_started', T0],
    ['deep_sleep', T0 + HOUR],
    ['sleep_tracking_stopped', T0 + 2 * HOUR],
  ]);
  const gladys = createFakeGladys();
  const states = buildStates(gladys, 'alice', state, Object.values(FEATURES), 'UTC');
  assert.equal(states.length, Object.values(FEATURES).length);
  // Before any night, there is no duration to publish.
  assert.equal(
    buildStates(gladys, 'alice', initialState(), Object.values(FEATURES), 'UTC').length,
    Object.values(FEATURES).length - 1,
  );
});

test('a reset ends everything running and keeps the next alarm', () => {
  const { state } = play([
    ['alarm_rescheduled', T0, String(T0 + 8 * HOUR)],
    ['sleep_tracking_started', T0],
    ['deep_sleep', T0 + HOUR],
    ['alarm_alert_start', T0 + 8 * HOUR],
  ]);
  const reset = resetState(state);
  assert.equal(isTracking(reset), false);
  assert.equal(reset.alarmRinging, false);
  assert.equal(reset.phase, 'awake');
  assert.deepEqual(reset.nextAlarm, state.nextAlarm);
});
