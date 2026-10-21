// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined`, strings typed in a number field or a broker URL written five
// different ways.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  sleepers: '',
  mqtt_url: '',
  mqtt_username: '',
  mqtt_password: '',
  mqtt_topic: 'SleepAsAndroid',
  time_zone: 'Europe/Paris',
  // Reserved key (NOT in config_schema): the manifest declares both 'local'
  // (MQTT) and 'cloud' (Gladys Plus webhook), so Gladys shows a standard
  // "Prefer the local connection" toggle and sends the user's choice here.
  GLADYS_PREFER_LOCAL: true,
};

/** Id of the sleeper used when the configuration names none. */
export const DEFAULT_SLEEPER_ID = 'default';

/** Name of that sleeper, i.e. of its Gladys device. */
export const DEFAULT_SLEEPER_NAME = 'Sleep as Android';

/**
 * Turn a name into the id a sleeper is known by: in its Gladys external_id,
 * at the end of its MQTT topic and in the `sleeper` query of the webhook URL.
 * Lower case, no accents, dashes only — what a user can type in the app.
 * @param {string} name
 * @returns {string} the id, empty when nothing usable is left
 */
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * The sleepers declared in the configuration: one Gladys device each.
 *
 * Written as a comma-separated list of first names ("Alice, Bob"). Left empty,
 * there is one sleeper, for the household that has one phone tracking sleep.
 * The id is derived from the name: it is what Gladys keys the device on, so
 * renaming "Alice" to "Alicia" creates a new device (said in the docs).
 * @param {string} raw the `sleepers` field
 * @returns {{ id: string, name: string }[]} never empty
 */
export function parseSleepers(raw) {
  const sleepers = [];
  for (const part of String(raw ?? '').split(/[,;\n]/)) {
    const name = part.trim();
    const id = slugify(name);
    if (id && id !== DEFAULT_SLEEPER_ID && !sleepers.some((s) => s.id === id)) {
      sleepers.push({ id, name });
    }
  }
  return sleepers.length > 0 ? sleepers : [{ id: DEFAULT_SLEEPER_ID, name: DEFAULT_SLEEPER_NAME }];
}

/**
 * Read the broker address however it was typed: `mqtt://host:1883`,
 * `mqtts://host:8883`, `tcp://host` and `ssl://host` (the spelling of the
 * Sleep as Android settings screen), or a bare `host[:port]`.
 * @param {string} raw the `mqtt_url` field
 * @returns {{ secure: boolean, host: string, port: number } | null} null when empty
 * @throws {Error} when something was typed that is not an address
 */
export function parseBrokerUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z]+:\/\//i.test(text) ? text : `mqtt://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`"${text}" is not a broker address`);
  }
  const scheme = url.protocol.replace(':', '').toLowerCase();
  const secure = ['mqtts', 'ssl', 'tls'].includes(scheme);
  if (!secure && !['mqtt', 'tcp'].includes(scheme)) {
    throw new Error(`unsupported scheme "${scheme}" (mqtt:// or mqtts://)`);
  }
  if (!url.hostname) {
    throw new Error(`"${text}" names no host`);
  }
  return {
    secure,
    // IPv6 literals come back bracketed from URL; net.connect wants them bare.
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port ? Number(url.port) : secure ? 8883 : 1883,
  };
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...raw };
  let broker = null;
  let brokerError = null;
  try {
    broker = parseBrokerUrl(config.mqtt_url);
  } catch (err) {
    brokerError = err.message;
  }
  const topic = String(config.mqtt_topic ?? '')
    .trim()
    .replace(/\/+$/, '');
  return {
    ...config,
    mqtt_username: String(config.mqtt_username ?? '').trim(),
    mqtt_password: String(config.mqtt_password ?? ''),
    // An empty topic would subscribe to nothing useful: back to the default.
    mqtt_topic: topic || DEFAULT_CONFIG.mqtt_topic,
    time_zone: String(config.time_zone ?? '').trim() || DEFAULT_CONFIG.time_zone,
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
    // Derived, never stored by Gladys.
    sleeperList: parseSleepers(config.sleepers),
    broker,
    brokerError,
  };
}
