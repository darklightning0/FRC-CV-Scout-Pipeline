import { describe, expect, it } from 'vitest';
import { buildCompactPacketJson, buildLegacyPacketJson, parseScannedFountainPacket } from './fountainPacket';

describe('fountainPacket compatibility', () => {
  it('parses compact packet format used by generator', () => {
    const json = buildCompactPacketJson({
      type: 'scouting_fountain_packet',
      sessionId: 'session_123',
      packetId: 7,
      totalPackets: 42,
      profile: 'fast',
      data: 'abcd'
    });

    const parsed = parseScannedFountainPacket(json);

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('scouting_fountain_packet');
    expect(parsed?.sessionId).toBe('session_123');
    expect(parsed?.packetId).toBe(7);
    expect(parsed?.totalPackets).toBe(42);
    expect(parsed?.data).toBe('abcd');
    expect(parsed?.profile).toBe('fast');
  });

  it('parses legacy packet format for backward compatibility', () => {
    const json = buildLegacyPacketJson({
      type: 'scouting_fountain_packet',
      sessionId: 'legacy_session',
      packetId: 3,
      totalPackets: 18,
      data: 'xyz',
      k: 10,
      bytes: 200,
      checksum: '1234',
      indices: [1, 2]
    });

    const parsed = parseScannedFountainPacket(json);

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('scouting_fountain_packet');
    expect(parsed?.sessionId).toBe('legacy_session');
    expect(parsed?.packetId).toBe(3);
    expect(parsed?.totalPackets).toBe(18);
    expect(parsed?.data).toBe('xyz');
    expect(parsed?.indices).toEqual([1, 2]);
  });

  it('serializes reliable packets in legacy full-field format', () => {
    const json = buildLegacyPacketJson({
      type: 'scouting_fountain_packet',
      sessionId: 'legacy_session_2',
      packetId: 9,
      data: 'payload',
      k: 44,
      bytes: 520,
      checksum: '9999',
      indices: [2, 8, 11]
    });

    const raw = JSON.parse(json) as Record<string, unknown>;

    expect(raw.type).toBe('scouting_fountain_packet');
    expect(raw.sessionId).toBe('legacy_session_2');
    expect(raw.packetId).toBe(9);
    expect(raw.k).toBe(44);
    expect(raw.bytes).toBe(520);
    expect(raw.checksum).toBe('9999');
    expect(raw.indices).toEqual([2, 8, 11]);
    expect(raw.data).toBe('payload');
    expect(raw.t).toBeUndefined();
  });

  it('returns null for invalid packet payload', () => {
    expect(parseScannedFountainPacket('not-json')).toBeNull();
    expect(parseScannedFountainPacket(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });
});
