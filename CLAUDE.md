# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors when working
with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime dependency:
`@gladysassistant/integration-sdk`) for the **Sleep as Android** app. It started from the official
JavaScript template (GladysAssistant/integration-template-js) and follows the conventions of
prohand/gladys-devmel.

The app PUSHES events (`{ event, value1, value2, value3 }`); nothing is ever asked from the phone.
They arrive by two channels: **MQTT** (local, the user's broker, `src/channels/mqtt.js`) and the
**Gladys Plus webhook** `events` (cloud). Each sleeper is one Gladys device; Gladys 5.1+ adds scene
triggers, scene actions and a "Sleep" dashboard widget.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/tracker.test.js            # one file
node --test --test-name-pattern "snooze"    # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint` and `test` on Node 22 and 24; pull requests also run the store
checks and build the image. Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, re-runs Prettier, rolls the changelog, tags, builds, publishes the
GitHub Release).

## Architecture

```
index.js                    loads the saved states, connects, graceful shutdown
src/app.js                  SDK wiring: every handler, registered before connect()
src/service.js              the run time: channels in, states/scene events/badges out
src/tracker.js              pure state machine: event -> sleeper state -> changed features
src/events.js               catalog of the app's events (groups, trigger keys, labels), payload parsing
src/device.js               the Gladys device of a sleeper (feature keys)
src/router.js               which sleeper: MQTT sub-topic or ?sleeper= of the webhook URL
src/transports.js           cloud/local badge (+ degraded) per sleeper
src/store.js                sleepers' states in /data/sleepers.json (atomic, coalesced writes)
src/channels/mqtt.js        MQTT 3.1.1 subscriber with reconnection (no npm dependency)
src/channels/mqttPackets.js MQTT packet encoding/decoding
src/capabilities/           scenes (triggers + actions), widget, Configuration screen actions
src/config.js               DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                 the four languages and the helpers to write in them
docs/{en,fr,de,es}.md       user documentation, re-hosted by Gladys
```

### Invariants worth knowing

- **External ids are forever.** A sleeper device is `gladys.externalIds('sleeper', id)`, `id` being
  the slug of the name typed in the configuration. Feature keys (`FEATURES` in `src/device.js`),
  trigger, action, widget and config keys are stored by users: never rename them.
- **Events are stamped on arrival**, not when their turn in the queue comes: a slow Gladys must not
  shift the start of a night. They are processed one at a time, in order.
- **Both channels may carry the same event**: the copy from the OTHER channel within 10 s is
  dropped (`DEDUPE_WINDOW_MS`); a repeat on the same channel is a new event (two snores).
- **Retained MQTT messages are ignored**: they are past events.
- **Never fire a scene event from a scene action** (loops). Simulated events are not tied to a
  channel and never move the badge.
- **The container rootfs is read-only**: write only under `/data` (`DATA_DIR` in tests). Never log
  the MQTT password or the webhook URL.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- A Gladys refusal (429, older core without scene support) is logged and never stops the next
  event; the state is kept anyway.

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or in the
  manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading: the
  Release workflow moves the section, and it becomes the notes of the GitHub Release.
- **Manifest.** Every text is `{ en, fr, de, es }` — `label`, `description`, `placeholder` alike.
  The catalog `description` holds 10 to 100 characters per language. `test/manifest.test.js` ties
  the manifest to the code (defaults, actions, webhook, scene triggers and their option lists,
  scene event keys, scene actions, widget): change both sides together. The trigger options and the
  "Simulate an event" list come from `EVENTS` in `src/events.js`.
- **User-facing text** is written in English, French, German and Spanish (`src/i18n.js`), and
  `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md` are kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network (the MQTT tests run a broker on 127.0.0.1).

## Testing

`createFakeGladys()` from `@gladysassistant/integration-sdk/testing` stands in for Gladys
(`test/app.test.js` drives the whole wiring through it); `test/helpers/fakeSubscriber.js` replaces
the MQTT client, `test/helpers/memoryStore.js` the state file; `test/mqtt.test.js` runs the real
client against a tiny broker on a local socket.
