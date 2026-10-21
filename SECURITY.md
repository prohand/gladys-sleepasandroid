# Security policy

## Supported versions

Only the latest release of the Sleep as Android integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-sleepasandroid](https://github.com/prohand/gladys-sleepasandroid/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove passwords, webhook URLs and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes, in particular the
MQTT client (`src/channels/`) and the handling of the events received by MQTT or by the Gladys
Plus webhook.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), Gladys Plus, the
Sleep as Android app and your MQTT broker.

## Good practices for users

- The Gladys Plus webhook URL **is** the secret: whoever has it can send events in your name.
  Keep it private, and change the Open API key in Gladys Plus if it leaked.
- Give the MQTT account of the integration read-only access to the Sleep as Android topic
  (`SleepAsAndroid/#`) when your broker supports ACLs, and prefer `mqtts://` outside a trusted
  network.
- Sleep data is personal data: the integration keeps the sleepers' last states in its `/data`
  volume only, and never sends them anywhere but to your Gladys.
- Keep Gladys and the integration up to date.
