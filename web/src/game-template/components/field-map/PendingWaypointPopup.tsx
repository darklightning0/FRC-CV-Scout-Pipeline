/**
 * PendingWaypointPopup - Shared popup for fuel/climb selection
 * 
 * Used by both Auto and Teleop phases:
 * - Auto: Simple success/fail climb selection
 * - Teleop: Level selection (L1/L2/L3) + success/fail
 */

import { Button } from '@/core/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Input } from '@/core/components/ui/input';
import { Kbd } from '@/core/components/ui/kbd';
import { ArrowLeft, Check, X, Undo2 } from 'lucide-react';
import { cn } from '@/core/lib/utils';
import type { PathWaypoint, ClimbLevel, ClimbResult, ClimbLocation } from './types';
import { getFuelOptions, CLIMB_LEVELS } from './constants';
import { useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface PendingWaypointPopupProps {
    pendingWaypoint: PathWaypoint;
    accumulatedFuel: number;
    fuelHistory: number[];
    isFieldRotated: boolean;
    alliance: 'red' | 'blue'; // Alliance determines popup position
    robotCapacity?: number; // Fuel capacity from pit scouting

    // Fuel callbacks
    onFuelSelect: (value: number, label: string) => void;
    onFuelUndo: () => void;

    // Climb callbacks
    climbResult: ClimbResult | null;
    onClimbResultSelect: (result: ClimbResult) => void;
    allowClimbFail?: boolean;
    skipClimbOutcomeSelection?: boolean;

    // Teleop climb level (optional - only Teleop uses this)
    climbWithLocation?: boolean;
    climbWithLevels?: boolean;
    climbLevel?: ClimbLevel;
    onClimbLevelSelect?: (level: ClimbLevel | undefined) => void;
    climbLocation?: ClimbLocation;
    onClimbLocationSelect?: (location: ClimbLocation | undefined) => void;

    // Actions
    onConfirm: (climbStartTimeSecRemaining?: number | null) => void;
    onCancel: () => void;
    focusClimbTimeInputOnOpen?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PendingWaypointPopup({
    pendingWaypoint,
    accumulatedFuel,
    fuelHistory,
    isFieldRotated,
    alliance,
    robotCapacity,
    onFuelSelect,
    onFuelUndo,
    climbResult,
    onClimbResultSelect,
    allowClimbFail = true,
    skipClimbOutcomeSelection = false,
    climbWithLocation = false,
    climbWithLevels = false,
    climbLevel,
    onClimbLevelSelect,
    climbLocation,
    onClimbLocationSelect,
    onConfirm,
    onCancel,
    focusClimbTimeInputOnOpen = false,
}: PendingWaypointPopupProps) {
    const isClimb = pendingWaypoint.type === 'climb';
    const requiresClimbLocation = climbWithLocation || climbWithLevels;
    const fuelOptions = getFuelOptions(robotCapacity);
    const [climbStartTimeSecRemaining, setClimbStartTimeSecRemaining] = useState<number | null>(
        pendingWaypoint.climbStartTimeSecRemaining ?? null
    );
    const [isSelectingClimbTime, setIsSelectingClimbTime] = useState(isClimb);
    const [pendingClimbLocation, setPendingClimbLocation] = useState<ClimbLocation | undefined>(
        climbLocation
    );
    const [pendingClimbLevel, setPendingClimbLevel] = useState<ClimbLevel | undefined>(
        climbLevel
    );
    const climbTimePresets = useMemo(
        () => (climbWithLevels ? [30, 25, 20, 15, 10, 5] : [20, 15, 10, 5]),
        [climbWithLevels]
    );
    const climbTimeMax = climbWithLevels ? 135 : 20;
    
    // Prevent immediate clicks after popup appears
    const justOpenedRef = useRef(true);
    const climbTimeInputRef = useRef<HTMLInputElement | null>(null);
    
    useEffect(() => {
        justOpenedRef.current = true;
        const timer = setTimeout(() => {
            justOpenedRef.current = false;
        }, 150); // Small delay to prevent the initial click from triggering buttons
        
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isClimb) return;
        setIsSelectingClimbTime(true);
    }, [isClimb, pendingWaypoint.id]);

    useEffect(() => {
        setPendingClimbLocation(climbLocation);
    }, [climbLocation]);

    useEffect(() => {
        setPendingClimbLevel(climbLevel);
    }, [climbLevel]);

    useEffect(() => {
        if (!focusClimbTimeInputOnOpen || !isClimb || !isSelectingClimbTime) return;

        let retryTimeoutId: number | null = null;
        let finalRetryTimeoutId: number | null = null;

        const focusClimbInput = (): boolean => {
            const input = climbTimeInputRef.current;
            if (!input) return false;

            input.focus({ preventScroll: true });
            input.select();
            return document.activeElement === input;
        };

        const frameId = window.requestAnimationFrame(() => {
            const focusedImmediately = focusClimbInput();
            if (focusedImmediately) return;

            retryTimeoutId = window.setTimeout(() => {
                const focusedOnRetry = focusClimbInput();
                if (focusedOnRetry) return;

                finalRetryTimeoutId = window.setTimeout(() => {
                    focusClimbInput();
                }, 120);
            }, 0);
        });

        return () => {
            window.cancelAnimationFrame(frameId);
            if (retryTimeoutId !== null) window.clearTimeout(retryTimeoutId);
            if (finalRetryTimeoutId !== null) window.clearTimeout(finalRetryTimeoutId);
        };
    }, [focusClimbTimeInputOnOpen, isClimb, isSelectingClimbTime, pendingWaypoint.id]);

    // Determine if confirm is enabled
    const hasRequiredClimbSelection = climbWithLevels
        ? climbLocation !== undefined && climbLevel !== undefined && climbResult !== null
        : (requiresClimbLocation
            ? climbLocation !== undefined && climbResult !== null
            : climbResult !== null);

    const canConfirm = isClimb
        ? (isSelectingClimbTime
            ? climbStartTimeSecRemaining !== null
            : (
                (requiresClimbLocation && !climbLocation)
                    ? pendingClimbLocation !== undefined
                    : ((climbWithLevels && !climbLevel)
                        ? pendingClimbLevel !== undefined
                        : (skipClimbOutcomeSelection
                            ? climbStartTimeSecRemaining !== null
                            : (climbStartTimeSecRemaining !== null && hasRequiredClimbSelection)))
            ))
        : accumulatedFuel > 0;

    const fuelShortcutOptions = useMemo(() => fuelOptions.slice(0, 10), [fuelOptions]);
    const fuelShortcutKeys = useMemo(() => ['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g'], []);
    const climbTimeShortcutKeys = useMemo(() => ['a', 's', 'd', 'f', 'g', 'h'], []);
    const climbTimeShortcutLabel = useMemo(
        () => climbTimeShortcutKeys.slice(0, climbTimePresets.length).map((key) => key.toUpperCase()).join('/'),
        [climbTimePresets.length, climbTimeShortcutKeys]
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key;
            const normalizedKey = key.toLowerCase();
            const isSpace = event.code === 'Space' || key === ' ' || normalizedKey === 'spacebar';
            const target = event.target as HTMLElement | null;
            const isEditableTarget =
                !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

            if (isClimb && isSelectingClimbTime) {
                const presetIndex = climbTimeShortcutKeys.slice(0, climbTimePresets.length).indexOf(normalizedKey);
                if (presetIndex >= 0) {
                    event.preventDefault();
                    const presetValue = climbTimePresets[presetIndex];
                    if (presetValue === undefined) return;
                    setClimbStartTimeSecRemaining((prev) => prev === presetValue ? null : presetValue);
                    return;
                }
            }

            if (isEditableTarget && normalizedKey !== 'escape' && !isSpace) {
                return;
            }

            if (normalizedKey === 'escape') {
                event.preventDefault();
                onCancel();
                return;
            }

            if (!isClimb && normalizedKey === 'z') {
                event.preventDefault();
                onFuelUndo();
                return;
            }

            if (!isClimb) {
                const alphaIndex = fuelShortcutKeys.indexOf(normalizedKey);
                if (alphaIndex >= 0) {
                    const shortcutOption = fuelShortcutOptions[alphaIndex];
                    if (shortcutOption && !justOpenedRef.current) {
                        event.preventDefault();
                        onFuelSelect(shortcutOption.value, shortcutOption.label);
                    }
                    return;
                }
            }

            if (isClimb && !isSelectingClimbTime && requiresClimbLocation && !climbLocation) {
                if (normalizedKey === 'a') {
                    event.preventDefault();
                    setPendingClimbLocation('side');
                    return;
                }

                if (normalizedKey === 'f') {
                    event.preventDefault();
                    setPendingClimbLocation('middle');
                    return;
                }
            }

            if (isClimb && !isSelectingClimbTime && requiresClimbLocation && !climbLocation && isSpace) {
                if (!pendingClimbLocation) return;
                event.preventDefault();
                onClimbLocationSelect?.(pendingClimbLocation);
                return;
            }

            if (isClimb && !isSelectingClimbTime && climbWithLevels && !climbLevel) {
                if (normalizedKey === 'a') {
                    event.preventDefault();
                    setPendingClimbLevel(1);
                    return;
                }

                if (normalizedKey === 's') {
                    event.preventDefault();
                    setPendingClimbLevel(2);
                    return;
                }

                if (normalizedKey === 'd') {
                    event.preventDefault();
                    setPendingClimbLevel(3);
                    return;
                }
            }

            if (isClimb && !isSelectingClimbTime && climbWithLevels && !climbLevel && isSpace) {
                if (!pendingClimbLevel) return;
                event.preventDefault();
                onClimbLevelSelect?.(pendingClimbLevel);
                return;
            }

            if (isClimb && !isSelectingClimbTime && !skipClimbOutcomeSelection && normalizedKey === 'a') {
                event.preventDefault();
                onClimbResultSelect('success');
                return;
            }

            if (isClimb && !isSelectingClimbTime && !skipClimbOutcomeSelection && allowClimbFail && normalizedKey === 'f') {
                event.preventDefault();
                onClimbResultSelect('fail');
                return;
            }

            if (isSpace && canConfirm) {
                event.preventDefault();
                if (isClimb && isSelectingClimbTime) {
                    if (skipClimbOutcomeSelection) {
                        onConfirm(climbStartTimeSecRemaining);
                        return;
                    }
                    setIsSelectingClimbTime(false);
                    return;
                }
                onConfirm(climbStartTimeSecRemaining);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [
        allowClimbFail,
        canConfirm,
        climbStartTimeSecRemaining,
        climbTimePresets,
        climbTimeShortcutKeys,
        fuelShortcutOptions,
        fuelShortcutKeys,
        climbLevel,
        climbLocation,
        climbWithLevels,
        isClimb,
        isSelectingClimbTime,
        onClimbLevelSelect,
        onClimbLocationSelect,
        onCancel,
        onClimbResultSelect,
        onConfirm,
        onFuelSelect,
        onFuelUndo,
        pendingClimbLevel,
        pendingClimbLocation,
        requiresClimbLocation,
        skipClimbOutcomeSelection,
    ]);

    return (
        <div className={cn(
            "absolute inset-0 z-40 flex items-center pointer-events-none p-2",
            "justify-center",
            alliance === 'blue' ? "md:justify-end" : "md:justify-start"
        )}>
            <Card className={cn(
                "w-full max-w-sm h-fit max-h-[95%] pointer-events-auto shadow-xl flex flex-col border-border/50 bg-background/98 backdrop-blur-sm overflow-hidden gap-2",
                isFieldRotated && "rotate-180"
            )}>
                {/* Header */}
                <CardHeader className="pb-1 shrink-0">
                    <div className="flex items-center justify-center gap-3">
                        <Badge variant="outline" className={cn(
                            "font-bold px-2 py-0.5 shrink-0",
                            pendingWaypoint.type === 'score' ? "text-green-500 border-green-500/50" :
                                pendingWaypoint.type === 'climb' ? "text-blue-500 border-blue-500/50" :
                                    "text-purple-500 border-purple-500/50"
                        )}>
                            {pendingWaypoint.type.toUpperCase()}
                        </Badge>
                        <CardTitle className="text-lg font-bold tracking-tight">
                            {isClimb
                                ? (isSelectingClimbTime
                                    ? 'Select Climb Start Time'
                                    : (climbWithLevels
                                        ? (!climbLocation
                                            ? 'Select Climb Location'
                                            : (climbLevel ? `L${climbLevel} - Select Outcome` : 'Select Level'))
                                        : (requiresClimbLocation
                                            ? (!climbLocation ? 'Select Climb Location' : 'Climb Outcome')
                                            : 'Climb Outcome')))
                                : (accumulatedFuel > 0 ? `Total: +${accumulatedFuel}` : 'Select Amount')}
                        </CardTitle>
                    </div>
                </CardHeader>

                {/* Content */}
                <CardContent className="overflow-y-auto px-2 shrink min-h-0">
                    {isClimb ? (
                        isSelectingClimbTime ? (
                            <div className="space-y-3 p-2">
                                <div className={cn(
                                    "grid gap-2",
                                    climbWithLevels ? "grid-cols-3" : "grid-cols-4"
                                )}>
                                    {climbTimePresets.map((seconds, index) => (
                                        <Button
                                            key={seconds}
                                            type="button"
                                            variant={climbStartTimeSecRemaining === seconds ? 'default' : 'outline'}
                                            onClick={() => setClimbStartTimeSecRemaining((prev) => prev === seconds ? null : seconds)}
                                            className="h-11"
                                        >
                                            <span className="inline-flex items-center justify-center gap-1.5">
                                                <Kbd className="h-5 px-1.5 text-[10px]">{climbTimeShortcutKeys[index]?.toUpperCase()}</Kbd>
                                                <span>{climbWithLevels && seconds === 30 ? '30+' : `${seconds}s`}</span>
                                            </span>
                                        </Button>
                                    ))}
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="climb-start-time" className="text-sm text-muted-foreground">
                                        Exact seconds remaining (0-{climbTimeMax})
                                    </label>
                                    <Input
                                        ref={climbTimeInputRef}
                                        id="climb-start-time"
                                        type="number"
                                        min={0}
                                        max={climbTimeMax}
                                        value={climbStartTimeSecRemaining ?? ''}
                                        onChange={(e) => {
                                            const rawValue = e.target.value;
                                            if (rawValue === '') {
                                                setClimbStartTimeSecRemaining(null);
                                                return;
                                            }

                                            const parsed = Number.parseInt(rawValue, 10);
                                            if (Number.isNaN(parsed)) return;

                                            const clamped = Math.max(0, Math.min(climbTimeMax, parsed));
                                            setClimbStartTimeSecRemaining(clamped);
                                        }}
                                        placeholder="Type exact time"
                                    />
                                </div>

                            </div>
                        ) : requiresClimbLocation && !climbLocation ? (
                            // Teleop: Location selection first
                            <div className="grid grid-cols-2 gap-3 p-2">
                                <Button
                                    variant={pendingClimbLocation === 'side' ? 'default' : 'outline'}
                                    onClick={() => setPendingClimbLocation('side')}
                                    className="h-16 flex flex-col gap-1 items-center justify-center border-2 transition-all rounded-xl hover:bg-blue-500/20 hover:border-blue-400"
                                >
                                    <span className="inline-flex items-center gap-1.5 font-bold text-lg">
                                        <Kbd className="h-5 px-1.5 text-[10px]">A</Kbd>
                                        <span>Side</span>
                                    </span>
                                </Button>
                                <Button
                                    variant={pendingClimbLocation === 'middle' ? 'default' : 'outline'}
                                    onClick={() => setPendingClimbLocation('middle')}
                                    className="h-16 flex flex-col gap-1 items-center justify-center border-2 transition-all rounded-xl hover:bg-blue-500/20 hover:border-blue-400"
                                >
                                    <span className="inline-flex items-center gap-1.5 font-bold text-lg">
                                        <Kbd className="h-5 px-1.5 text-[10px]">F</Kbd>
                                        <span>Middle</span>
                                    </span>
                                </Button>
                            </div>
                        ) : climbWithLevels && !climbLevel ? (
                            // Teleop: Level selection first
                            <div className="grid grid-cols-3 gap-3 p-2">
                                {CLIMB_LEVELS.map((level) => (
                                    <Button
                                        key={level}
                                        variant={pendingClimbLevel === level ? 'default' : 'outline'}
                                        onClick={() => setPendingClimbLevel(level)}
                                        className="h-16 flex flex-col gap-1 items-center justify-center border-2 transition-all rounded-xl hover:bg-blue-500/20 hover:border-blue-400"
                                    >
                                        <span className="inline-flex items-center gap-1.5 font-bold text-lg">
                                            <Kbd className="h-5 px-1.5 text-[10px]">{level === 1 ? 'A' : level === 2 ? 'S' : 'D'}</Kbd>
                                            <span>L{level}</span>
                                        </span>
                                    </Button>
                                ))}
                            </div>
                        ) : !skipClimbOutcomeSelection && (
                            // Success/Fail selection (both phases)
                            <div className={cn(
                                "gap-4 p-2",
                                allowClimbFail ? "grid grid-cols-2" : "grid grid-cols-1"
                            )}>
                                <Button
                                    variant={climbResult === 'success' ? 'default' : 'outline'}
                                    onClick={() => onClimbResultSelect('success')}
                                    className={cn(
                                        "h-20 flex flex-col gap-1 items-center justify-center border-2 transition-all rounded-xl",
                                        climbResult === 'success' && "bg-blue-600 hover:bg-blue-700 border-blue-400 text-white shadow-lg"
                                    )}
                                >
                                    <Check className="h-6 w-6 font-bold" />
                                    <span className="inline-flex items-center gap-1.5 font-bold text-sm">
                                        <Kbd className="h-5 px-1.5 text-[10px]">A</Kbd>
                                        <span>SUCCESS</span>
                                    </span>
                                </Button>
                                {allowClimbFail && (
                                    <Button
                                        variant={climbResult === 'fail' ? 'default' : 'outline'}
                                        onClick={() => onClimbResultSelect('fail')}
                                        className={cn(
                                            "h-20 flex flex-col gap-1 items-center justify-center border-2 transition-all rounded-xl",
                                            climbResult === 'fail' && "bg-red-600 hover:bg-red-700 border-red-400 text-white shadow-lg"
                                        )}
                                    >
                                        <X className="h-6 w-6 font-bold" />
                                        <span className="inline-flex items-center gap-1.5 font-bold text-sm">
                                            <Kbd className="h-5 px-1.5 text-[10px]">F</Kbd>
                                            <span>FAIL</span>
                                        </span>
                                    </Button>
                                )}
                            </div>
                        )
                    ) : (
                        // Fuel selection
                        <div className="grid grid-cols-4 gap-2 px-1">
                            {fuelOptions.map((opt, index) => {
                                const alphaShortcut = fuelShortcutKeys[index]?.toUpperCase();
                                const shortcutLabel = alphaShortcut ?? null;
                                const valueLabel = opt.label.includes('/') || opt.label === 'Full' ? opt.label : `+${opt.label}`;
                                return (
                                <Button
                                    key={opt.label}
                                    variant="outline"
                                    size="lg"
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (!justOpenedRef.current) {
                                            onFuelSelect(opt.value, opt.label);
                                        }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="h-10 w-full text-xs md:text-sm rounded-lg font-bold transition-all"
                                >
                                    {shortcutLabel ? (
                                        <span className="inline-flex items-center justify-center gap-1.5">
                                            <Kbd className="h-5 px-1.5 text-[10px]">{shortcutLabel}</Kbd>
                                            <span>{valueLabel}</span>
                                        </span>
                                    ) : valueLabel}
                                </Button>
                                );
                            })}
                        </div>
                    )}
                </CardContent>

                {isClimb && (
                    <p className="px-3 text-[11px] text-muted-foreground text-center">
                        {isSelectingClimbTime
                            ? <>Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">{climbTimeShortcutLabel}</Kbd> preset, type time, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> next, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel</>
                            : (requiresClimbLocation && !climbLocation)
                                ? <>Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">A</Kbd> side, <Kbd className="h-4 px-1 text-[9px] align-middle">F</Kbd> middle, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> confirm, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel</>
                                : (climbWithLevels && !climbLevel)
                                    ? <>Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">A</Kbd> L1, <Kbd className="h-4 px-1 text-[9px] align-middle">S</Kbd> L2, <Kbd className="h-4 px-1 text-[9px] align-middle">D</Kbd> L3, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> confirm, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel</>
                                    : (!skipClimbOutcomeSelection
                                        ? (allowClimbFail
                                            ? <>Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">A</Kbd> success, <Kbd className="h-4 px-1 text-[9px] align-middle">F</Kbd> fail, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> confirm, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel</>
                                            : <>Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">A</Kbd> success, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> confirm, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel</>)
                                        : <>Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> confirm, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel</>)}
                    </p>
                )}

                {!isClimb && (
                    <p className="px-3 text-[11px] text-muted-foreground text-center">
                        Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">Q/W/E/R/T</Kbd> + <Kbd className="h-4 px-1 text-[9px] align-middle">A/S/D/F/G</Kbd> select amount, <Kbd className="h-4 px-1 text-[9px] align-middle">Z</Kbd> undo, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> confirm, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel
                    </p>
                )}

                {/* Footer */}
                <CardFooter className="flex flex-row items-center justify-between gap-3 border-t shrink-0 pt-2!">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12 rounded-full border-2"
                        onClick={onCancel}
                    >
                        <X className="h-6 w-6 text-muted-foreground" />
                    </Button>

                    <div className="flex flex-row gap-3">
                        {isClimb && !isSelectingClimbTime && !skipClimbOutcomeSelection && (
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-12 w-12 rounded-full border-2"
                                onClick={() => {
                                    if (climbWithLevels) {
                                        if (climbLevel) {
                                            onClimbLevelSelect?.(undefined);
                                            return;
                                        }
                                    }
                                    if (requiresClimbLocation && climbLocation) {
                                        onClimbLocationSelect?.(undefined);
                                        return;
                                    }
                                    setIsSelectingClimbTime(true);
                                }}
                            >
                                <ArrowLeft className="h-6 w-6" />
                            </Button>
                        )}

                        {!isClimb && (
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-12 w-12 rounded-full border-2"
                                onClick={(e) => { e.stopPropagation(); onFuelUndo(); }}
                                disabled={fuelHistory.length === 0}
                            >
                                <Undo2 className="h-6 w-6" />
                            </Button>
                        )}

                        <Button
                            size="icon"
                            onClick={() => {
                                if (isClimb && isSelectingClimbTime) {
                                    if (skipClimbOutcomeSelection) {
                                        onConfirm(climbStartTimeSecRemaining);
                                        return;
                                    }
                                    setIsSelectingClimbTime(false);
                                    return;
                                }

                                if (isClimb && !isSelectingClimbTime && requiresClimbLocation && !climbLocation) {
                                    if (!pendingClimbLocation) return;
                                    onClimbLocationSelect?.(pendingClimbLocation);
                                    return;
                                }

                                if (isClimb && !isSelectingClimbTime && climbWithLevels && !climbLevel) {
                                    if (!pendingClimbLevel) return;
                                    onClimbLevelSelect?.(pendingClimbLevel);
                                    return;
                                }

                                onConfirm(climbStartTimeSecRemaining);
                            }}
                            disabled={!canConfirm}
                            className="h-12 w-12 rounded-full border-2 bg-green-600 hover:bg-green-500"
                        >
                            <Check className="h-6 w-6" />
                        </Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
