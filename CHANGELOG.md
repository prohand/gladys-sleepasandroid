# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.1.0] - 2026-10-25

### Added

- Search keywords for the Gladys catalog (smart alarm, sleep cycle, snoring, MQTT…).

### Changed

- Gladys 5.3.0 or later is now required (the catalog keywords need it).
- `@gladysassistant/integration-sdk` updated to 0.16.0.

## [1.0.2] - 2026-10-23

- Maintenance release, no functional change.

## [1.0.1] - 2026-10-21

### Added

- First version of the Sleep as Android integration, built on the official Gladys JavaScript
  template.
- Local channel: a built-in MQTT client (MQTT 3.1.1, `mqtt://` and `mqtts://`) subscribed to the
  Sleep as Android topic and its sub-topics; retained messages are ignored.
- Cloud channel: the `events` webhook relayed by Gladys Plus; an event received by both channels
  counts once.
- One device per sleeper: sleep tracking, sleep phase (hypnogram), alarm ringing, next alarm, last
  event and last sleep duration. States are saved in `/data` across restarts.
- Cloud/local transport badge per sleeper, degraded when local is preferred but the broker is down.
- Scene triggers: tracking started or stopped, alarm event, sleep phase changed, sound detected,
  any event.
- Scene actions: read the sleep status, reset a sleeper.
- "Sleep" dashboard widget: live tiles, the night as a hypnogram, next alarm, last night and a
  Reset button.
- Configuration screen actions: Test the connection (with the topic and URL to type in the app)
  and Simulate an event.
- English, French, German and Spanish everywhere (configuration screen, messages, scenes, widget,
  documentation).
- `SECURITY.md`, `CHANGELOG.md`, `CLAUDE.md`, and the CI, build, release and GitHub releases
  workflows.

[Unreleased]: https://github.com/prohand/gladys-sleepasandroid/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/prohand/gladys-sleepasandroid/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/prohand/gladys-sleepasandroid/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-sleepasandroid/releases/tag/v1.0.1
