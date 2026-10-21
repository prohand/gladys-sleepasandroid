# Sleep as Android — integración para Gladys

Esta integración lleva la app [Sleep as Android](https://sleep.urbandroid.org/) a Gladys: si el
seguimiento del sueño está activo, la fase de sueño (despierto, ligero, profundo, REM), la alarma
sonando, la próxima alarma y cuánto ha dormido. Cada evento de la app puede iniciar una escena de
Gladys: cerrar las persianas cuando empieza el seguimiento, encender la luz suavemente cuando suena
la alarma, enviar un mensaje cuando se oye llorar a un bebé.

Requiere **Gladys 5.1 o posterior**.

## Cómo llegan los eventos a Gladys

Sleep as Android envía sus eventos por sí misma, Gladys nunca consulta el teléfono. Dos canales, use
uno o ambos:

| Canal       | Distintivo en Gladys | Qué necesita                                | Funciona fuera de casa |
| ----------- | -------------------- | ------------------------------------------- | ---------------------- |
| **MQTT**    | local                | un bróker MQTT en su red (p. ej. Mosquitto) | no                     |
| **Webhook** | nube                 | una suscripción a Gladys Plus               | sí                     |

Con ambos, cada evento llega dos veces: la integración conserva la primera copia y descarta la otra.
El interruptor **Preferir la conexión local** de la pantalla Configuración elige qué canal muestra
el distintivo del dispositivo cuando ambos funcionan.

## 1. Configurar la integración

Abra **Integraciones → Sleep as Android → Configuración**.

| Campo                     | Qué poner                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Durmientes                | Vacío para un solo teléfono. Un teléfono por persona: sus nombres, separados por comas (`Alice, Bob`). Un dispositivo Gladys cada uno. |
| Dirección del bróker MQTT | `mqtt://192.168.1.10:1883` (o `mqtts://…:8883` para TLS). La dirección de red del bróker, **nunca `localhost`**. Vacío: sin MQTT.      |
| Usuario / contraseña MQTT | La cuenta del bróker, si la pide.                                                                                                      |
| Tema MQTT                 | `SleepAsAndroid` por defecto. Debe ser el mismo que en la app.                                                                         |
| Zona horaria              | La zona en la que se escribe la próxima alarma (`Europe/Madrid`, `America/Mexico_City`…).                                              |

Para el canal en la nube, pegue su **clave Open API de Gladys Plus** en el bloque **Webhooks de
Gladys Plus** de la misma pantalla.

Luego pulse **Probar la conexión**: la respuesta indica qué canales funcionan y da, para cada
durmiente, **el tema y la URL exactos que hay que introducir en la app**.

## 2. Configurar Sleep as Android

### MQTT (local)

En la app: **Ajustes → Servicios → Automatización → MQTT**.

- actívelo;
- **URL**: `tcp://192.168.1.10:1883` (la dirección del bróker, con `tcp://`, o `ssl://` para TLS);
- **Tema**: `SleepAsAndroid` para el primer (o único) durmiente, `SleepAsAndroid/bob` para Bob;
- **Client ID**: cualquier cosa única, p. ej. `telefono-bob`;
- usuario y contraseña si su bróker los pide.

La integración se suscribe al tema y a todos sus subtemas. Los mensajes publicados con la marca
_retain_ se ignoran: son eventos antiguos, reproducirlos volvería a lanzar sus escenas.

### Webhook (nube, a través de Gladys Plus)

En la app: **Ajustes → Servicios → Automatización → Webhooks**, actívelo y pegue la URL que da
**Probar la conexión**. Con varios durmientes, cada teléfono recibe la URL seguida de
`?sleeper=<nombre>` (p. ej. `…?sleeper=bob`); el primer durmiente puede usar la URL tal cual.

Mantenga esa URL en privado: quien la tenga puede enviar eventos en su nombre.

### Comprobar

Use el botón **Test** de la app (en la pantalla MQTT o Webhooks), o inicie un seguimiento del sueño:
la característica **Last event** del dispositivo cambia en unos segundos.

## 3. Crear los dispositivos

**Integraciones → Sleep as Android → Descubrimiento**: un dispositivo por durmiente, llamado
`Sleep as Android` (un solo teléfono) o `Sleep as Android — Alice`. Créelos.

| Característica      | Valores                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Sleep tracking      | 1 durante el seguimiento, 0 detenido o en pausa                                                      |
| Sleep phase         | 0 despierto, 1 REM, 2 ligero, 3 profundo (cuanto más profundo, más alto: un hipnograma al dibujarlo) |
| Alarm ringing       | 1 mientras suena la alarma, 0 una vez desactivada o pospuesta                                        |
| Next alarm          | texto, p. ej. `2026-10-22 07:00 · Trabajo`, `—` si no hay ninguna                                    |
| Last event          | texto, el nombre bruto del último evento (`deep_sleep`, `alarm_alert_start`…)                        |
| Last sleep duration | horas registradas en la última sesión, sin las pausas                                                |

La integración guarda los estados: un reinicio de Gladys durante la noche no pierde el inicio de la
sesión.

Cambiar el nombre de un durmiente en la configuración crea un dispositivo nuevo: su identificador
procede de su nombre.

## 4. Escenas

Disparadores (**Cuando…**), cada uno con un filtro **Durmiente** (vacío = todos):

| Disparador                                | Filtro                                                                                                                                                                                 | Variables                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Seguimiento del sueño iniciado o detenido | iniciado, detenido, en pausa, reanudado                                                                                                                                                | sleeper, state, duration_hours (al detener)           |
| Evento de alarma                          | suena, desactivada, posponer, posponer cancelado, próxima omitida, reprogramada, comprobación de despertar, hora de acostarse, alarma próxima, despertar inteligente pronto / iniciado | sleeper, event, alarm_time, alarm_label               |
| Fase de sueño cambiada                    | despierto, dormido, ligero, profundo, REM                                                                                                                                              | sleeper, phase                                        |
| Sonido detectado durante el sueño         | ronquido, habla, tos, bebé llorando, risa, alerta de respiración (apnea), antirronquidos                                                                                               | sleeper, sound                                        |
| Cualquier evento de Sleep as Android      | —                                                                                                                                                                                      | sleeper, event (nombre bruto), value1, value2, value3 |

Lea una variable en las acciones siguientes con `{{triggerEvent.data.alarm_label}}`.

Acciones (**Entonces…**):

- **Leer el estado del sueño**: pone `tracking`, `phase`, `alarm_ringing`, `next_alarm`,
  `last_event` y `last_sleep_hours` de un durmiente en variables — «si el seguimiento está activo,
  no encender la luz»;
- **Restablecer un durmiente**: vuelve a despierto, nada en curso — para la mañana después de un
  teléfono que se apagó por la noche.

Ejemplos:

- _Cuando_ Seguimiento del sueño iniciado (iniciado) → cerrar las persianas del dormitorio, apagar
  las luces.
- _Cuando_ Evento de alarma (suena) → luz al 20 %, luego abrir las persianas.
- _Cuando_ Sonido detectado (bebé llorando) → enviar un mensaje a los padres.

Para crear una escena durante el día, **Simular un evento** (pantalla Configuración) reproduce
cualquier evento como si lo hubiera enviado el teléfono.

## 5. Widget del panel

Añada el widget **Sueño** y elija un durmiente (vacío: el primero). Muestra las fichas de
seguimiento y alarma, las últimas doce horas en hipnograma, la fase, la próxima alarma, la duración
de la última noche, por dónde llegan los eventos (MQTT o Gladys Plus) y un botón **Restablecer**.

## Solución de problemas

- **No llega nada por MQTT**: `localhost` y `127.0.0.1` apuntan al propio contenedor de la
  integración, use la dirección de red del bróker. **Probar la conexión** muestra la respuesta del
  bróker (contraseña rechazada, inaccesible…). El tema de la app debe ser el de la configuración,
  mayúsculas incluidas.
- **Distintivo «nube» con un punto naranja**: prefiere lo local, hay un bróker configurado pero
  inaccesible, y los eventos llegan por Gladys Plus.
- **«Webhook no disponible»**: Gladys Plus no está vinculado, o falta la clave Open API en el bloque
  Webhooks de Gladys Plus.
- **Se ignora un evento de un durmiente desconocido**: el tema `SleepAsAndroid/<nombre>` o el
  `?sleeper=<nombre>` debe nombrar a un durmiente de la configuración (mayúsculas y acentos no
  importan).
- **El seguimiento sigue activo**: el teléfono se apagó antes de enviar «seguimiento detenido». Use
  **Restablecer** (widget o acción de escena).
