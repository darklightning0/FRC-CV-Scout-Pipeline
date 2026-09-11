import type { FountainProfile } from './fountainUtils';

export interface FountainPacket {
  type: string;
  sessionId: string;
  packetId: number;
  totalPackets?: number;
  data: string;
  profile?: FountainProfile;
  k?: number;
  bytes?: number;
  checksum?: string;
  indices?: number[];
}

interface CompactFountainPacket {
  t?: string;
  s?: string;
  i?: number;
  n?: number;
  d?: string;
  p?: FountainProfile;
  v?: number;
}

export function buildCompactPacketJson(packet: {
  type: string;
  sessionId: string;
  packetId: number;
  totalPackets?: number;
  data: string;
  profile: FountainProfile;
}): string {
  return JSON.stringify({
    t: packet.type,
    s: packet.sessionId,
    i: packet.packetId,
    n: packet.totalPackets,
    p: packet.profile,
    v: 1,
    d: packet.data
  });
}

export function buildLegacyPacketJson(packet: {
  type: string;
  sessionId: string;
  packetId: number;
  totalPackets?: number;
  data: string;
  k: number;
  bytes: number;
  checksum: string;
  indices: number[];
}): string {
  return JSON.stringify({
    type: packet.type,
    sessionId: packet.sessionId,
    packetId: packet.packetId,
    totalPackets: packet.totalPackets,
    data: packet.data,
    k: packet.k,
    bytes: packet.bytes,
    checksum: packet.checksum,
    indices: packet.indices
  });
}

export function parseScannedFountainPacket(rawValue: string): FountainPacket | null {
  try {
    const parsed = JSON.parse(rawValue) as FountainPacket & CompactFountainPacket;

    if (parsed.t && parsed.s && parsed.i !== undefined && parsed.d) {
      return {
        type: parsed.t,
        sessionId: parsed.s,
        packetId: parsed.i,
        totalPackets: parsed.n,
        data: parsed.d,
        profile: parsed.p
      };
    }

    if (parsed.type && parsed.sessionId && parsed.packetId !== undefined && parsed.data) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}
