import * as pako from 'pako';
import { getFountainEstimate } from './fountainUtils';

export interface CompressionVariantResult {
  name: string;
  gzipBytes: number;
  estimatedFountainPackets: number;
}

export interface CompressionBenchmarkResult {
  baselineGzipBytes: number;
  baselineFountainPackets: number;
  variants: CompressionVariantResult[];
  bestVariant: CompressionVariantResult;
}

function estimateFountainPackets(bytes: number): number {
  return getFountainEstimate(bytes).targetPackets;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectObjectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(child, keys);
  }
}

function collectStringValueCounts(value: unknown, counts: Map<string, number>): void {
  if (typeof value === 'string') {
    counts.set(value, (counts.get(value) || 0) + 1);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringValueCounts(item, counts);
    return;
  }

  if (!isPlainObject(value)) return;

  for (const child of Object.values(value)) {
    collectStringValueCounts(child, counts);
  }
}

function encodeWithKeyDictionary(value: unknown, keyIndex: Map<string, number>): unknown {
  if (Array.isArray(value)) {
    return value.map(item => encodeWithKeyDictionary(item, keyIndex));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.entries(value).map(([key, child]) => [
    keyIndex.get(key) ?? key,
    encodeWithKeyDictionary(child, keyIndex)
  ]);
}

function encodeWithKeyAndValueDictionary(
  value: unknown,
  keyIndex: Map<string, number>,
  valueIndex: Map<string, number>
): unknown {
  if (typeof value === 'string') {
    const idx = valueIndex.get(value);
    return idx === undefined ? value : ['~', idx];
  }

  if (Array.isArray(value)) {
    return value.map(item => encodeWithKeyAndValueDictionary(item, keyIndex, valueIndex));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.entries(value).map(([key, child]) => [
    keyIndex.get(key) ?? key,
    encodeWithKeyAndValueDictionary(child, keyIndex, valueIndex)
  ]);
}

function isScoutingExportShape(data: unknown): data is {
  entries: Array<Record<string, unknown>>;
  exportedAt?: number;
  version?: string;
} {
  if (!isPlainObject(data)) return false;
  if (!Array.isArray(data.entries)) return false;
  return true;
}

function buildIndex(values: string[]): { values: string[]; index: Map<string, number> } {
  const uniqueValues = Array.from(new Set(values));
  return {
    values: uniqueValues,
    index: new Map(uniqueValues.map((value, idx) => [value, idx]))
  };
}

function encodeScoutingSchemaAware(data: unknown): unknown | null {
  if (!isScoutingExportShape(data)) return null;

  const entries = data.entries;
  if (entries.length === 0) return null;

  const matchKeyDict = buildIndex(
    entries
      .map(entry => entry.matchKey)
      .filter((value): value is string => typeof value === 'string')
  );

  const scoutDict = buildIndex(
    entries
      .map(entry => entry.scoutName)
      .filter((value): value is string => typeof value === 'string')
  );

  const eventDict = buildIndex(
    entries
      .map(entry => entry.eventKey)
      .filter((value): value is string => typeof value === 'string')
  );

  const commentDict = buildIndex(
    entries
      .map(entry => entry.comments)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  );

  const gameKeySet = new Set<string>();
  const extraKeySet = new Set<string>();

  for (const entry of entries) {
    collectObjectKeys(entry.gameData, gameKeySet);
    for (const [key, value] of Object.entries(entry)) {
      if (
        key !== 'id' &&
        key !== 'teamNumber' &&
        key !== 'matchNumber' &&
        key !== 'matchKey' &&
        key !== 'allianceColor' &&
        key !== 'scoutName' &&
        key !== 'eventKey' &&
        key !== 'timestamp' &&
        key !== 'comments' &&
        key !== 'noShow' &&
        key !== 'gameData' &&
        value !== undefined
      ) {
        extraKeySet.add(key);
      }
    }
  }

  const gameKeys = Array.from(gameKeySet);
  const gameKeyIndex = new Map(gameKeys.map((key, idx) => [key, idx]));

  const extraKeys = Array.from(extraKeySet);
  const extraKeyIndex = new Map(extraKeys.map((key, idx) => [key, idx]));

  const timestamps = entries
    .map(entry => entry.timestamp)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const baseTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : 0;

  const rows = entries.map(entry => {
    const extraObject: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (
        key !== 'id' &&
        key !== 'teamNumber' &&
        key !== 'matchNumber' &&
        key !== 'matchKey' &&
        key !== 'allianceColor' &&
        key !== 'scoutName' &&
        key !== 'eventKey' &&
        key !== 'timestamp' &&
        key !== 'comments' &&
        key !== 'noShow' &&
        key !== 'gameData' &&
        value !== undefined
      ) {
        extraObject[key] = value;
      }
    }

    const encodedExtra = Object.keys(extraObject).length > 0
      ? encodeWithKeyDictionary(extraObject, extraKeyIndex)
      : null;

    return [
      entry.id,
      entry.teamNumber,
      entry.matchNumber,
      typeof entry.matchKey === 'string' ? (matchKeyDict.index.get(entry.matchKey) ?? entry.matchKey) : entry.matchKey,
      entry.allianceColor === 'red' ? 0 : 1,
      typeof entry.scoutName === 'string' ? (scoutDict.index.get(entry.scoutName) ?? entry.scoutName) : entry.scoutName,
      typeof entry.eventKey === 'string' ? (eventDict.index.get(entry.eventKey) ?? entry.eventKey) : entry.eventKey,
      typeof entry.timestamp === 'number' ? entry.timestamp - baseTimestamp : entry.timestamp,
      entry.noShow ? 1 : 0,
      typeof entry.comments === 'string' && entry.comments.length > 0
        ? (commentDict.index.get(entry.comments) ?? entry.comments)
        : -1,
      encodeWithKeyDictionary(entry.gameData, gameKeyIndex),
      encodedExtra
    ];
  });

  return {
    t: 'scouting-schema-v1',
    v: typeof data.version === 'string' ? data.version : 'unknown',
    x: typeof data.exportedAt === 'number' ? data.exportedAt : 0,
    b: baseTimestamp,
    mk: matchKeyDict.values,
    sn: scoutDict.values,
    ek: eventDict.values,
    cm: commentDict.values,
    gk: gameKeys,
    xk: extraKeys,
    r: rows
  };
}

export function benchmarkCompressionVariants(data: unknown): CompressionBenchmarkResult {
  const baselineJson = JSON.stringify(data);
  const baselineGzipBytes = pako.gzip(baselineJson).length;
  const baselineFountainPackets = estimateFountainPackets(baselineGzipBytes);

  const variants: CompressionVariantResult[] = [
    {
      name: 'Baseline gzip',
      gzipBytes: baselineGzipBytes,
      estimatedFountainPackets: baselineFountainPackets
    }
  ];

  const keySet = new Set<string>();
  collectObjectKeys(data, keySet);
  const keys = Array.from(keySet);

  if (keys.length > 0) {
    const keyIndex = new Map(keys.map((key, index) => [key, index]));
    const keyEncodedPayload = {
      k: keys,
      d: encodeWithKeyDictionary(data, keyIndex)
    };
    const keyEncodedBytes = pako.gzip(JSON.stringify(keyEncodedPayload)).length;
    variants.push({
      name: 'Key dictionary + gzip',
      gzipBytes: keyEncodedBytes,
      estimatedFountainPackets: estimateFountainPackets(keyEncodedBytes)
    });

    const stringCounts = new Map<string, number>();
    collectStringValueCounts(data, stringCounts);
    const valueDictionary = Array.from(stringCounts.entries())
      .filter(([value, count]) => count >= 3 && value.length >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 256)
      .map(([value]) => value);

    if (valueDictionary.length > 0) {
      const valueIndex = new Map(valueDictionary.map((value, index) => [value, index]));
      const keyAndValueEncodedPayload = {
        k: keys,
        s: valueDictionary,
        d: encodeWithKeyAndValueDictionary(data, keyIndex, valueIndex)
      };
      const keyAndValueBytes = pako.gzip(JSON.stringify(keyAndValueEncodedPayload)).length;
      variants.push({
        name: 'Key+value dictionary + gzip',
        gzipBytes: keyAndValueBytes,
        estimatedFountainPackets: estimateFountainPackets(keyAndValueBytes)
      });
    }
  }

  const schemaAwarePayload = encodeScoutingSchemaAware(data);
  if (schemaAwarePayload) {
    const schemaAwareBytes = pako.gzip(JSON.stringify(schemaAwarePayload)).length;
    variants.push({
      name: 'Scouting schema-aware + gzip',
      gzipBytes: schemaAwareBytes,
      estimatedFountainPackets: estimateFountainPackets(schemaAwareBytes)
    });
  }

  const bestVariant = variants.reduce((best, current) => {
    if (current.estimatedFountainPackets < best.estimatedFountainPackets) {
      return current;
    }
    if (
      current.estimatedFountainPackets === best.estimatedFountainPackets &&
      current.gzipBytes < best.gzipBytes
    ) {
      return current;
    }
    return best;
  });

  return {
    baselineGzipBytes,
    baselineFountainPackets,
    variants,
    bestVariant
  };
}
