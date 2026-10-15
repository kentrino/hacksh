import { stripVTControlCharacters } from "node:util";
import { summarizeError } from "./errors.ts";

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[Unserializable]";
  }
}

function normalizeProperty(value: object, key: PropertyKey, ancestors: Set<object>): unknown {
  try {
    return normalizeJson(Reflect.get(value, key), ancestors);
  } catch {
    return "[Unserializable]";
  }
}

function normalizedKeys(value: object): string[] | undefined {
  try {
    return Object.keys(value);
  } catch {
    return undefined;
  }
}

const noToJson = Symbol("noToJson");

function normalizedToJson(value: object, ancestors: Set<object>): unknown {
  let toJSON: unknown;
  try {
    toJSON = Reflect.get(value, "toJSON");
  } catch {
    return noToJson;
  }
  if (typeof toJSON !== "function") return noToJson;
  try {
    const result = Reflect.apply(toJSON, value, []);
    return result === value ? noToJson : normalizeJson(result, ancestors);
  } catch {
    return noToJson;
  }
}

function isArrayBufferView(value: object): value is ArrayBufferView {
  try {
    return ArrayBuffer.isView(value);
  } catch {
    return false;
  }
}

/** Normalize arbitrary event data into values accepted by JSON.stringify. */
export function normalizeJson(value: unknown, ancestors = new Set<object>()): unknown {
  switch (typeof value) {
    case "string":
      return stripVTControlCharacters(value);
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : null;
    case "bigint":
      return value.toString();
    case "undefined":
      return "[undefined]";
    case "symbol":
      return `[symbol:${stripVTControlCharacters(value.description ?? "")}]`;
    case "function":
      return `[function:${stripVTControlCharacters(value.name || "anonymous")}]`;
    case "object":
      break;
  }
  if (value === null) return null;
  if (ancestors.has(value)) return "[Circular]";

  const nextAncestors = new Set(ancestors).add(value);
  if (value instanceof Error) return normalizeJson(summarizeError(value), nextAncestors);

  const jsonValue = normalizedToJson(value, nextAncestors);
  if (jsonValue !== noToJson) return jsonValue;

  if (isArrayBufferView(value)) {
    if (value instanceof DataView) {
      return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    try {
      return Array.from(value as unknown as Iterable<unknown>, (item) =>
        normalizeJson(item, nextAncestors),
      );
    } catch {
      return "[Unserializable]";
    }
  }
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (Array.isArray(value)) {
    return Array.from({ length: value.length }, (_, index) =>
      normalizeProperty(value, index, nextAncestors),
    );
  }
  if (value instanceof Map) {
    try {
      return [...value].map(([key, item]) => [
        normalizeJson(key, nextAncestors),
        normalizeJson(item, nextAncestors),
      ]);
    } catch {
      return "[Unserializable]";
    }
  }
  if (value instanceof Set) {
    try {
      return [...value].map((item) => normalizeJson(item, nextAncestors));
    } catch {
      return "[Unserializable]";
    }
  }

  const keys = normalizedKeys(value);
  if (!keys) return safeString(value);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[stripVTControlCharacters(key)] = normalizeProperty(value, key, nextAncestors);
  }
  return result;
}
