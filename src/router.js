// -----------------------------------------------------------------------------
// Which sleeper an event belongs to.
//
// The app does not say who is sleeping: the address it posts to does. Each
// phone is set up with its own MQTT topic (`SleepAsAndroid/alice`) or its own
// webhook URL (`...?sleeper=alice`). The bare topic and a URL without
// `sleeper` go to the first sleeper declared — the whole story for a
// household with one phone.
// -----------------------------------------------------------------------------

import { slugify } from './config.js';

/** The MQTT filters to subscribe to: the base topic and one level below. */
export function topicFilters(config) {
  return [config.mqtt_topic, `${config.mqtt_topic}/+`];
}

/**
 * @param {object} config normalized configuration
 * @param {string} topic topic of a received message
 * @returns {{ id: string, name: string } | null}
 */
export function sleeperForTopic(config, topic) {
  const base = config.mqtt_topic;
  if (topic === base) {
    return config.sleeperList[0];
  }
  if (topic.startsWith(`${base}/`)) {
    return findSleeper(config, topic.slice(base.length + 1));
  }
  return null;
}

/**
 * @param {object} config normalized configuration
 * @param {Record<string, unknown>} [query] query string of the webhook call
 * @returns {{ id: string, name: string } | null}
 */
export function sleeperForQuery(config, query) {
  const wanted = query?.sleeper;
  if (wanted === undefined || wanted === null || wanted === '') {
    return config.sleeperList[0];
  }
  return findSleeper(config, Array.isArray(wanted) ? wanted[0] : wanted);
}

function findSleeper(config, name) {
  const id = slugify(name);
  return config.sleeperList.find((sleeper) => sleeper.id === id) ?? null;
}

/**
 * The webhook URL a sleeper's phone posts to: the Gladys Plus URL, with
 * `?sleeper=<id>` when several sleepers share it.
 * @param {string} url Gladys Plus URL of the `events` webhook
 * @param {object} config normalized configuration
 * @param {{ id: string }} sleeper
 */
export function webhookUrlFor(url, config, sleeper) {
  if (config.sleeperList.length === 1) {
    return url;
  }
  const withSleeper = new URL(url);
  withSleeper.searchParams.set('sleeper', sleeper.id);
  return withSleeper.toString();
}
