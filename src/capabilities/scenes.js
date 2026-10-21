// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// Triggers say "this happened": the app tracked, rang, heard a snore. Each one
// is declared in the manifest `scene_triggers` field and fired with
// `gladys.publishSceneEvent(key, data)`; `data` carries ONLY the keys declared
// as `fields` (the filters the scene author sets) and `variables` (what the
// following actions read as {{triggerEvent.data.<key>}}) — test/manifest.test.js
// checks it.
//
// The states (is the tracking on, which phase) stay device features: a scene
// that needs "while tracking" reads the Sleep tracking feature.
//
// Keys are forever: scenes store them.
// -----------------------------------------------------------------------------

import { EVENTS, EVENT_GROUPS, alarmTime } from '../events.js';
import { formatDateTime } from '../time.js';

/** Trigger key -> the group of events it fires on and the name of its filter. */
export const SCENE_TRIGGERS = {
  tracking_changed: { group: EVENT_GROUPS.TRACKING, filter: 'state' },
  alarm_event: { group: EVENT_GROUPS.ALARM, filter: 'event' },
  sleep_phase_changed: { group: EVENT_GROUPS.PHASE, filter: 'phase' },
  sound_detected: { group: EVENT_GROUPS.SOUND, filter: 'sound' },
  // Every event, the lullaby and jet lag ones included, with its raw values.
  any_event: { group: null, filter: null },
};

/**
 * The scene events one app event fires: its themed trigger, plus `any_event`.
 * @param {object} context
 * @param {string} context.device the sleeper's device external_id
 * @param {string} context.sleeper the sleeper's name
 * @param {{ event: string, value1: string|null, value2: string|null, value3: string|null }} context.payload
 * @param {number|null} context.durationHours set when a session just ended
 * @param {string} context.timeZone
 * @returns {{ key: string, data: Record<string, string|number|boolean|null> }[]}
 */
export function buildSceneEvents({ device, sleeper, payload, durationHours, timeZone }) {
  const events = [];
  const known = EVENTS[payload.event];
  if (known) {
    const [key, trigger] = Object.entries(SCENE_TRIGGERS).find(
      ([, entry]) => entry.group === known.group,
    ) ?? [null, null];
    if (key) {
      const data = { device, sleeper, [trigger.filter]: known.key };
      if (key === 'tracking_changed') {
        data.duration_hours = durationHours;
      }
      if (key === 'alarm_event') {
        const at = alarmTime(payload.value1);
        data.alarm_time = at === null ? null : formatDateTime(at, timeZone);
        data.alarm_label = payload.value2;
      }
      events.push({ key, data });
    }
  }
  events.push({
    key: 'any_event',
    data: {
      device,
      sleeper,
      event: payload.event,
      value1: payload.value1,
      value2: payload.value2,
      value3: payload.value3,
    },
  });
  return events;
}

/**
 * Scene action handlers, keyed like the manifest `scene_actions`. Each one
 * receives the service and the RESOLVED fields, and resolves the declared
 * outputs. They never fire a scene event: a scene bound to it would loop.
 */
export const SCENE_ACTIONS = {
  // Read the sleeper's state into scene variables: "if the tracking is on,
  // dim the lights", "say when the next alarm rings".
  async get_sleep_status(service, { fields }) {
    const status = service.statusOf(fields.device);
    if (!status) {
      throw new Error(`Unknown sleeper device: ${fields.device}`);
    }
    return {
      tracking: status.tracking,
      phase: status.phase,
      alarm_ringing: status.alarmRinging,
      next_alarm: status.nextAlarm,
      last_event: status.lastEvent,
      last_sleep_hours: status.lastSleepHours,
    };
  },

  // The phone died during the night: no "tracking stopped" will ever come.
  async reset_sleeper(service, { fields }) {
    if (!(await service.reset(fields.device))) {
      throw new Error(`Unknown sleeper device: ${fields.device}`);
    }
    return { reset: true };
  },
};
