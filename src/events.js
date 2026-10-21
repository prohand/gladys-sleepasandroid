// -----------------------------------------------------------------------------
// What Sleep as Android sends, and how to read it.
//
// Every event, whatever the channel (MQTT or webhook), is one flat JSON
// object: `{ "event": "<name>", "value1": "...", "value2": "...", "value3": "..." }`.
// The values are strings, and only some events carry them: the alarm events
// put the alarm time (Unix milliseconds) in value1 and its label in value2.
//
// The catalog below sorts the events into the groups the scene triggers are
// built on. The option value of each event in a trigger (`key`) is shorter than
// the raw name and, like every key users store in a scene, never changes.
// -----------------------------------------------------------------------------

export const EVENT_GROUPS = {
  TRACKING: 'tracking',
  ALARM: 'alarm',
  PHASE: 'phase',
  SOUND: 'sound',
  OTHER: 'other',
};

/**
 * raw event name -> { group, key, label }. Labels are the option labels of the
 * scene trigger filters and the texts of the widget, in every language.
 */
export const EVENTS = {
  sleep_tracking_started: {
    group: 'tracking',
    key: 'started',
    label: {
      en: 'Tracking started',
      fr: 'Suivi démarré',
      de: 'Aufzeichnung gestartet',
      es: 'Seguimiento iniciado',
    },
  },
  sleep_tracking_stopped: {
    group: 'tracking',
    key: 'stopped',
    label: {
      en: 'Tracking stopped',
      fr: 'Suivi arrêté',
      de: 'Aufzeichnung beendet',
      es: 'Seguimiento detenido',
    },
  },
  sleep_tracking_paused: {
    group: 'tracking',
    key: 'paused',
    label: {
      en: 'Tracking paused',
      fr: 'Suivi en pause',
      de: 'Aufzeichnung pausiert',
      es: 'Seguimiento en pausa',
    },
  },
  sleep_tracking_resumed: {
    group: 'tracking',
    key: 'resumed',
    label: {
      en: 'Tracking resumed',
      fr: 'Suivi repris',
      de: 'Aufzeichnung fortgesetzt',
      es: 'Seguimiento reanudado',
    },
  },
  alarm_alert_start: {
    group: 'alarm',
    key: 'alert_start',
    label: {
      en: 'Alarm ringing',
      fr: 'Le réveil sonne',
      de: 'Wecker klingelt',
      es: 'La alarma suena',
    },
  },
  alarm_alert_dismiss: {
    group: 'alarm',
    key: 'alert_dismiss',
    label: {
      en: 'Alarm dismissed',
      fr: 'Réveil arrêté',
      de: 'Wecker ausgeschaltet',
      es: 'Alarma desactivada',
    },
  },
  alarm_snooze_clicked: {
    group: 'alarm',
    key: 'snooze_clicked',
    label: { en: 'Snooze', fr: 'Répétition (snooze)', de: 'Schlummern', es: 'Posponer' },
  },
  alarm_snooze_canceled: {
    group: 'alarm',
    key: 'snooze_canceled',
    label: {
      en: 'Snooze canceled',
      fr: 'Répétition annulée',
      de: 'Schlummern abgebrochen',
      es: 'Posponer cancelado',
    },
  },
  alarm_skip_next: {
    group: 'alarm',
    key: 'skip_next',
    label: {
      en: 'Next alarm skipped',
      fr: 'Prochain réveil sauté',
      de: 'Nächster Wecker übersprungen',
      es: 'Próxima alarma omitida',
    },
  },
  alarm_rescheduled: {
    group: 'alarm',
    key: 'rescheduled',
    label: {
      en: 'Alarm rescheduled',
      fr: 'Réveil reprogrammé',
      de: 'Wecker neu geplant',
      es: 'Alarma reprogramada',
    },
  },
  alarm_wake_up_check: {
    group: 'alarm',
    key: 'wake_up_check',
    label: {
      en: 'Wake-up check',
      fr: 'Vérification du réveil',
      de: 'Aufwach-Kontrolle',
      es: 'Comprobación de despertar',
    },
  },
  time_to_bed_alarm_alert: {
    group: 'alarm',
    key: 'time_to_bed',
    label: {
      en: 'Time to bed',
      fr: "C'est l'heure d'aller au lit",
      de: 'Zeit fürs Bett',
      es: 'Hora de acostarse',
    },
  },
  show_skip_next_alarm: {
    group: 'alarm',
    key: 'show_skip_next',
    label: {
      en: 'Alarm coming soon',
      fr: 'Réveil bientôt',
      de: 'Wecker bald',
      es: 'Alarma próxima',
    },
  },
  before_smart_period: {
    group: 'alarm',
    key: 'before_smart_period',
    label: {
      en: 'Smart wake-up soon',
      fr: 'Réveil intelligent bientôt',
      de: 'Smartes Wecken bald',
      es: 'Despertar inteligente pronto',
    },
  },
  smart_period: {
    group: 'alarm',
    key: 'smart_period',
    label: {
      en: 'Smart wake-up started',
      fr: 'Réveil intelligent commencé',
      de: 'Smartes Wecken begonnen',
      es: 'Despertar inteligente iniciado',
    },
  },
  awake: {
    group: 'phase',
    key: 'awake',
    label: { en: 'Awake', fr: 'Éveillé', de: 'Wach', es: 'Despierto' },
  },
  not_awake: {
    group: 'phase',
    key: 'not_awake',
    label: { en: 'Fell asleep', fr: 'Endormi', de: 'Eingeschlafen', es: 'Dormido' },
  },
  light_sleep: {
    group: 'phase',
    key: 'light_sleep',
    label: { en: 'Light sleep', fr: 'Sommeil léger', de: 'Leichter Schlaf', es: 'Sueño ligero' },
  },
  deep_sleep: {
    group: 'phase',
    key: 'deep_sleep',
    label: { en: 'Deep sleep', fr: 'Sommeil profond', de: 'Tiefschlaf', es: 'Sueño profundo' },
  },
  rem: {
    group: 'phase',
    key: 'rem',
    label: { en: 'REM sleep', fr: 'Sommeil paradoxal', de: 'REM-Schlaf', es: 'Sueño REM' },
  },
  sound_event_snore: {
    group: 'sound',
    key: 'snore',
    label: { en: 'Snoring', fr: 'Ronflement', de: 'Schnarchen', es: 'Ronquido' },
  },
  sound_event_talk: {
    group: 'sound',
    key: 'talk',
    label: { en: 'Sleep talking', fr: 'Parole', de: 'Sprechen', es: 'Habla' },
  },
  sound_event_cough: {
    group: 'sound',
    key: 'cough',
    label: { en: 'Cough', fr: 'Toux', de: 'Husten', es: 'Tos' },
  },
  sound_event_baby: {
    group: 'sound',
    key: 'baby',
    label: { en: 'Baby crying', fr: 'Bébé qui pleure', de: 'Baby weint', es: 'Bebé llorando' },
  },
  sound_event_laugh: {
    group: 'sound',
    key: 'laugh',
    label: { en: 'Laughter', fr: 'Rire', de: 'Lachen', es: 'Risa' },
  },
  apnea_alarm: {
    group: 'sound',
    key: 'apnea_alarm',
    label: {
      en: 'Breathing alert (apnea)',
      fr: 'Alerte respiration (apnée)',
      de: 'Atemalarm (Apnoe)',
      es: 'Alerta de respiración (apnea)',
    },
  },
  antisnoring: {
    group: 'sound',
    key: 'antisnoring',
    label: {
      en: 'Anti-snoring triggered',
      fr: 'Anti-ronflement déclenché',
      de: 'Anti-Schnarchen ausgelöst',
      es: 'Antirronquidos activado',
    },
  },
  lullaby_start: {
    group: 'other',
    key: 'lullaby_start',
    label: {
      en: 'Lullaby started',
      fr: 'Berceuse lancée',
      de: 'Schlaflied gestartet',
      es: 'Nana iniciada',
    },
  },
  lullaby_stop: {
    group: 'other',
    key: 'lullaby_stop',
    label: {
      en: 'Lullaby stopped',
      fr: 'Berceuse arrêtée',
      de: 'Schlaflied beendet',
      es: 'Nana detenida',
    },
  },
  lullaby_volume_down: {
    group: 'other',
    key: 'lullaby_volume_down',
    label: {
      en: 'Lullaby volume down',
      fr: 'Volume de la berceuse baissé',
      de: 'Schlaflied leiser',
      es: 'Volumen de la nana bajado',
    },
  },
  jet_lag_start: {
    group: 'other',
    key: 'jet_lag_start',
    label: {
      en: 'Jet lag prevention started',
      fr: 'Anti-décalage horaire démarré',
      de: 'Jetlag-Vorbeugung gestartet',
      es: 'Prevención del jet lag iniciada',
    },
  },
  jet_lag_stop: {
    group: 'other',
    key: 'jet_lag_stop',
    label: {
      en: 'Jet lag prevention stopped',
      fr: 'Anti-décalage horaire arrêté',
      de: 'Jetlag-Vorbeugung beendet',
      es: 'Prevención del jet lag detenida',
    },
  },
};

/** The events of one group, in catalog order. */
export function eventsOfGroup(group) {
  return Object.entries(EVENTS)
    .filter(([, event]) => event.group === group)
    .map(([name, event]) => ({ name, ...event }));
}

/**
 * The sleep phase as a number, so Gladys can draw the night as a hypnogram:
 * the deeper the sleep, the higher the value. `not_awake` is the app saying
 * "asleep again" without naming the stage: light sleep is its closest reading.
 */
export const PHASE_VALUES = {
  awake: 0,
  rem: 1,
  not_awake: 2,
  light_sleep: 2,
  deep_sleep: 3,
};

/** Value -> the phase it stands for, for the texts. */
export const PHASE_NAMES = ['awake', 'rem', 'light_sleep', 'deep_sleep'];

const EVENT_NAME = /^[a-z0-9_]{1,64}$/;

/**
 * Read an event payload as it reaches either channel: a parsed object (the
 * Gladys Plus relay already decoded the JSON), a JSON string or Buffer (MQTT),
 * or a form-encoded body (a webhook relay that kept it raw).
 * @param {unknown} body
 * @returns {{ event: string, value1: string|null, value2: string|null, value3: string|null } | null}
 *   null when it is not a Sleep as Android event
 */
export function parsePayload(body) {
  let data = body;
  if (Buffer.isBuffer(data)) {
    data = data.toString('utf8');
  }
  if (typeof data === 'string') {
    const text = data.trim();
    if (text.startsWith('{')) {
      try {
        data = JSON.parse(text);
      } catch {
        return null;
      }
    } else if (text.includes('event=')) {
      data = Object.fromEntries(new URLSearchParams(text));
    } else {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const event = String(data.event ?? '').trim();
  if (!EVENT_NAME.test(event)) {
    return null;
  }
  const value = (raw) =>
    raw === undefined || raw === null || raw === '' ? null : String(raw).slice(0, 500);
  return {
    event,
    value1: value(data.value1),
    value2: value(data.value2),
    value3: value(data.value3),
  };
}

/**
 * The alarm time an alarm event carries in value1 (Unix milliseconds), or null.
 * @param {string|null} value1
 */
export function alarmTime(value1) {
  if (!value1 || !/^\d{10,14}$/.test(value1)) {
    return null;
  }
  const ms = Number(value1);
  // Seconds would land in 1970: a 10-digit value is read as seconds.
  return value1.length <= 10 ? ms * 1000 : ms;
}
