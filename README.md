# Sleep as Android for Gladys Assistant

External integration bringing the [Sleep as Android](https://sleep.urbandroid.org/) app into
[Gladys Assistant](https://gladysassistant.com) (Gladys **5.3+**), built on the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js) and the
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

- **One device per sleeper**: sleep tracking, sleep phase (drawn as a hypnogram), alarm ringing,
  next alarm, last event, last sleep duration.
- **Two channels, `local` and `cloud`**: MQTT on your own broker, and/or the webhook relayed by
  Gladys Plus (works away from home). An event received by both counts once; the device badge says
  which channel delivers.
- **Scenes**: 5 triggers (tracking, alarm, sleep phase, sound, any event) and 2 actions (read the
  sleep status, reset a sleeper).
- **Dashboard widget** "Sleep": live tiles, the night as a hypnogram, next alarm, last night.
- **English, French, German and Spanish** everywhere.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

## How it works

```
Sleep as Android ──MQTT──▶ your broker ──▶ ┐
       (phone)                             ├─▶ integration ─▶ Gladys: states, scene events,
       └──────webhook──▶ Gladys Plus ────▶ ┘                    transport badge, widget
```

The app sends `{ "event": "...", "value1": "...", "value2": "..." }` for every event. The
integration finds the sleeper (MQTT sub-topic `SleepAsAndroid/<name>`, or `?sleeper=<name>` on the
webhook URL), updates the sleeper's state, publishes the features that changed and fires the scene
triggers. The states are kept in `/data`, so a restart in the middle of the night does not lose
the start of the session.

## Project structure

```
.
├─ index.js                          # loads the saved states, connects, shutdown
├─ src/
│  ├─ app.js                         # SDK wiring (every handler)
│  ├─ service.js                     # channels in, Gladys out
│  ├─ tracker.js                     # event -> sleeper state (pure)
│  ├─ events.js                      # catalog of the app's events + payload parsing
│  ├─ device.js                      # the device of a sleeper
│  ├─ router.js                      # which sleeper (topic / ?sleeper=)
│  ├─ transports.js                  # cloud/local badge
│  ├─ store.js                       # states in /data
│  ├─ time.js, config.js, i18n.js
│  ├─ channels/                      # MQTT 3.1.1 subscriber (no extra dependency)
│  └─ capabilities/                  # scenes, widget, Configuration screen actions
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, SDK fake Gladys, local fake broker
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, build, release, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit and integration tests (node --test)
npm run lint           # ESLint
npm run format:check   # Prettier
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="sleep-as-android" \
DATA_DIR=./data LOG_LEVEL=debug \
npm start
```

Send a test event to a broker:

```bash
mosquitto_pub -h 192.168.1.10 -t SleepAsAndroid -m '{"event":"sleep_tracking_started"}'
```

## Workflows

The same as [gladys-devmel](https://github.com/prohand/gladys-devmel):

| Workflow                                                     | When                                    | What                                                                         |
| ------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)                         | push on `main`, pull requests           | Prettier, ESLint, tests on Node 22 + 24; store checks and image build on PRs |
| [`release.yml`](.github/workflows/release.yml)               | Actions → Release → patch/minor/major   | bumps the versions, rolls the changelog, tags, builds, GitHub Release        |
| [`build.yml`](.github/workflows/build.yml)                   | `v*` tag, manual run, called by release | multi-arch image (amd64 + arm64) to `ghcr.io`                                |
| [`github-release.yml`](.github/workflows/github-release.yml) | push on `main`, called by release       | creates the missing GitHub Releases from `CHANGELOG.md`                      |

## Publish

1. Add the GitHub topic `gladys-assistant-integration` to the repository.
2. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
3. **Actions → Release → Run workflow**. The indexer picks up the new manifest `version` and
   Gladys offers the install / update.
4. Turn on **Private vulnerability reporting** in the repository's security settings:
   [`SECURITY.md`](SECURITY.md) sends reporters there.

## License

Apache-2.0
