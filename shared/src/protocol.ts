import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export const messageCustom = 2;

const valueTypeString = 0;
const valueTypeBoolean = 1;

/**
 * Encode the inner payload of a custom message (type + key-value pairs).
 * This is the inner content that gets wrapped by the messageCustom envelope.
 *
 * @param type - Message type identifier (e.g. 'star', 'restore')
 * @param payload - Key-value map; strings and booleans supported
 * @returns Encoded inner payload bytes
 */
export function encodeInnerPayload(
  type: string,
  payload: Record<string, string | boolean>
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, type);
  for (const [key, value] of Object.entries(payload)) {
    encoding.writeVarString(encoder, key);
    if (typeof value === 'string') {
      encoding.writeVarUint(encoder, valueTypeString);
      encoding.writeVarString(encoder, value);
    } else {
      encoding.writeVarUint(encoder, valueTypeBoolean);
      encoding.writeVarUint(encoder, value ? 1 : 0);
    }
  }
  return encoding.toUint8Array(encoder);
}

/**
 * Encode a full custom message payload into a Uint8Array.
 *
 * Wire format: messageCustom (varuint) | inner payload length (varuint8array)
 * Inner payload: type (varstring) | key-value pairs (varstring key, varuint type, value)
 *
 * @param type - Message type identifier (e.g. 'star', 'restore')
 * @param payload - Key-value map; strings and booleans supported
 * @returns Encoded message ready to send over WebSocket
 */
export function encodeCustomMessage(
  type: string,
  payload: Record<string, string | boolean>
): Uint8Array {
  return wrapCustomMessage(encodeInnerPayload(type, payload));
}

/**
 * Decode a custom message payload from a Uint8Array.
 *
 * @param data - Raw inner payload (after message type has been stripped)
 * @returns The message type and decoded key-value payload
 */
export function decodeCustomMessage(data: Uint8Array): {
  type: string;
  payload: Record<string, string | boolean>;
} {
  try {
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarString(decoder);
    const payload: Record<string, string | boolean> = {};

    while (decoder.pos < data.length) {
      const key = decoding.readVarString(decoder);
      const valueType = decoding.readVarUint(decoder);
      switch (valueType) {
        case valueTypeString:
          payload[key] = decoding.readVarString(decoder);
          break;
        case valueTypeBoolean:
          payload[key] = decoding.readVarUint(decoder) === 1;
          break;
      }
    }

    return { type, payload };
  } catch (err) {
    throw new Error(
      `Failed to decode custom message: ${err instanceof Error ? err.message : err}`,
      { cause: err }
    );
  }
}

/**
 * Wrap an encoded inner payload with the outer message envelope.
 * Used by the server to rebroadcast received custom messages.
 *
 * @param innerPayload - Already-encoded inner payload bytes
 * @returns Full encoded message with envelope
 */
export function wrapCustomMessage(innerPayload: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageCustom);
  encoding.writeVarUint8Array(encoder, innerPayload);
  return encoding.toUint8Array(encoder);
}
