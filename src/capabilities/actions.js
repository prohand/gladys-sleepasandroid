// -----------------------------------------------------------------------------
// The buttons of the Configuration screen (manifest `actions`).
//
//   - test_connection: where each channel stands, and the exact address to
//     type in the app for every sleeper (MQTT topic, webhook URL);
//   - simulate_event: play an event as if the phone had sent it, to build and
//     try a scene in the afternoon instead of at 7 am.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';
import { EVENTS } from '../events.js';
import { webhookUrlFor } from '../router.js';

function mqttLine(language, config, channels) {
  if (config.brokerError) {
    return pick(language, {
      en: `MQTT: the broker address is not valid (${config.brokerError}).`,
      fr: `MQTT : l'adresse du broker n'est pas valide (${config.brokerError}).`,
      de: `MQTT: Die Broker-Adresse ist ungültig (${config.brokerError}).`,
      es: `MQTT: la dirección del bróker no es válida (${config.brokerError}).`,
    });
  }
  if (!channels.mqttConfigured) {
    return pick(language, {
      en: 'MQTT: no broker configured (local channel off).',
      fr: 'MQTT : aucun broker configuré (canal local désactivé).',
      de: 'MQTT: kein Broker eingerichtet (lokaler Kanal aus).',
      es: 'MQTT: ningún bróker configurado (canal local desactivado).',
    });
  }
  if (channels.mqttConnected) {
    return pick(language, {
      en: `MQTT: connected to ${channels.mqttAddress}.`,
      fr: `MQTT : connecté à ${channels.mqttAddress}.`,
      de: `MQTT: verbunden mit ${channels.mqttAddress}.`,
      es: `MQTT: conectado a ${channels.mqttAddress}.`,
    });
  }
  const reason = channels.mqttError ?? '…';
  return pick(language, {
    en: `MQTT: not connected to ${channels.mqttAddress} (${reason}).`,
    fr: `MQTT : pas connecté à ${channels.mqttAddress} (${reason}).`,
    de: `MQTT: nicht verbunden mit ${channels.mqttAddress} (${reason}).`,
    es: `MQTT: no conectado a ${channels.mqttAddress} (${reason}).`,
  });
}

function webhookLine(language, channels) {
  if (channels.webhookAvailable) {
    return pick(language, {
      en: 'Gladys Plus: webhook available.',
      fr: 'Gladys Plus : webhook disponible.',
      de: 'Gladys Plus: Webhook verfügbar.',
      es: 'Gladys Plus: webhook disponible.',
    });
  }
  return pick(language, {
    en: 'Gladys Plus: webhook not available (Gladys Plus not linked, or no Open API key in the "Gladys Plus webhooks" block).',
    fr: 'Gladys Plus : webhook indisponible (Gladys Plus non lié, ou pas de clé Open API dans le bloc « Webhooks Gladys Plus »).',
    de: 'Gladys Plus: Webhook nicht verfügbar (Gladys Plus nicht verknüpft oder kein Open-API-Schlüssel im Block „Gladys Plus Webhooks“).',
    es: 'Gladys Plus: webhook no disponible (Gladys Plus no vinculado, o sin clave Open API en el bloque «Webhooks de Gladys Plus»).',
  });
}

function sleeperLine(language, config, channels, sleeper, index) {
  const topic = index === 0 ? config.mqtt_topic : `${config.mqtt_topic}/${sleeper.id}`;
  const parts = [`• ${sleeper.name}`];
  if (channels.mqttConfigured) {
    parts.push(pick(language, { en: 'topic', fr: 'topic', de: 'Topic', es: 'tema' }) + ` ${topic}`);
  }
  if (channels.webhookAvailable) {
    parts.push(`URL ${webhookUrlFor(channels.webhookUrl, config, sleeper)}`);
  }
  return parts.join(' — ');
}

/**
 * The answer of "Test the connection".
 * @param {import('../service.js').SleepService} service
 */
export async function testConnection(service) {
  await service.refreshWebhook();
  await service.publishTransports();
  const { config } = service;
  const channels = service.channelStatus();
  const ok = channels.mqttConnected || channels.webhookAvailable;
  return localize((language) =>
    [
      ok
        ? pick(language, {
            en: 'Ready to receive the events of Sleep as Android.',
            fr: 'Prêt à recevoir les événements de Sleep as Android.',
            de: 'Bereit, die Ereignisse von Sleep as Android zu empfangen.',
            es: 'Listo para recibir los eventos de Sleep as Android.',
          })
        : pick(language, {
            en: 'No channel can receive events yet: configure an MQTT broker or Gladys Plus.',
            fr: 'Aucun canal ne peut encore recevoir les événements : configurez un broker MQTT ou Gladys Plus.',
            de: 'Noch kann kein Kanal Ereignisse empfangen: Richte einen MQTT-Broker oder Gladys Plus ein.',
            es: 'Ningún canal puede recibir eventos todavía: configure un bróker MQTT o Gladys Plus.',
          }),
      mqttLine(language, config, channels),
      webhookLine(language, channels),
      pick(language, {
        en: 'To type in the app of each sleeper:',
        fr: "À saisir dans l'application de chaque dormeur :",
        de: 'In der App jedes Schläfers einzutragen:',
        es: 'A introducir en la app de cada durmiente:',
      }),
      ...config.sleeperList.map((sleeper, index) =>
        sleeperLine(language, config, channels, sleeper, index),
      ),
    ].join('\n'),
  );
}

/**
 * The answer of "Simulate an event".
 * @param {import('../service.js').SleepService} service
 * @param {{ device: string, event: string }} fields
 */
export async function simulateEvent(service, fields) {
  const sleeper = await service.simulate(fields.device, fields.event);
  if (!sleeper) {
    return localize((language) =>
      pick(language, {
        en: 'Unknown sleeper or event.',
        fr: 'Dormeur ou événement inconnu.',
        de: 'Unbekannter Schläfer oder unbekanntes Ereignis.',
        es: 'Durmiente o evento desconocido.',
      }),
    );
  }
  const label = EVENTS[fields.event].label;
  return localize((language) =>
    pick(language, {
      en: `"${label.en}" played for ${sleeper.name}: states, scenes and widget updated.`,
      fr: `« ${label.fr} » joué pour ${sleeper.name} : états, scènes et widget mis à jour.`,
      de: `„${label.de}“ für ${sleeper.name} abgespielt: Zustände, Szenen und Widget aktualisiert.`,
      es: `«${label.es}» reproducido para ${sleeper.name}: estados, escenas y widget actualizados.`,
    }),
  );
}
