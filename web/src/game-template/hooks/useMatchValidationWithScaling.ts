/**
 * 2026 Game-Specific: Match Validation with Scaling
 * 
 * Wraps the core useMatchValidation hook and adds 2026-specific fuel scaling.
 * This hook adds scaling as a post-processing step after core validation completes.
 */

import { useCallback } from 'react';
import { useMatchValidation } from '@/core/hooks/useMatchValidation';
import type { ValidationConfig, MatchValidationResult } from '@/core/lib/matchValidationTypes';
import { calculateAllianceScaling, updateEntriesWithScaling } from '../matchValidationScaling';
import { toast } from 'sonner';
import { useTBAMatchData } from '@/core/hooks/useTBAMatchData';
import { getEntriesByEvent } from '@/core/db/scoutingDatabase';
import { getCachedTBAMatch } from '@/core/lib/tbaCache';

const normalizeMatchKey = (matchKey: string): string => {
    if (!matchKey.includes('_')) return matchKey;
    return matchKey.split('_')[1] || matchKey;
};

interface UseMatchValidationWithScalingOptions {
    eventKey: string;
    config?: ValidationConfig;
    autoLoad?: boolean;
    enableScaling?: boolean;  // Toggle scaling on/off
}

/**
 * 2026-enhanced validation hook that adds fuel scaling
 */
export function useMatchValidationWithScaling(options: UseMatchValidationWithScalingOptions) {
    const { eventKey, config, autoLoad, enableScaling = true } = options;

    // Use core validation hook
    const coreValidation = useMatchValidation({
        eventKey,
        config,
        autoLoad,
    });

    const { matches: tbaMatches } = useTBAMatchData();

    const getTBAMatchForScaling = useCallback(async (matchKey: string) => {
        const fromHook = tbaMatches.find(m => m.key === matchKey);
        if (fromHook) {
            return fromHook;
        }

        return getCachedTBAMatch(matchKey, true);
    }, [tbaMatches]);

    /**
     * Enhanced validateMatch that adds scaling after core validation
     */
    const validateMatchWithScaling = useCallback(async (matchKey: string): Promise<MatchValidationResult | null> => {
        // First run core validation
        const result = await coreValidation.validateMatch(matchKey);
        
        if (!result || !enableScaling) {
            return result;
        }

        // Apply 2026 scaling
        try {
            // Find TBA match data
            const tbaMatch = await getTBAMatchForScaling(matchKey);
            if (!tbaMatch || !tbaMatch.score_breakdown) {
                console.log('[2026 Scaling] No TBA data for scaling:', matchKey);
                return result;
            }

            // Get scouting entries for this match
            const allEntries = await getEntriesByEvent(eventKey);
            const normalizedMatchKey = normalizeMatchKey(matchKey);
            const matchEntries = allEntries.filter(e => normalizeMatchKey(e.matchKey) === normalizedMatchKey);

            if (matchEntries.length === 0) {
                return result;
            }

            // Split by alliance
            const redEntries = matchEntries.filter(e => e.allianceColor === 'red');
            const blueEntries = matchEntries.filter(e => e.allianceColor === 'blue');

            // Get TBA breakdowns (Match_Score_Breakdown_2026_Alliance)
            const redBreakdown = tbaMatch.score_breakdown.red as Record<string, unknown>;
            const blueBreakdown = tbaMatch.score_breakdown.blue as Record<string, unknown>;

            // Calculate and apply scaling (extraction happens inside calculateAllianceScaling)
            const redScaling = calculateAllianceScaling(
                'red',
                redEntries,
                redBreakdown
            );

            const blueScaling = calculateAllianceScaling(
                'blue',
                blueEntries,
                blueBreakdown
            );

            // Update database with scaled values
            await updateEntriesWithScaling(eventKey, matchKey, {
                red: redScaling,
                blue: blueScaling,
            });

            console.log('[2026 Scaling] Applied scaling to match:', matchKey);
            toast.success(`Scaling applied to ${matchKey}`, { duration: 2000 });

        } catch (error) {
            console.error('[2026 Scaling] Error applying scaling:', error);
            // Don't fail validation if scaling fails
        }

        return result;
    }, [coreValidation, enableScaling, eventKey, getTBAMatchForScaling]);

    /**
     * Enhanced validateEvent that adds scaling to all matches
     */
    const validateEventWithScaling = useCallback(async () => {
        // First run core validation
        await coreValidation.validateEvent();

        if (!enableScaling) {
            return;
        }

        // Apply scaling to all validated matches
        try {
            const matchesToScale = coreValidation.matchList.filter(m => 
                m.hasScouting && 
                m.hasTBAResults && 
                m.validationResult
            );

            const allEntries = await getEntriesByEvent(eventKey);

            let scaledCount = 0;
            for (const match of matchesToScale) {
                try {
                    // Find TBA match data
                    const tbaMatch = await getTBAMatchForScaling(match.matchKey);
                    if (!tbaMatch || !tbaMatch.score_breakdown) {
                        continue;
                    }

                    // Get scouting entries
                    const normalizedMatchKey = normalizeMatchKey(match.matchKey);
                    const matchEntries = allEntries.filter(e => normalizeMatchKey(e.matchKey) === normalizedMatchKey);

                    if (matchEntries.length === 0) {
                        continue;
                    }

                    // Split by alliance
                    const redEntries = matchEntries.filter(e => e.allianceColor === 'red');
                    const blueEntries = matchEntries.filter(e => e.allianceColor === 'blue');

                    // Get TBA breakdowns
                    const redBreakdown = tbaMatch.score_breakdown.red as Record<string, unknown>;
                    const blueBreakdown = tbaMatch.score_breakdown.blue as Record<string, unknown>;

                    // Calculate and apply scaling
                    const redScaling = calculateAllianceScaling(
                        'red',
                        redEntries,
                        redBreakdown
                    );

                    const blueScaling = calculateAllianceScaling(
                        'blue',
                        blueEntries,
                        blueBreakdown
                    );

                    // Update database
                    await updateEntriesWithScaling(eventKey, match.matchKey, {
                        red: redScaling,
                        blue: blueScaling,
                    });

                    scaledCount++;
                } catch (error) {
                    console.error(`[2026 Scaling] Error scaling match ${match.matchKey}:`, error);
                    // Continue with other matches
                }
            }

            if (scaledCount > 0) {
                toast.success(`Applied scaling to ${scaledCount} matches`);
            }

        } catch (error) {
            console.error('[2026 Scaling] Error in batch scaling:', error);
            toast.error('Some matches could not be scaled');
        }
    }, [coreValidation, enableScaling, eventKey, getTBAMatchForScaling]);

    // Return enhanced hook with 2026 scaling
    return {
        ...coreValidation,
        validateMatch: validateMatchWithScaling,
        validateEvent: validateEventWithScaling,
        // Add scaling-specific flag
        scalingEnabled: enableScaling,
    };
}
