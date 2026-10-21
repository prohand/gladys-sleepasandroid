// -----------------------------------------------------------------------------
// The handful of MQTT 3.1.1 packets a subscriber needs, encoded and decoded.
//
// Sleep as Android publishes one small JSON per event, and this integration
// only listens: CONNECT, SUBSCRIBE, PUBLISH (received, QoS 0 or 1), the
// matching acknowledgements and the keep-alive pings are the whole protocol.
// Writing them here (~150 lines) keeps the SDK the only runtime dependency of
// the image, like the other integrations of this family.
//
// Reference: MQTT Version 3.1.1, OASIS Standard, sections 2 and 3.
// -----------------------------------------------------------------------------

export const PACKET = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  PUBREC: 5,
  PUBREL: 6,
  PUBCOMP: 7,
  SUBSCRIBE: 8,
  SUBACK: 9,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
};

/** CONNACK return codes (3.2.2.3), as a reader of the logs needs them. */
export const CONNACK_ERRORS = {
  1: 'unacceptable protocol version',
  2: 'client identifier rejected',
  3: 'server unavailable',
  4: 'bad user name or password',
  5: 'not authorized',
};

function encodeLength(length) {
  const bytes = [];
  do {
    let byte = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (length > 0);
  return Buffer.from(bytes);
}

function encodeString(text) {
  const body = Buffer.from(String(text), 'utf8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(body.length);
  return Buffer.concat([length, body]);
}

function packet(type, flags, body = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([(type << 4) | flags]), encodeLength(body.length), body]);
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

/**
 * @param {object} options
 * @param {string} options.clientId
 * @param {string} [options.username]
 * @param {string} [options.password]
 * @param {number} options.keepalive seconds
 */
export function encodeConnect({ clientId, username, password, keepalive }) {
  let flags = 0x02; // clean session: nothing to resume, the events are live
  const payload = [encodeString(clientId)];
  if (username) {
    flags |= 0x80;
    payload.push(encodeString(username));
    // A password without a user name is a protocol error (3.1.2.9).
    if (password) {
      flags |= 0x40;
      payload.push(encodeString(password));
    }
  }
  const body = Buffer.concat([
    encodeString('MQTT'),
    Buffer.from([4, flags]),
    uint16(keepalive),
    ...payload,
  ]);
  return packet(PACKET.CONNECT, 0, body);
}

/** One SUBSCRIBE carrying every filter, each at QoS 1. */
export function encodeSubscribe(packetId, filters) {
  const body = Buffer.concat([
    uint16(packetId),
    ...filters.flatMap((filter) => [encodeString(filter), Buffer.from([1])]),
  ]);
  return packet(PACKET.SUBSCRIBE, 0x02, body);
}

export function encodeAck(type, packetId) {
  // PUBREL is the one acknowledgement with reserved flags 0b0010 (3.6.1).
  return packet(type, type === PACKET.PUBREL ? 0x02 : 0, uint16(packetId));
}

export const PINGREQ = packet(PACKET.PINGREQ, 0);
export const DISCONNECT = packet(PACKET.DISCONNECT, 0);

/** Encode a PUBLISH (QoS 0): used by the tests' fake broker. */
export function encodePublish(topic, payload, { retain = false } = {}) {
  return packet(
    PACKET.PUBLISH,
    retain ? 0x01 : 0,
    Buffer.concat([encodeString(topic), Buffer.from(payload)]),
  );
}

/**
 * Split a TCP stream into packets. TCP has no message boundaries: a read can
 * hold half a packet or three of them, so bytes are kept until a whole packet
 * is there.
 */
export class PacketReader {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * @param {Buffer} chunk bytes just read
   * @returns {{ type: number, flags: number, body: Buffer }[]} the complete packets
   * @throws {Error} on a malformed remaining length
   */
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const packets = [];
    for (;;) {
      if (this.buffer.length < 2) {
        return packets;
      }
      let length = 0;
      let multiplier = 1;
      let offset = 1;
      let complete = false;
      while (offset < this.buffer.length) {
        const byte = this.buffer[offset];
        length += (byte & 0x7f) * multiplier;
        offset += 1;
        if ((byte & 0x80) === 0) {
          complete = true;
          break;
        }
        multiplier *= 128;
        if (offset > 4) {
          throw new Error('malformed MQTT packet length');
        }
      }
      if (!complete || this.buffer.length < offset + length) {
        return packets;
      }
      const header = this.buffer[0];
      packets.push({
        type: header >> 4,
        flags: header & 0x0f,
        body: this.buffer.subarray(offset, offset + length),
      });
      this.buffer = this.buffer.subarray(offset + length);
    }
  }
}

/**
 * Read a received PUBLISH.
 * @returns {{ topic: string, qos: number, retain: boolean, packetId: number|null, payload: Buffer }}
 */
export function decodePublish({ flags, body }) {
  const topicLength = body.readUInt16BE(0);
  const topic = body.subarray(2, 2 + topicLength).toString('utf8');
  const qos = (flags >> 1) & 0x03;
  let offset = 2 + topicLength;
  let packetId = null;
  if (qos > 0) {
    packetId = body.readUInt16BE(offset);
    offset += 2;
  }
  return { topic, qos, retain: (flags & 0x01) === 1, packetId, payload: body.subarray(offset) };
}
