import { describe, expect, it } from 'vitest';
import { benchmarkCompressionVariants } from './compressionBenchmark';

function createSyntheticScoutingPayload(entryCount: number) {
  const entries = Array.from({ length: entryCount }, (_, index) => {
    const matchNumber = Math.floor(index / 6) + 1;
    const station = (index % 6) + 1;
    const allianceColor = station <= 3 ? 'red' : 'blue';

    return {
      id: `2026test_qm${matchNumber}_${allianceColor}_${station}`,
      teamNumber: 1000 + (index % 30),
      matchNumber,
      matchKey: `qm${matchNumber}`,
      allianceColor,
      scoutName: `Scout-${(index % 8) + 1}`,
      eventKey: '2026test',
      timestamp: 1738900000000 + index * 1000,
      noShow: false,
      comments: index % 4 === 0 ? 'Defense heavy match' : '',
      gameData: {
        autoActions: ['leave', 'score', 'score'],
        teleopActions: ['score', 'score', 'assist', 'score'],
        endgame: index % 3 === 0 ? 'park' : 'climb',
        robotStatus: ['normal', 'normal', index % 5 === 0 ? 'disabled' : 'normal'],
        penalties: index % 7 === 0 ? ['foul'] : []
      }
    };
  });

  return {
    entries,
    exportedAt: Date.now(),
    version: '3.0-maneuver-core'
  };
}

describe('benchmarkCompressionVariants', () => {
  it('outputs benchmark results to console and returns sensible packet estimates', () => {
    const payload = createSyntheticScoutingPayload(60);
    const result = benchmarkCompressionVariants(payload);

    const reductionPct = result.baselineGzipBytes > 0
      ? ((1 - (result.bestVariant.gzipBytes / result.baselineGzipBytes)) * 100).toFixed(1)
      : '0.0';

    console.log('[Compression Benchmark]');
    console.table(
      result.variants.map(variant => ({
        variant: variant.name,
        bytes: variant.gzipBytes,
        packets: variant.estimatedFountainPackets,
        reduction: result.baselineGzipBytes > 0
          ? `${((1 - (variant.gzipBytes / result.baselineGzipBytes)) * 100).toFixed(1)}%`
          : '0.0%'
      }))
    );
    console.log(`[Compression Benchmark] Best: ${result.bestVariant.name} (${reductionPct}% smaller)`);

    expect(result.baselineGzipBytes).toBeGreaterThan(0);
    expect(result.baselineFountainPackets).toBeGreaterThan(0);
    expect(result.bestVariant.gzipBytes).toBeLessThanOrEqual(result.baselineGzipBytes);
    expect(result.bestVariant.estimatedFountainPackets).toBeLessThanOrEqual(result.baselineFountainPackets);
  });

  it('prints benchmark results for larger event-sized payloads', () => {
    const payload = createSyntheticScoutingPayload(360);
    const result = benchmarkCompressionVariants(payload);

    const reductionPct = result.baselineGzipBytes > 0
      ? ((1 - (result.bestVariant.gzipBytes / result.baselineGzipBytes)) * 100).toFixed(1)
      : '0.0';

    console.log('[Compression Benchmark - Large Payload]');
    console.table(
      result.variants.map(variant => ({
        variant: variant.name,
        bytes: variant.gzipBytes,
        packets: variant.estimatedFountainPackets,
        reduction: result.baselineGzipBytes > 0
          ? `${((1 - (variant.gzipBytes / result.baselineGzipBytes)) * 100).toFixed(1)}%`
          : '0.0%'
      }))
    );
    console.log(`[Compression Benchmark - Large Payload] Best: ${result.bestVariant.name} (${reductionPct}% smaller)`);

    expect(result.baselineGzipBytes).toBeGreaterThan(0);
    expect(result.baselineFountainPackets).toBeGreaterThan(0);
    expect(result.bestVariant.gzipBytes).toBeLessThanOrEqual(result.baselineGzipBytes);
    expect(result.bestVariant.estimatedFountainPackets).toBeLessThanOrEqual(result.baselineFountainPackets);
  });
});
