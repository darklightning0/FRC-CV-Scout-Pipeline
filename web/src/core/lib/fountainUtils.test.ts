import { describe, expect, it } from 'vitest';
import { getFountainEstimate } from './fountainUtils';

describe('getFountainEstimate', () => {
  it('keeps packet estimates monotonic for smaller payloads in fast profile', () => {
    const larger = getFountainEstimate(12000, 'fast').targetPackets;
    const medium = getFountainEstimate(10000, 'fast').targetPackets;
    const smaller = getFountainEstimate(8000, 'fast').targetPackets;

    expect(medium).toBeLessThanOrEqual(larger);
    expect(smaller).toBeLessThanOrEqual(medium);
  });

  it('keeps packet estimates monotonic for smaller payloads in reliable profile', () => {
    const larger = getFountainEstimate(12000, 'reliable').targetPackets;
    const medium = getFountainEstimate(10000, 'reliable').targetPackets;
    const smaller = getFountainEstimate(8000, 'reliable').targetPackets;

    expect(medium).toBeLessThanOrEqual(larger);
    expect(smaller).toBeLessThanOrEqual(medium);
  });
});
