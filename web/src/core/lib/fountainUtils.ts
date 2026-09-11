export interface FountainEstimate {
  blockSize: number;
  estimatedBlocks: number;
  redundancyFactor: number;
  targetPackets: number;
}

export type FountainProfile = 'fast' | 'reliable';

export function getFountainEstimate(
  payloadBytes: number,
  profile: FountainProfile = 'fast'
): FountainEstimate {
  let blockSize: number;

  if (profile === 'fast') {
    if (payloadBytes <= 3_000) {
      blockSize = 260;
    } else if (payloadBytes <= 120_000) {
      blockSize = 520;
    } else {
      blockSize = 620;
    }
  } else {
    if (payloadBytes <= 2_500) {
      blockSize = 220;
    } else if (payloadBytes <= 120_000) {
      blockSize = 400;
    } else {
      blockSize = 500;
    }
  }

  const estimatedBlocks = Math.ceil(payloadBytes / blockSize);

  let redundancyFactor: number;
  if (profile === 'fast') {
    if (estimatedBlocks < 12) {
      redundancyFactor = 1.35;
    } else if (estimatedBlocks < 40) {
      redundancyFactor = 1.25;
    } else {
      redundancyFactor = 1.3;
    }
  } else {
    if (estimatedBlocks < 15) {
      redundancyFactor = 1.8;
    } else if (estimatedBlocks < 50) {
      redundancyFactor = 1.5;
    } else {
      redundancyFactor = 1.35;
    }
  }

  return {
    blockSize,
    estimatedBlocks,
    redundancyFactor,
    targetPackets: Math.ceil(estimatedBlocks * redundancyFactor)
  };
}
