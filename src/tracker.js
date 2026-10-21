// -----------------------------------------------------------------------------
// What a sleeper is doing, rebuilt from the events of the app.
//
// Sleep as Android sends events, not states: "tracking started", "deep
// sleep", "alarm ringing". This module keeps the state they add up to (is the
// tracking on, which phase, is the alarm ringing, when is the next one) and
// says which device features an event changed. It is pure — no Gladys, no
// clock of its own — so every transition is tested without timers.
// -----------------------------------------------------------------------------

import { EVENTS, PHASE_VALUES, alarmTime } from './events.js';
import { FEATURES, sleeperIds } from './device.js';
import { formatDateTime } from './time.js';

/** The state of a sleeper nobody heard from yet. */
export function initialState() {
  return {
    tracking: false,
    trackingSince: null,
    pausedSince: null,
    pausedMs: 0,
    phase: null,
    alarmRinging: false,
    nextAlarm: null,
    lastEvent: null,
    lastEventAt: null,
    lastSleepHours: null,
  };
}

/** Whether the tracking is running right now (a pause is not). */
export function isTracking(state) {
  return state.tracking && state.pausedSince === null;
}

function trackedMs(state, now) {
  if (state.trackingSince === null) {
    return null;
  }
  const paused = state.pausedMs + (state.pausedSince !== null ? now - state.pausedSince : 0);
  return Math.max(0, now - state.trackingSince - paused);
}

/**
 * Apply one event.
 * @param {ReturnType<typeof initialState>} previous
 * @param {{ event: string, value1: string|null, value2: string|null }} payload
 * @param {number} now Unix milliseconds
 * @returns {{ state: object, changed: string[], durationHours: number|null }}
 *   the new state, the FEATURES whose value changed, and the length of the
 *   session a `sleep_tracking_stopped` closed (null otherwise)
 */
export function applyEvent(previous, { event, value1, value2 }, now) {
  const state = { ...previous, lastEvent: event, lastEventAt: now };
  let durationHours = null;
  const nextAlarmFrom = () => {
    const at = alarmTime(value1);
    return at === null ? null : { at, label: value2 ?? null };
  };

  switch (event) {
    case 'sleep_tracking_started':
      Object.assign(state, {
        tracking: true,
        trackingSince: now,
        pausedSince: null,
        pausedMs: 0,
        phase: 'awake',
      });
      break;
    case 'sleep_tracking_paused':
      if (state.tracking && state.pausedSince === null) {
        state.pausedSince = now;
      }
      break;
    case 'sleep_tracking_resumed':
      if (!state.tracking) {
        // The start was missed (Gladys or the integration was down): the
        // session counts from here.
        Object.assign(state, { tracking: true, trackingSince: now, pausedMs: 0 });
      } else if (state.pausedSince !== null) {
        state.pausedMs += now - state.pausedSince;
      }
      state.pausedSince = null;
      break;
    case 'sleep_tracking_stopped': {
      const ms = trackedMs(state, now);
      if (ms !== null) {
        durationHours = Math.round((ms / 3_600_000) * 100) / 100;
        state.lastSleepHours = durationHours;
      }
      Object.assign(state, {
        tracking: false,
        trackingSince: null,
        pausedSince: null,
        pausedMs: 0,
        phase: 'awake',
      });
      break;
    }
    case 'alarm_alert_start':
      state.alarmRinging = true;
      break;
    case 'alarm_alert_dismiss':
    case 'alarm_snooze_canceled':
      state.alarmRinging = false;
      break;
    case 'alarm_snooze_clicked':
      // value1 is when it rings again.
      state.alarmRinging = false;
      state.nextAlarm = nextAlarmFrom() ?? state.nextAlarm;
      break;
    case 'alarm_rescheduled':
      // No value1: the user has no alarm left.
      state.nextAlarm = nextAlarmFrom();
      break;
    case 'show_skip_next_alarm':
      state.nextAlarm = nextAlarmFrom() ?? state.nextAlarm;
      break;
    default:
      if (EVENTS[event]?.group === 'phase') {
        state.phase = event;
      }
  }

  const changed = [FEATURES.LAST_EVENT];
  if (isTracking(state) !== isTracking(previous)) {
    changed.push(FEATURES.TRACKING);
  }
  if (phaseValue(state) !== phaseValue(previous)) {
    changed.push(FEATURES.SLEEP_PHASE);
  }
  if (state.alarmRinging !== previous.alarmRinging) {
    changed.push(FEATURES.ALARM_RINGING);
  }
  if (JSON.stringify(state.nextAlarm) !== JSON.stringify(previous.nextAlarm)) {
    changed.push(FEATURES.NEXT_ALARM);
  }
  if (durationHours !== null) {
    changed.push(FEATURES.LAST_SLEEP_DURATION);
  }
  return { state, changed, durationHours };
}

/**
 * Put the sleeper back to "awake, nothing running" — the phone died during
 * the night, or the user wants a clean slate. The next alarm is kept: it is
 * still scheduled on the phone.
 */
export function resetState(previous) {
  return {
    ...previous,
    tracking: false,
    trackingSince: null,
    pausedSince: null,
    pausedMs: 0,
    phase: 'awake',
    alarmRinging: false,
  };
}

function phaseValue(state) {
  return PHASE_VALUES[state.phase] ?? 0;
}

/** The next alarm as the text feature shows it. */
export function nextAlarmText(state, timeZone) {
  if (!state.nextAlarm) {
    return '—';
  }
  const when = formatDateTime(state.nextAlarm.at, timeZone);
  return state.nextAlarm.label ? `${when} · ${state.nextAlarm.label}` : when;
}

/**
 * The `publishStates` entries of some features of a sleeper.
 * @param {object} gladys
 * @param {string} sleeperId
 * @param {object} state
 * @param {string[]} features FEATURES values; all of them by default
 * @param {string} timeZone
 */
export function buildStates(gladys, sleeperId, state, features, timeZone) {
  const ids = sleeperIds(gladys, sleeperId);
  const values = {
    [FEATURES.TRACKING]: { state: isTracking(state) ? 1 : 0 },
    [FEATURES.SLEEP_PHASE]: { state: phaseValue(state) },
    [FEATURES.ALARM_RINGING]: { state: state.alarmRinging ? 1 : 0 },
    [FEATURES.NEXT_ALARM]: { text: nextAlarmText(state, timeZone) },
    [FEATURES.LAST_EVENT]: { text: state.lastEvent ?? '—' },
    [FEATURES.LAST_SLEEP_DURATION]:
      state.lastSleepHours === null ? null : { state: state.lastSleepHours },
  };
  return features
    .filter((feature) => values[feature])
    .map((feature) => ({ device_feature_external_id: ids.feature(feature), ...values[feature] }));
}
