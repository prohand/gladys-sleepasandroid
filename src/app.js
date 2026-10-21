// -----------------------------------------------------------------------------
// SDK wiring: every handler registered on the Gladys client, before connect().
//
// Kept out of index.js so the tests drive the real wiring through the SDK's
// fake Gladys (`createFakeGladys`), the way Gladys itself would.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { buildDevice } from './device.js';
import { SleepService, WEBHOOK_KEY } from './service.js';
import { StateStore } from './store.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS } from './capabilities/widget.js';
import { simulateEvent, testConnection } from './capabilities/actions.js';
import { isValidTimeZone } from './time.js';

const logger = createLogger({ name: 'app' });

/**
 * @param {object} gladys a GladysIntegration (or the SDK's fake one)
 * @param {object} [options]
 * @param {StateStore} [options.store] already loaded (see index.js)
 * @param {() => number} [options.now]
 * @param {Function} [options.createSubscriber] MQTT client factory (tests)
 * @returns {SleepService}
 */
export function registerHandlers(gladys, options = {}) {
  const service = new SleepService(gladys, {
    store: options.store ?? new StateStore(),
    now: options.now,
    createSubscriber: options.createSubscriber,
  });
  service.applyConfig(normalizeConfig());

  const publishDevices = () =>
    gladys.publishDiscoveredDevices(
      service.config.sleeperList.map((sleeper) => buildDevice(gladys, sleeper)),
    );

  // (Re)initialize everything the configuration drives.
  const initialize = async (rawConfig) => {
    const config = normalizeConfig(rawConfig);
    if (!isValidTimeZone(config.time_zone)) {
      logger.warn(`Unknown time zone "${config.time_zone}": dates are written in UTC`);
    }
    service.applyConfig(config);
    await publishDevices();
    await service.refreshWebhook();
    await service.publishAll();
    await service.publishTransports();
    service.refreshWidget();
    await reportStatus();
  };

  const reportStatus = async () => {
    const channels = service.channelStatus();
    if (service.config.brokerError) {
      await gladys.setConnectionStatus(false, {
        en: `Invalid MQTT broker address: ${service.config.brokerError}`,
        fr: `Adresse du broker MQTT invalide : ${service.config.brokerError}`,
        de: `Ungültige MQTT-Broker-Adresse: ${service.config.brokerError}`,
        es: `Dirección del bróker MQTT no válida: ${service.config.brokerError}`,
      });
    } else if (!channels.mqttConfigured && !channels.webhookAvailable) {
      await gladys.setConnectionStatus(false, {
        en: 'Configure an MQTT broker or Gladys Plus to receive the events.',
        fr: 'Configurez un broker MQTT ou Gladys Plus pour recevoir les événements.',
        de: 'Richte einen MQTT-Broker oder Gladys Plus ein, um die Ereignisse zu empfangen.',
        es: 'Configure un bróker MQTT o Gladys Plus para recibir los eventos.',
      });
    } else {
      // The MQTT link comes up a moment later: the badge and the widget follow
      // it live, the status only says the integration is set up.
      await gladys.setConnectionStatus(true);
    }
  };

  // --- Discovery --------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await publishDevices();
  });

  // A device the user just created gets its known states at once.
  gladys.onDeviceCreated(async () => {
    await service.publishAll();
    await service.publishTransports();
  });

  // --- Incoming events: the cloud channel ---------------------------------------
  gladys.onWebhook(WEBHOOK_KEY, (request) => service.receiveWebhook(request));
  gladys.onWebhookUpdated(async (state) => {
    await service.refreshWebhook(state);
    await service.publishTransports();
    service.refreshWidget();
    await reportStatus();
  });

  // --- Configuration screen buttons -------------------------------------------
  gladys.onAction('test_connection', () => testConnection(service));
  gladys.onAction('simulate_event', (fields) => simulateEvent(service, fields));

  // --- Scene actions ------------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(service, { fields }));
  }

  // --- Dashboard widget ---------------------------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(service, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
      widget.action(service, { actionKey, params, settings }),
    );
  }

  // --- Configuration and connection lifecycle -----------------------------------
  gladys.onConfigUpdated(async (config) => {
    logger.info('Configuration saved');
    try {
      await initialize(config);
    } catch (err) {
      logger.error('Applying the configuration failed', err);
      await failedStatus();
    }
  });

  const failedStatus = () =>
    gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
        de: 'Initialisierung fehlgeschlagen, prüfe die Protokolle der Integration.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});

  gladys.on('connected', async () => {
    try {
      await initialize(await gladys.getConfig());
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await failedStatus();
    }
  });

  return service;
}
