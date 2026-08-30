import { deserialize, serialize } from 'node:v8'

/**
 * jsdom does not expose `structuredClone`, and fake-indexeddb needs one to
 * store records. v8's serializer implements the same algorithm.
 */
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (<T>(value: T): T => deserialize(serialize(value)) as T) as typeof structuredClone
}

export {}
