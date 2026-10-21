// -----------------------------------------------------------------------------
// The cloud/local badge of each sleeper.
//
// Two ways in: MQTT on the user's broker (local, the nominal one) and the
// webhook relayed by Gladys Plus (cloud, works away from home too). Both only
// receive, so "which transport" is "which channel the events of this phone
// actually arrive by" — the one that carried its last event, as long as that
// channel is still up; before any event, the best channel that is up.
//
// `GLADYS_PREFER_LOCAL` decides that "best". When the user prefers local, has
// a broker configured and it is down while the webhook still works, the badge
// says cloud AND degraded: it works, but not the way it was set up to.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';

export const CHANNELS = { MQTT: 'mqtt', WEBHOOK: 'webhook' };

/**
 * @param {object} status
 * @param {boolean} status.preferLocal
 * @param {boolean} status.mqttConfigured
 * @param {boolean} status.mqttConnected
 * @param {boolean} status.webhookAvailable
 * @param {string|null} status.lastChannel channel of the sleeper's last event
 * @returns {{ transport: string, degraded?: boolean, message?: object }}
 */
export function transportOf({
  preferLocal,
  mqttConfigured,
  mqttConnected,
  webhookAvailable,
  lastChannel,
}) {
  const up = { [CHANNELS.MQTT]: mqttConnected, [CHANNELS.WEBHOOK]: webhookAvailable };
  const order = preferLocal ? [CHANNELS.MQTT, CHANNELS.WEBHOOK] : [CHANNELS.WEBHOOK, CHANNELS.MQTT];
  const channel = lastChannel && up[lastChannel] ? lastChannel : order.find((c) => up[c]);
  if (!channel) {
    return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
  }
  if (channel === CHANNELS.MQTT) {
    return { transport: DEVICE_TRANSPORTS.LOCAL };
  }
  if (preferLocal && mqttConfigured && !mqttConnected) {
    return {
      transport: DEVICE_TRANSPORTS.CLOUD,
      degraded: true,
      message: {
        en: 'MQTT broker unreachable: events arrive through Gladys Plus',
        fr: 'Broker MQTT injoignable : les événements passent par Gladys Plus',
        de: 'MQTT-Broker nicht erreichbar: Ereignisse kommen über Gladys Plus',
        es: 'Bróker MQTT inaccesible: los eventos llegan por Gladys Plus',
      },
    };
  }
  return { transport: DEVICE_TRANSPORTS.CLOUD };
}
