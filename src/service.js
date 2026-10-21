// -----------------------------------------------------------------------------
// The integration at run time: two channels in, one Gladys out.
//
// Events reach the service by MQTT (local) or by the Gladys Plus webhook
// (cloud). Either way they go through the same steps, one event at a time so
// Gladys receives the states in the order the app sent them:
//
//   1. find the sleeper (topic or `?sleeper=`), read the payload;
//   2. drop the copy of an event already received by the OTHER channel (a
//      phone set up with both sends everything twice);
//   3. update the sleeper's state (src/tracker.js) and save it in /data;
//   4. publish the device features that changed, fire the scene triggers,
//      nudge the dashboard widget, and move the transport badge if the event
//      came by another channel than the previous one.
//
// A Gladys refusal at step 4 (rate limit, Gladys older than 5.1 for the scene
// events) is logged and never stops the next event.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MqttSubscriber } from './channels/mqtt.js';
import { buildSceneEvents } from './capabilities/scenes.js';
import { SLEEP_WIDGET } from './capabilities/widget.js';
import { FEATURES, findSleeperByDevice, sleeperIds } from './device.js';
import { EVENTS, PHASE_NAMES, PHASE_VALUES, parsePayload } from './events.js';
import { sleeperForQuery, sleeperForTopic, topicFilters } from './router.js';
import { CHANNELS, transportOf } from './transports.js';
import { applyEvent, buildStates, isTracking, nextAlarmText, resetState } from './tracker.js';

const logger = createLogger({ name: 'service' });

/** How long an event is remembered to spot its copy from the other channel. */
export const DEDUPE_WINDOW_MS = 10_000;

/** The key of the Gladys Plus webhook declared in the manifest. */
export const WEBHOOK_KEY = 'events';

export class SleepService {
  /**
   * @param {object} gladys the SDK client
   * @param {object} options
   * @param {import('./store.js').StateStore} options.store
   * @param {() => number} [options.now]
   * @param {(options: object) => MqttSubscriber} [options.createSubscriber]
   */
  constructor(gladys, { store, now = Date.now, createSubscriber }) {
    this.gladys = gladys;
    this.store = store;
    this.now = now;
    this.createSubscriber = createSubscriber ?? ((options) => new MqttSubscriber(options));
    this.config = null;
    this.mqtt = null;
    this.mqttKey = null;
    this.webhook = { available: false, url: null };
    this.recent = new Map();
    this.queue = Promise.resolve();
  }

  // --- Configuration and channels -------------------------------------------

  /** Take a (new) normalized configuration: restart MQTT only if it changed. */
  applyConfig(config) {
    this.config = config;
    const key = config.broker
      ? JSON.stringify([
          config.broker,
          config.mqtt_username,
          config.mqtt_password,
          config.mqtt_topic,
        ])
      : null;
    if (key !== this.mqttKey) {
      this.stopMqtt();
      this.mqttKey = key;
      if (config.broker) {
        this.startMqtt();
      }
    }
    if (config.brokerError) {
      logger.warn(`MQTT broker address ignored: ${config.brokerError}`);
    }
  }

  startMqtt() {
    const { broker, mqtt_username: username, mqtt_password: password } = this.config;
    this.mqtt = this.createSubscriber({
      broker,
      username,
      password,
      filters: topicFilters(this.config),
    });
    this.mqtt.on('message', (topic, payload) => this.receiveMqtt(topic, payload));
    this.mqtt.on('status', () => {
      this.publishTransports().catch(() => {});
      this.refreshWidget();
    });
    this.mqtt.start();
  }

  stopMqtt() {
    if (this.mqtt) {
      this.mqtt.removeAllListeners();
      this.mqtt.stop();
      this.mqtt = null;
    }
  }

  /** Re-read the Gladys Plus webhook URL (connection, Plus linked/unlinked). */
  async refreshWebhook(state) {
    try {
      const { available, webhooks } = state ?? (await this.gladys.getWebhooks());
      const url = webhooks?.find((webhook) => webhook.key === WEBHOOK_KEY)?.url ?? null;
      this.webhook = { available: Boolean(available && url), url };
    } catch (err) {
      // An older Gladys without the relay answers 404: the local channel stays.
      logger.debug(`Gladys Plus webhooks unavailable (${err.message})`);
      this.webhook = { available: false, url: null };
    }
    return this.webhook;
  }

  /** Where each channel stands, for the status, the badge and the widget. */
  channelStatus() {
    return {
      mqttConfigured: Boolean(this.config?.broker),
      mqttConnected: Boolean(this.mqtt?.connected),
      mqttAddress: this.mqtt?.address ?? null,
      mqttError: this.config?.brokerError ?? this.mqtt?.lastError ?? null,
      webhookAvailable: this.webhook.available,
      webhookUrl: this.webhook.url,
    };
  }

  // --- Receiving ------------------------------------------------------------

  receiveMqtt(topic, raw) {
    const sleeper = sleeperForTopic(this.config, topic);
    if (!sleeper) {
      logger.warn(`Message on ${topic} ignored: no sleeper declared for that topic`);
      return this.queue;
    }
    return this.receive(CHANNELS.MQTT, sleeper, raw);
  }

  receiveWebhook({ query, body }) {
    const sleeper = sleeperForQuery(this.config, query);
    if (!sleeper) {
      logger.warn(`Webhook call ignored: no sleeper named "${query?.sleeper}"`);
      return this.queue;
    }
    return this.receive(CHANNELS.WEBHOOK, sleeper, body);
  }

  receive(channel, sleeper, raw) {
    const payload = parsePayload(raw);
    if (!payload) {
      logger.warn(`Not a Sleep as Android event (${channel}), ignored`);
      return this.queue;
    }
    // Stamped on arrival, not when its turn in the queue comes: a slow Gladys
    // must not shift the start of a night.
    const at = this.now();
    return this.enqueue(() => this.process(channel, sleeper, payload, at));
  }

  /**
   * Play an event as if the phone had sent it, from the Configuration screen:
   * the way to build and test a scene without waiting for the night.
   */
  simulate(deviceExternalId, event) {
    const sleeper = findSleeperByDevice(this.gladys, this.config.sleeperList, deviceExternalId);
    if (!sleeper || !EVENTS[event]) {
      return null;
    }
    const value1 = EVENTS[event].group === 'alarm' ? String(this.now() + 8 * 3_600_000) : null;
    const payload = { event, value1, value2: value1 ? 'Gladys test' : null, value3: null };
    const at = this.now();
    return this.enqueue(() => this.process(null, sleeper, payload, at)).then(() => sleeper);
  }

  enqueue(task) {
    this.queue = this.queue.then(task).catch((err) => logger.error('Event handling failed', err));
    return this.queue;
  }

  isDuplicate(channel, sleeper, payload, now) {
    const key = [sleeper.id, payload.event, payload.value1, payload.value2, payload.value3].join(
      '|',
    );
    const seen = this.recent.get(key);
    if (this.recent.size > 200) {
      for (const [entry, { at }] of this.recent) {
        if (now - at > DEDUPE_WINDOW_MS) {
          this.recent.delete(entry);
        }
      }
    }
    // The same event again on the SAME channel is a new one (two snores);
    // only the other channel's copy is dropped.
    if (seen && seen.channel !== channel && channel && now - seen.at < DEDUPE_WINDOW_MS) {
      return true;
    }
    this.recent.set(key, { channel, at: now });
    return false;
  }

  async process(channel, sleeper, payload, at) {
    if (this.isDuplicate(channel, sleeper, payload, at)) {
      logger.debug(`${payload.event} for ${sleeper.id} already received, ${channel} copy dropped`);
      return;
    }
    logger.info(`${sleeper.id} <- ${payload.event}${channel ? ` (${channel})` : ' (test)'}`);
    const previous = this.store.get(sleeper.id);
    const { state, changed, durationHours } = applyEvent(previous, payload, at);
    const channelChanged = channel !== null && previous.lastChannel !== channel;
    if (channel) {
      state.lastChannel = channel;
    }
    this.store.set(sleeper.id, state);

    try {
      await this.gladys.publishStates(
        buildStates(this.gladys, sleeper.id, state, changed, this.config.time_zone),
      );
    } catch (err) {
      logger.warn(`States of ${sleeper.id} refused by Gladys (${err.message})`);
    }

    const device = sleeperIds(this.gladys, sleeper.id).device;
    for (const { key, data } of buildSceneEvents({
      device,
      sleeper: sleeper.name,
      payload,
      durationHours,
      timeZone: this.config.time_zone,
    })) {
      try {
        await this.gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.debug(`Scene trigger ${key} not accepted (${err.message})`);
      }
    }

    if (channelChanged) {
      await this.publishTransports().catch(() => {});
    }
    this.refreshWidget();
  }

  // --- Publishing -----------------------------------------------------------

  /** Every feature of every sleeper: after a (re)connection or a config save. */
  async publishAll() {
    const all = Object.values(FEATURES);
    const states = this.config.sleeperList.flatMap((sleeper) =>
      buildStates(this.gladys, sleeper.id, this.store.get(sleeper.id), all, this.config.time_zone),
    );
    if (states.length > 0) {
      await this.gladys.publishStates(states);
    }
  }

  async publishTransports() {
    if (!this.config) {
      return;
    }
    const channels = this.channelStatus();
    const entries = this.config.sleeperList.map((sleeper) => ({
      external_id: sleeperIds(this.gladys, sleeper.id).device,
      ...transportOf({
        preferLocal: this.config.GLADYS_PREFER_LOCAL,
        ...channels,
        lastChannel: this.store.get(sleeper.id).lastChannel ?? null,
      }),
    }));
    try {
      await this.gladys.publishTransports(entries);
    } catch (err) {
      logger.warn(`Transport badges refused by Gladys (${err.message})`);
    }
  }

  refreshWidget() {
    try {
      this.gladys.requestWidgetRefresh(SLEEP_WIDGET);
    } catch {
      // Fire-and-forget nudge, dropped while disconnected anyway.
    }
  }

  // --- Reading and resetting a sleeper --------------------------------------

  /**
   * What a sleeper is doing, in plain values (scene outputs, widget).
   * @param {string} deviceExternalId
   */
  statusOf(deviceExternalId) {
    const sleeper = findSleeperByDevice(this.gladys, this.config.sleeperList, deviceExternalId);
    if (!sleeper) {
      return null;
    }
    const state = this.store.get(sleeper.id);
    return {
      sleeper,
      tracking: isTracking(state),
      paused: state.tracking && state.pausedSince !== null,
      trackingSince: state.trackingSince,
      phase: PHASE_NAMES[PHASE_VALUES[state.phase] ?? 0],
      alarmRinging: state.alarmRinging,
      nextAlarm: state.nextAlarm ? nextAlarmText(state, this.config.time_zone) : '',
      lastEvent: state.lastEvent ?? '',
      lastEventAt: state.lastEventAt,
      lastSleepHours: state.lastSleepHours ?? 0,
    };
  }

  async reset(deviceExternalId) {
    const sleeper = findSleeperByDevice(this.gladys, this.config.sleeperList, deviceExternalId);
    if (!sleeper) {
      return false;
    }
    await this.enqueue(async () => {
      const state = resetState(this.store.get(sleeper.id));
      this.store.set(sleeper.id, state);
      await this.gladys.publishStates(
        buildStates(
          this.gladys,
          sleeper.id,
          state,
          [FEATURES.TRACKING, FEATURES.SLEEP_PHASE, FEATURES.ALARM_RINGING],
          this.config.time_zone,
        ),
      );
      this.refreshWidget();
    });
    return true;
  }

  async stop() {
    this.stopMqtt();
    await this.queue;
    await this.store.flush();
  }
}
