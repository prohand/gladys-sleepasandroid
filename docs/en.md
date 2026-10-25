# Sleep as Android — Gladys integration

This integration brings the [Sleep as Android](https://sleep.urbandroid.org/) app into Gladys:
whether sleep tracking is on, the sleep phase (awake, light, deep, REM), the alarm ringing, the
next alarm and how long you slept. Every event of the app can start a Gladys scene: close the
shutters when tracking starts, turn the lights on softly when the alarm rings, send a message when
a baby cry is heard.

Requires **Gladys 5.3 or later**.

## How the events reach Gladys

Sleep as Android pushes its events, Gladys never asks the phone. Two channels, use one or both:

| Channel     | Badge in Gladys | What you need                                   | Works away from home |
| ----------- | --------------- | ----------------------------------------------- | -------------------- |
| **MQTT**    | local           | an MQTT broker on your network (e.g. Mosquitto) | no                   |
| **Webhook** | cloud           | a Gladys Plus subscription                      | yes                  |

With both, every event arrives twice: the integration keeps the first copy and drops the other.
The **Prefer the local connection** toggle of the Configuration screen chooses which channel the
device badge shows when both work.

## 1. Configure the integration

Open **Integrations → Sleep as Android → Configuration**.

| Field                     | What to put                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Sleepers                  | Empty for a single phone. One phone per person: their first names, separated by commas (`Alice, Bob`). One Gladys device each.      |
| MQTT broker address       | `mqtt://192.168.1.10:1883` (or `mqtts://…:8883` for TLS). The network address of the broker, **never `localhost`**. Empty: no MQTT. |
| MQTT user name / password | The broker account, if it asks for one.                                                                                             |
| MQTT topic                | `SleepAsAndroid` by default. Must be the same as in the app.                                                                        |
| Time zone                 | The zone the next alarm is written in (`Europe/Paris`, `America/Montreal`…).                                                        |

For the cloud channel, paste your **Gladys Plus Open API key** in the **Gladys Plus webhooks**
block of the same screen.

Then click **Test the connection**: the answer says which channels work and gives, for every
sleeper, **the exact topic and URL to type in the app**.

## 2. Configure Sleep as Android

### MQTT (local)

In the app: **Settings → Services → Automation → MQTT**.

- turn it on;
- **URL**: `tcp://192.168.1.10:1883` (the broker address, with `tcp://`, or `ssl://` for TLS);
- **Topic**: `SleepAsAndroid` for the first (or only) sleeper, `SleepAsAndroid/bob` for Bob;
- **Client ID**: anything unique, e.g. `phone-bob`;
- user name and password if your broker needs them.

The integration subscribes to the topic and to every sub-topic. Messages published with the
_retain_ flag are ignored: they are old events, replaying them would start your scenes again.

### Webhook (cloud, through Gladys Plus)

In the app: **Settings → Services → Automation → Webhooks**, turn it on and paste the URL given by
**Test the connection**. With several sleepers, each phone gets the URL followed by
`?sleeper=<name>` (e.g. `…?sleeper=bob`); the first sleeper can use the URL as is.

Keep that URL private: whoever has it can send events in your name.

### Check it

Use the app's **Test** button (in the MQTT or Webhooks screen), or start a sleep tracking: the
**Last event** feature of the device changes within seconds.

## 3. Create the devices

**Integrations → Sleep as Android → Discovery**: one device per sleeper, named
`Sleep as Android` (single phone) or `Sleep as Android — Alice`. Create them.

| Feature             | Values                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| Sleep tracking      | 1 while tracking, 0 when stopped or paused                                       |
| Sleep phase         | 0 awake, 1 REM, 2 light, 3 deep (the deeper, the higher: a hypnogram once drawn) |
| Alarm ringing       | 1 while the alarm rings, 0 once dismissed or snoozed                             |
| Next alarm          | text, e.g. `2026-10-22 07:00 · Work`, `—` when there is none                     |
| Last event          | text, the raw name of the last event (`deep_sleep`, `alarm_alert_start`…)        |
| Last sleep duration | hours tracked during the last session, pauses excluded                           |

The states are saved by the integration: a Gladys restart during the night does not lose the start
of the session.

Renaming a sleeper in the configuration creates a new device: its id comes from its name.

## 4. Scenes

Triggers (**When…**), each with a **Sleeper** filter (empty = all):

| Trigger                           | Filter                                                                                                                                                    | Variables                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Sleep tracking started or stopped | started, stopped, paused, resumed                                                                                                                         | sleeper, state, duration_hours (when stopped)     |
| Alarm event                       | ringing, dismissed, snooze, snooze canceled, next alarm skipped, rescheduled, wake-up check, time to bed, alarm coming soon, smart wake-up soon / started | sleeper, event, alarm_time, alarm_label           |
| Sleep phase changed               | awake, fell asleep, light, deep, REM                                                                                                                      | sleeper, phase                                    |
| Sound detected during sleep       | snoring, talking, cough, baby crying, laughter, breathing alert (apnea), anti-snoring                                                                     | sleeper, sound                                    |
| Any Sleep as Android event        | —                                                                                                                                                         | sleeper, event (raw name), value1, value2, value3 |

Read a variable in the next actions with `{{triggerEvent.data.alarm_label}}`.

Actions (**Then…**):

- **Read the sleep status**: puts `tracking`, `phase`, `alarm_ringing`, `next_alarm`,
  `last_event` and `last_sleep_hours` of a sleeper in variables — "if tracking, do not turn the
  lights on";
- **Reset a sleeper**: back to awake, nothing running — for the morning after a phone that died
  during the night.

Examples:

- _When_ Sleep tracking started (started) → close the bedroom shutters, turn off the lights.
- _When_ Alarm event (ringing) → light at 20 %, then open the shutters.
- _When_ Sound detected (baby crying) → send a message to the parents.

To build a scene during the day, **Simulate an event** (Configuration screen) plays any event as
if the phone had sent it.

## 5. Dashboard widget

Add the **Sleep** widget and pick a sleeper (empty: the first one). It shows the tracking and alarm
tiles, the last twelve hours as a hypnogram, the phase, the next alarm, the duration of the last
night, how the events arrive (MQTT or Gladys Plus) and a **Reset** button.

## Troubleshooting

- **Nothing arrives by MQTT**: `localhost` and `127.0.0.1` point at the integration's own
  container, use the broker's network address. **Test the connection** shows the broker's answer
  (refused password, unreachable…). The topic of the app must be the one of the configuration,
  case included.
- **Badge "cloud" with an orange dot**: you prefer local, a broker is configured but unreachable,
  and the events come through Gladys Plus.
- **"Webhook not available"**: Gladys Plus is not linked, or the Open API key is missing in the
  Gladys Plus webhooks block.
- **An event for an unknown sleeper is ignored**: the topic `SleepAsAndroid/<name>` or the
  `?sleeper=<name>` must name a sleeper of the configuration (case and accents do not matter).
- **The tracking stays on**: the phone died before sending "tracking stopped". Use **Reset** (widget
  or scene action).
