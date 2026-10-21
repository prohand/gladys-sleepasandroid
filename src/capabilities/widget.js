// -----------------------------------------------------------------------------
// The "Sleep" dashboard widget (Gladys 5.1+).
//
// One card per sleeper (the `device` setting of the widget instance):
//   - two LIVE tiles bound to the device features (tracking, alarm ringing):
//     they follow the published states with no refresh at all;
//   - the night as a hypnogram: the sleep phase feature drawn as a step line
//     over the last twelve hours (also live, read from the Gladys history);
//   - a status list computed here: phase, next alarm, last night, how the
//     events arrive;
//   - a "Reset" button for the morning after a phone that died at 3 am.
//
// The computed rows change with every event: the service nudges the widget
// (`requestWidgetRefresh`) after each one, the TTL is only a safety net.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { EVENTS } from '../events.js';
import { FEATURES, sleeperIds } from '../device.js';
import { formatHours } from '../time.js';

const logger = createLogger({ name: 'widget' });

/** Widget key, as declared in the manifest `widgets` field. */
export const SLEEP_WIDGET = 'sleep';

const ACTIONS = { RESET: 'reset' };

const PHASE_LABELS = {
  awake: EVENTS.awake.label,
  rem: EVENTS.rem.label,
  light_sleep: EVENTS.light_sleep.label,
  deep_sleep: EVENTS.deep_sleep.label,
};

const NONE = { en: 'None', fr: 'Aucun', de: 'Keiner', es: 'Ninguna' };

function channelRow(channels) {
  const label = { en: 'Events by', fr: 'Événements par', de: 'Ereignisse über', es: 'Eventos por' };
  if (channels.mqttConnected) {
    return { label, icon: 'wifi', value: 'MQTT', color: WIDGET_COLORS.SUCCESS };
  }
  if (channels.webhookAvailable) {
    return {
      label,
      icon: 'cloud',
      value: 'Gladys Plus',
      color: channels.mqttConfigured ? WIDGET_COLORS.WARNING : WIDGET_COLORS.INFO,
    };
  }
  return {
    label,
    icon: 'wifi-off',
    value: { en: 'No channel', fr: 'Aucun canal', de: 'Kein Kanal', es: 'Ningún canal' },
    color: WIDGET_COLORS.DANGER,
  };
}

/**
 * The content of one widget instance.
 * @param {import('../service.js').SleepService} service
 * @param {Record<string, unknown>} settings the instance settings
 */
export function buildWidgetContent(service, settings = {}) {
  const sleepers = service.config.sleeperList;
  const device = settings.device || sleeperIds(service.gladys, sleepers[0].id).device;
  const status = service.statusOf(device);
  if (!status) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'This sleeper is no longer declared: pick another one in the widget settings.',
            fr: "Ce dormeur n'est plus déclaré : choisissez-en un autre dans les réglages du widget.",
            de: 'Dieser Schläfer ist nicht mehr angegeben: Wähle in den Widget-Einstellungen einen anderen.',
            es: 'Este durmiente ya no está declarado: elija otro en los ajustes del widget.',
          },
        },
      ],
    };
  }
  const ids = sleeperIds(service.gladys, status.sleeper.id);
  return {
    ttl_seconds: 600,
    components: [
      {
        type: 'text',
        variant: 'heading',
        text: status.sleeper.name,
      },
      {
        type: 'value',
        label: { en: 'Tracking', fr: 'Suivi', de: 'Aufzeichnung', es: 'Seguimiento' },
        icon: 'moon',
        device_feature: ids.feature(FEATURES.TRACKING),
      },
      {
        type: 'value',
        label: { en: 'Alarm', fr: 'Réveil', de: 'Wecker', es: 'Alarma' },
        icon: 'bell',
        device_feature: ids.feature(FEATURES.ALARM_RINGING),
      },
      {
        type: 'chart',
        title: { en: 'Night', fr: 'Nuit', de: 'Nacht', es: 'Noche' },
        chart_type: 'stepline',
        interval: 'last-twelve-hours',
        device_features: [ids.feature(FEATURES.SLEEP_PHASE)],
      },
      {
        type: 'status',
        items: [
          {
            label: { en: 'Phase', fr: 'Phase', de: 'Phase', es: 'Fase' },
            icon: 'activity',
            value: status.paused
              ? { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' }
              : PHASE_LABELS[status.phase],
            color: status.tracking ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: {
              en: 'Next alarm',
              fr: 'Prochain réveil',
              de: 'Nächster Wecker',
              es: 'Próxima alarma',
            },
            icon: 'clock',
            value: status.nextAlarm || NONE,
            color: status.alarmRinging ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: {
              en: 'Last night',
              fr: 'Dernière nuit',
              de: 'Letzte Nacht',
              es: 'Última noche',
            },
            icon: 'sunrise',
            value: status.lastSleepHours > 0 ? formatHours(status.lastSleepHours) : '—',
            color: WIDGET_COLORS.NEUTRAL,
          },
          channelRow(service.channelStatus()),
        ],
      },
      {
        type: 'button',
        label: { en: 'Reset', fr: 'Réinitialiser', de: 'Zurücksetzen', es: 'Restablecer' },
        icon: 'rotate-ccw',
        style: 'secondary',
        action: { key: ACTIONS.RESET, params: { device: ids.device }, confirm: true },
      },
    ],
  };
}

export const WIDGETS = {
  [SLEEP_WIDGET]: {
    async get(service, { settings }) {
      logger.debug(`onWidgetGet <- ${SLEEP_WIDGET}`);
      return buildWidgetContent(service, settings);
    },

    async action(service, { actionKey, params }) {
      logger.info(`onWidgetAction <- ${SLEEP_WIDGET}.${actionKey}`);
      if (actionKey === ACTIONS.RESET) {
        if (!(await service.reset(params.device))) {
          throw new Error('Unknown sleeper');
        }
        return {
          en: 'Back to awake, nothing running.',
          fr: 'Remis à éveillé, plus rien en cours.',
          de: 'Zurück auf wach, nichts läuft mehr.',
          es: 'De vuelta a despierto, nada en curso.',
        };
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};
