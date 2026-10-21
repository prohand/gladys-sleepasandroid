import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { MqttSubscriber } from '../src/channels/mqtt.js';
import {
  PACKET,
  PacketReader,
  decodePublish,
  encodeConnect,
  encodePublish,
  encodeSubscribe,
} from '../src/channels/mqttPackets.js';

test('the reader splits a stream cut anywhere into whole packets', () => {
  const stream = Buffer.concat([
    encodePublish('SleepAsAndroid', '{"event":"rem"}'),
    encodePublish('SleepAsAndroid/alice', 'x'.repeat(300)), // two-byte length
  ]);
  for (let cut = 1; cut < stream.length; cut += 7) {
    const reader = new PacketReader();
    const packets = [...reader.push(stream.subarray(0, cut)), ...reader.push(stream.subarray(cut))];
    assert.equal(packets.length, 2, `cut at ${cut}`);
    assert.equal(decodePublish(packets[1]).payload.length, 300);
  }
});

test('CONNECT carries the credentials only when there is a user name', () => {
  const withUser = encodeConnect({ clientId: 'c', username: 'u', password: 'p', keepalive: 60 });
  const anonymous = encodeConnect({ clientId: 'c', password: 'p', keepalive: 60 });
  // Connect flags byte: after fixed header (2) + protocol name (6) + level (1).
  assert.equal(withUser[9], 0xc2);
  assert.equal(anonymous[9], 0x02);
});

test('SUBSCRIBE asks QoS 1 for every filter', () => {
  const [subscribe] = new PacketReader().push(encodeSubscribe(7, ['a', 'a/+']));
  assert.equal(subscribe.type, PACKET.SUBSCRIBE);
  assert.equal(subscribe.flags, 0x02);
  assert.deepEqual([...subscribe.body], [0, 7, 0, 1, 97, 1, 0, 3, 97, 47, 43, 1]);
});

/**
 * A tiny broker: answers CONNECT with `connackCode`, records what the client
 * sends, and lets the test push packets to it.
 */
async function startBroker({ connackCode = 0 } = {}) {
  const received = [];
  const sockets = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    const reader = new PacketReader();
    socket.on('data', (chunk) => {
      for (const packet of reader.push(chunk)) {
        received.push(packet);
        server.emit('packet', packet, socket);
        if (packet.type === PACKET.CONNECT) {
          socket.write(Buffer.from([0x20, 2, 0, connackCode]));
        } else if (packet.type === PACKET.SUBSCRIBE) {
          socket.write(Buffer.from([0x90, 3, packet.body[0], packet.body[1], 1]));
        }
      }
    });
    socket.on('error', () => {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    server,
    received,
    sockets,
    port: server.address().port,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
      await once(server, 'close');
    },
  };
}

function subscriberFor(broker, options = {}) {
  return new MqttSubscriber({
    broker: { host: '127.0.0.1', port: broker.port, secure: false },
    filters: ['SleepAsAndroid', 'SleepAsAndroid/+'],
    username: 'gladys',
    password: 'secret',
    reconnectMin: 20,
    reconnectMax: 50,
    ...options,
  });
}

test('connects, subscribes, delivers live messages and acknowledges QoS 1', async () => {
  const broker = await startBroker();
  const client = subscriberFor(broker);
  const messages = [];
  client.on('message', (topic, payload) => messages.push([topic, payload.toString()]));
  client.start();
  try {
    await once(client, 'status');
    assert.equal(client.connected, true);
    await once(broker.server, 'packet'); // SUBSCRIBE may follow CONNACK
    const subscribe = broker.received.find((p) => p.type === PACKET.SUBSCRIBE);
    assert.ok(subscribe, 'SUBSCRIBE sent');

    const socket = broker.sockets[0];
    socket.write(encodePublish('SleepAsAndroid', '{"event":"rem"}'));
    // Retained: yesterday's event, never replayed.
    socket.write(
      encodePublish('SleepAsAndroid', '{"event":"alarm_alert_start"}', { retain: true }),
    );
    // QoS 1 PUBLISH with packet id 9, built by hand.
    const topic = Buffer.from('SleepAsAndroid/alice');
    const body = Buffer.concat([
      Buffer.from([0, topic.length]),
      topic,
      Buffer.from([0, 9]),
      Buffer.from('{"event":"awake"}'),
    ]);
    socket.write(Buffer.concat([Buffer.from([0x32, body.length]), body]));

    const [puback] = await once(broker.server, 'packet');
    assert.equal(puback.type, PACKET.PUBACK);
    assert.deepEqual([...puback.body], [0, 9]);
    assert.deepEqual(messages, [
      ['SleepAsAndroid', '{"event":"rem"}'],
      ['SleepAsAndroid/alice', '{"event":"awake"}'],
    ]);
  } finally {
    client.stop();
    await broker.close();
  }
});

test('a refused password is reported and retried', async () => {
  const broker = await startBroker({ connackCode: 4 });
  const client = subscriberFor(broker);
  client.start();
  try {
    await once(broker.server, 'packet');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(client.connected, false);
    assert.match(client.lastError, /bad user name or password/);
    // Retried at the slowest pace (50 ms here).
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.ok(broker.received.filter((p) => p.type === PACKET.CONNECT).length >= 2);
  } finally {
    client.stop();
    await broker.close();
  }
});

test('a lost broker is reconnected', async () => {
  const broker = await startBroker();
  const client = subscriberFor(broker);
  client.start();
  try {
    await once(client, 'status');
    broker.sockets[0].destroy();
    const [down] = await once(client, 'status');
    assert.equal(down, false);
    const [up] = await once(client, 'status');
    assert.equal(up, true);
  } finally {
    client.stop();
    await broker.close();
  }
});

test('an unreachable broker is said so, and stop() ends the retries', async () => {
  const broker = await startBroker();
  const port = broker.port;
  await broker.close();
  const client = subscriberFor({ port });
  client.start();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.match(client.lastError, /ECONNREFUSED/);
  client.stop();
  assert.equal(client.timers.size, 0);
});
