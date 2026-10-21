// A stand-in for the MQTT client: the tests decide when the broker is up and
// what it delivers, without a socket.
import { EventEmitter } from 'node:events';

export function createFakeSubscriberFactory() {
  const created = [];
  const factory = (options) => {
    const subscriber = new EventEmitter();
    Object.assign(subscriber, {
      options,
      connected: false,
      lastError: null,
      started: false,
      stopped: false,
      address: `mqtt://${options.broker.host}:${options.broker.port}`,
      start() {
        this.started = true;
      },
      stop() {
        this.stopped = true;
        this.connected = false;
      },
      // Test helpers.
      up() {
        this.connected = true;
        this.emit('status', true);
      },
      deliver(topic, payload) {
        this.emit('message', topic, Buffer.from(JSON.stringify(payload)));
      },
    });
    created.push(subscriber);
    return subscriber;
  };
  factory.created = created;
  factory.last = () => created.at(-1);
  return factory;
}
