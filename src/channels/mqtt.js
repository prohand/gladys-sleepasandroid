// -----------------------------------------------------------------------------
// The local channel: an MQTT subscriber on the user's broker.
//
// Sleep as Android (Settings > Services > Automation > MQTT) publishes every
// event as `{"event": "...", "value1": "..."}` on the topic the user typed.
// This client subscribes to that topic and to everything below it (one
// sub-topic per sleeper), and hands each message to the router. It never
// publishes: the app takes no orders over MQTT.
//
// It lives for the whole run of the integration and reconnects by itself,
// with a backoff from 2 s to one minute: a broker restarted at night must not
// lose the alarm of the morning. A broker that refuses the credentials is
// retried at the slowest pace only, so the logs do not fill up.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import {
  CONNACK_ERRORS,
  DISCONNECT,
  PACKET,
  PINGREQ,
  PacketReader,
  decodePublish,
  encodeAck,
  encodeConnect,
  encodeSubscribe,
} from './mqttPackets.js';

const logger = createLogger({ name: 'mqtt' });

const CONNECT_TIMEOUT_MS = 10_000;

/** Open a TCP or TLS socket to the broker. Replaced in the tests. */
function openSocket({ host, port, secure }) {
  return secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
}

export class MqttSubscriber extends EventEmitter {
  /**
   * @param {object} options
   * @param {{ host: string, port: number, secure: boolean }} options.broker
   * @param {string[]} options.filters topic filters to subscribe to
   * @param {string} [options.username]
   * @param {string} [options.password]
   * @param {number} [options.keepalive] seconds
   * @param {number} [options.reconnectMin] ms
   * @param {number} [options.reconnectMax] ms
   * @param {Function} [options.connect] socket factory (tests)
   */
  constructor(options) {
    super();
    this.options = {
      keepalive: 60,
      reconnectMin: 2_000,
      reconnectMax: 60_000,
      connect: openSocket,
      ...options,
    };
    this.clientId = `gladys-saa-${randomBytes(4).toString('hex')}`;
    this.running = false;
    this.connected = false;
    this.lastError = null;
    this.socket = null;
    this.timers = new Set();
    this.attempt = 0;
    this.packetId = 0;
  }

  get address() {
    const { host, port, secure } = this.options.broker;
    return `${secure ? 'mqtts' : 'mqtt'}://${host.includes(':') ? `[${host}]` : host}:${port}`;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.open();
  }

  stop() {
    this.running = false;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      if (this.connected) {
        socket.write(DISCONNECT);
      }
      socket.end();
      socket.destroy();
    }
    this.setConnected(false);
  }

  open() {
    const { broker, connect } = this.options;
    logger.debug(`Connecting to ${this.address}`);
    const socket = connect(broker);
    this.socket = socket;
    const reader = new PacketReader();
    let lastPacketAt = Date.now();
    let fatal = false;

    const connectTimer = this.later(() => {
      this.lastError = `no answer from ${this.address}`;
      socket.destroy();
    }, CONNECT_TIMEOUT_MS);

    socket.once(broker.secure ? 'secureConnect' : 'connect', () => {
      socket.write(
        encodeConnect({
          clientId: this.clientId,
          username: this.options.username,
          password: this.options.password,
          keepalive: this.options.keepalive,
        }),
      );
    });

    socket.on('data', (chunk) => {
      lastPacketAt = Date.now();
      let packets;
      try {
        packets = reader.push(chunk);
      } catch (err) {
        this.lastError = err.message;
        socket.destroy();
        return;
      }
      for (const received of packets) {
        if (received.type === PACKET.CONNACK) {
          this.cancel(connectTimer);
          const code = received.body[1];
          if (code !== 0) {
            this.lastError = `broker refused the connection: ${CONNACK_ERRORS[code] ?? `code ${code}`}`;
            // Wrong credentials do not fix themselves: retry slowly.
            fatal = code === 4 || code === 5;
            socket.destroy();
            return;
          }
          this.attempt = 0;
          this.lastError = null;
          this.packetId = (this.packetId % 0xffff) + 1;
          socket.write(encodeSubscribe(this.packetId, this.options.filters));
          this.setConnected(true);
          logger.info(
            `Connected to ${this.address}, listening to ${this.options.filters.join(', ')}`,
          );
          this.startKeepAlive(socket, () => lastPacketAt);
        } else if (received.type === PACKET.SUBACK) {
          const refused = [...received.body.subarray(2)].some((code) => code === 0x80);
          if (refused) {
            this.lastError = 'the broker refused the subscription (check the topic ACL)';
            logger.warn(this.lastError);
          }
        } else if (received.type === PACKET.PUBLISH) {
          this.onPublish(socket, received);
        } else if (received.type === PACKET.PUBREL) {
          socket.write(encodeAck(PACKET.PUBCOMP, received.body.readUInt16BE(0)));
        }
      }
    });

    socket.on('error', (err) => {
      this.lastError = err.code ? `${err.code} (${this.address})` : err.message;
    });

    socket.on('close', () => {
      this.cancel(connectTimer);
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.clearTimers();
      const wasConnected = this.connected;
      this.setConnected(false);
      if (!this.running) {
        return;
      }
      const { reconnectMin, reconnectMax } = this.options;
      const delay = fatal ? reconnectMax : Math.min(reconnectMin * 2 ** this.attempt, reconnectMax);
      this.attempt += 1;
      const reason = this.lastError ?? 'connection closed';
      if (wasConnected || this.attempt === 1) {
        logger.warn(`MQTT link lost (${reason}), retrying in ${Math.round(delay / 1000)} s`);
      } else {
        logger.debug(`MQTT still down (${reason}), retrying in ${Math.round(delay / 1000)} s`);
      }
      this.later(() => this.running && this.open(), delay);
    });
  }

  onPublish(socket, received) {
    let message;
    try {
      message = decodePublish(received);
    } catch {
      logger.warn('Malformed PUBLISH ignored');
      return;
    }
    if (message.qos === 1) {
      socket.write(encodeAck(PACKET.PUBACK, message.packetId));
    } else if (message.qos === 2) {
      socket.write(encodeAck(PACKET.PUBREC, message.packetId));
    }
    // A retained message is the LAST event published before we subscribed —
    // maybe yesterday's alarm. Replaying it on every reconnection would ring
    // scenes for something long over: only live events count.
    if (message.retain) {
      logger.debug(`Retained message on ${message.topic} ignored`);
      return;
    }
    this.emit('message', message.topic, message.payload);
  }

  startKeepAlive(socket, lastPacketAt) {
    const period = this.options.keepalive * 1000;
    const tick = () => {
      if (this.socket !== socket) {
        return;
      }
      // 1.5 keep-alive periods without a byte: the broker is gone (3.1.2.10).
      if (Date.now() - lastPacketAt() > period * 1.5) {
        this.lastError = `${this.address} stopped answering`;
        socket.destroy();
        return;
      }
      socket.write(PINGREQ);
      this.later(tick, period);
    };
    this.later(tick, period);
  }

  setConnected(connected) {
    if (this.connected !== connected) {
      this.connected = connected;
      this.emit('status', connected);
    }
  }

  later(fn, delay) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  cancel(timer) {
    clearTimeout(timer);
    this.timers.delete(timer);
  }

  clearTimers() {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
