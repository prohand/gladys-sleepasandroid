// -----------------------------------------------------------------------------
// The Gladys device of a sleeper.
//
// One device per sleeper declared in the configuration, keyed on the sleeper
// id (`gladys.externalIds('sleeper', id)`). Its features are what the app
// TELLS, read-only: Sleep as Android takes no orders from outside the phone.
// Every feature declares `min`/`max` (NOT NULL in Gladys), text ones included.
//
// Feature keys are stored by Gladys with their history: never rename them.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'sleeper';

export const FEATURES = {
  TRACKING: 'tracking',
  SLEEP_PHASE: 'sleep-phase',
  ALARM_RINGING: 'alarm-ringing',
  NEXT_ALARM: 'next-alarm',
  LAST_EVENT: 'last-event',
  LAST_SLEEP_DURATION: 'last-sleep-duration',
};

/** The ids of one sleeper's device and features. */
export function sleeperIds(gladys, sleeperId) {
  return gladys.externalIds(DEVICE_TYPE, sleeperId);
}

/**
 * The sleeper whose device has this external_id, or undefined.
 * @param {object} gladys
 * @param {{ id: string, name: string }[]} sleepers
 * @param {string} externalId
 */
export function findSleeperByDevice(gladys, sleepers, externalId) {
  return sleepers.find((sleeper) => sleeperIds(gladys, sleeper.id).device === externalId);
}

/**
 * The discovery payload of one sleeper.
 * @param {object} gladys
 * @param {{ id: string, name: string }} sleeper
 */
export function buildDevice(gladys, sleeper) {
  const ids = sleeperIds(gladys, sleeper.id);
  const readOnly = { read_only: true, has_feedback: false };
  return {
    name: sleeper.name === 'Sleep as Android' ? sleeper.name : `Sleep as Android — ${sleeper.name}`,
    external_id: ids.device,
    features: [
      {
        name: 'Sleep tracking',
        external_id: ids.feature(FEATURES.TRACKING),
        category: DEVICE_FEATURE_CATEGORIES.SWITCH,
        type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        ...readOnly,
        keep_history: true,
        min: 0,
        max: 1,
      },
      {
        // 0 awake, 1 REM, 2 light, 3 deep: the deeper, the higher (a
        // hypnogram once drawn as a step line, see src/capabilities/widget.js).
        name: 'Sleep phase',
        external_id: ids.feature(FEATURES.SLEEP_PHASE),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.UNKNOWN.UNKNOWN,
        ...readOnly,
        keep_history: true,
        min: 0,
        max: 3,
      },
      {
        name: 'Alarm ringing',
        external_id: ids.feature(FEATURES.ALARM_RINGING),
        category: DEVICE_FEATURE_CATEGORIES.SWITCH,
        type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        ...readOnly,
        keep_history: true,
        min: 0,
        max: 1,
      },
      {
        name: 'Next alarm',
        external_id: ids.feature(FEATURES.NEXT_ALARM),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        ...readOnly,
        keep_history: false,
        min: 0,
        max: 0,
      },
      {
        name: 'Last event',
        external_id: ids.feature(FEATURES.LAST_EVENT),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        ...readOnly,
        keep_history: true,
        min: 0,
        max: 0,
      },
      {
        name: 'Last sleep duration',
        external_id: ids.feature(FEATURES.LAST_SLEEP_DURATION),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.HOURS,
        ...readOnly,
        keep_history: true,
        min: 0,
        max: 24,
      },
    ],
  };
}
