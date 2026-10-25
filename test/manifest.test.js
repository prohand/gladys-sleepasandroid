// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { EVENTS, eventsOfGroup } from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import { WEBHOOK_KEY } from '../src/service.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS, buildSceneEvents } from '../src/capabilities/scenes.js';
import { SLEEP_WIDGET, WIDGETS } from '../src/capabilities/widget.js';

const read = async (file) => readFile(new URL(file, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../gladys-assistant-integration.json'));
const pkg = JSON.parse(await read('../package.json'));
const appSource = await read('../src/app.js');

test('version, package.json and docker_image agree', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-sleepasandroid:${pkg.version}`);
});

test('the manifest declares both transports: local (MQTT) and cloud (Gladys Plus)', () => {
  assert.deepEqual(manifest.transports, ['local', 'cloud']);
  assert.deepEqual(
    manifest.webhooks.map((webhook) => webhook.key),
    [WEBHOOK_KEY],
  );
  assert.match(appSource, /onWebhook\(WEBHOOK_KEY/);
});

test('every manifest action is registered', () => {
  for (const action of manifest.actions) {
    assert.match(appSource, new RegExp(`onAction\\('${action.key}'`), action.key);
  }
});

// The store schema is the admission authority: a field type outside this list,
// or a placeholder that is not a multi-language object, gets the integration
// rejected by the indexer.
const FIELD_TYPES = [
  'string',
  'number',
  'boolean',
  'select',
  'multi_select',
  'secret',
  'oauth2',
  'section',
];

const allFields = [
  ...manifest.config_schema,
  ...manifest.actions.flatMap((a) => a.fields ?? []),
  ...manifest.widgets.flatMap((w) => w.settings ?? []),
  ...manifest.scene_triggers.flatMap((t) => t.fields ?? []),
  ...manifest.scene_actions.flatMap((a) => a.fields ?? []),
];

test('every field uses a type the store accepts', () => {
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/, `field key "${field.key}" must be snake_case`);
    if (field.placeholder !== undefined) {
      assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
      assert.ok(['string', 'number', 'secret'].includes(field.type), field.key);
    }
    if (field.source !== undefined) {
      assert.equal(field.source, 'devices');
      assert.equal(field.options, undefined, `field "${field.key}": source and options`);
    }
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.equal(field.default, undefined, `section "${field.key}" stores nothing`);
      assert.ok(!(field.key in DEFAULT_CONFIG), field.key);
      for (const link of field.links ?? []) {
        assert.match(link.url, /^https:\/\//);
      }
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `config key "${field.key}" unknown to the code`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
});

test('the MQTT password is a secret field', () => {
  const field = manifest.config_schema.find((f) => f.key === 'mqtt_password');
  assert.equal(field.type, 'secret');
});

const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('catalog: name, categories and the Gladys floor', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(CATEGORIES.includes(category), category);
  }
  // Widgets and scene declarations need Gladys 5.1, keywords / countries /
  // music 5.3: an older core rejects the whole manifest over an unknown field.
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
  if (['keywords', 'countries', 'music'].some((field) => field in manifest)) {
    assert.ok(major > 5 || (major === 5 && minor >= 3), manifest.gladys_version);
  }
});

test('catalog: search keywords follow the store rules, and no country restriction', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  // Sleep as Android is used everywhere: `countries` would hide the
  // integration from the catalog of every other country.
  assert.equal(manifest.countries, undefined);
});

test('the scene triggers are the ones the code fires', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.keys(SCENE_TRIGGERS).sort(),
  );
  for (const [key, { group, filter }] of Object.entries(SCENE_TRIGGERS)) {
    if (!group) {
      continue;
    }
    const declared = manifest.scene_triggers.find((t) => t.key === key);
    const options = declared.fields.find((f) => f.key === filter).options.map((o) => o.value);
    assert.deepEqual(
      options,
      eventsOfGroup(group).map((e) => e.key),
      `${key}.${filter}`,
    );
  }
});

test('every scene event carries only declared keys', () => {
  // The core drops undeclared keys: a key the code sends and the manifest
  // forgot is a variable the scene author never sees.
  for (const event of Object.keys(EVENTS)) {
    const fired = buildSceneEvents({
      device: 'ext:x:sleeper:a',
      sleeper: 'A',
      payload: { event, value1: '1761112800000', value2: 'Work', value3: null },
      durationHours: 7,
      timeZone: 'UTC',
    });
    for (const { key, data } of fired) {
      const declared = manifest.scene_triggers.find((t) => t.key === key);
      const allowed = [...declared.fields, ...declared.variables].map((f) => f.key);
      for (const dataKey of Object.keys(data)) {
        assert.ok(allowed.includes(dataKey), `${event} -> ${key}.${dataKey} undeclared`);
      }
      assert.ok(Object.keys(data).length <= 30);
    }
  }
});

test('the scene actions are handled and return their declared outputs', () => {
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.keys(SCENE_ACTIONS).sort(),
  );
  assert.match(appSource, /onSceneAction\(key/);
});

test('the widget is handled', () => {
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    [SLEEP_WIDGET],
  );
  assert.deepEqual(Object.keys(WIDGETS), [SLEEP_WIDGET]);
});

test('Simulate an event offers every event of the catalog', () => {
  const field = manifest.actions
    .find((a) => a.key === 'simulate_event')
    .fields.find((f) => f.key === 'event');
  assert.deepEqual(
    field.options.map((o) => o.value),
    Object.keys(EVENTS),
  );
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 100, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold in every language', () => {
  const within = (text, min, max, where) => {
    for (const language of LANGUAGES) {
      const { length } = text[language];
      assert.ok(length >= min && length <= max, `${where}.${language}: ${length} characters`);
    }
  };
  within(manifest.description, 10, 100, 'description');
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widget ${widget.key} label`);
    within(widget.description, 1, 100, `widget ${widget.key} description`);
  }
  for (const section of allFields.filter((field) => field.type === 'section')) {
    within(section.description, 1, 1000, `section ${section.key} description`);
  }
});

test('the user documentation exists in the four languages', async () => {
  for (const language of LANGUAGES) {
    const text = await read(`../docs/${language}.md`);
    assert.match(text, /SleepAsAndroid/, `docs/${language}.md names the default topic`);
    assert.match(text, /sleeper=/, `docs/${language}.md explains ?sleeper=`);
  }
});
