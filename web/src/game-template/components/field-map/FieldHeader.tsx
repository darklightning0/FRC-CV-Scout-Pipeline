/**
 * FieldHeader - Shared header component for Auto and Teleop field maps
 * 
 * Provides consistent header UI with:
 * - Back/proceed navigation
 * - Match info (number, type, team)
 * - Zone badge  
 * - Stat badges
 * - Action controls (undo, rotate, fullscreen)
 */

import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Kbd } from '@/core/components/ui/kbd';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/core/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/core/components/ui/dropdown-menu';
import { Maximize2, Minimize2, Undo2, ChevronLeft, ArrowRight, RotateCw, AlertTriangle, UserX, MoreVertical, List } from 'lucide-react';
import { cn } from '@/core/lib/utils';
import { shouldAllowProceed, DEFAULT_PROCEED_DEBOUNCE_MS } from '@/core/lib/proceedDebounce';
import type { ZoneType } from './types';
import { useState } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface FieldHeaderStat {
    label: string;
    value: number;
    color: 'green' | 'purple' | 'slate' | 'yellow';
}

export interface FieldHeaderProps {
    phase: 'auto' | 'teleop';

    // Optional custom context label (e.g., auto name in recording mode)
    headerLabel?: string;
    headerInputSlot?: React.ReactNode;

    // Stats to display (phase-specific)
    stats: FieldHeaderStat[];
    hideStats?: boolean;

    // Current zone for badge display
    currentZone?: ZoneType | null;

    // Fullscreen state
    isFullscreen: boolean;
    onFullscreenToggle: () => void;

    // Optional action log slot (phase-specific component)
    actionLogSlot?: React.ReactNode;
    customActionSlot?: React.ReactNode;
    
    // Optional action log trigger (for kebab menu)
    onActionLogOpen?: () => void;

    // From context (optional overrides)
    matchNumber?: string | number;
    matchType?: 'qm' | 'sf' | 'f';
    teamNumber?: string | number;
    alliance?: 'red' | 'blue';
    isFieldRotated?: boolean;
    canUndo?: boolean;
    onUndo?: () => void;
    onBack?: () => void;
    onProceed?: () => void;
    highlightProceed?: boolean;
    proceedCountdownSeconds?: number | null;
    toggleFieldOrientation?: () => void;
    
    // Broken down tracking
    isBrokenDown?: boolean;
    onBrokenDownToggle?: () => void;
    
    // No show handling (auto only)
    onNoShow?: () => void;

    // Optional UI behavior flags
    hideOverflowMenu?: boolean;
    prominentFullscreenControl?: boolean;
}

// =============================================================================
// HELPER
// =============================================================================

function formatMatchLabel(matchNumber: string | number, matchType?: 'qm' | 'sf' | 'f'): string {
    const num = matchNumber.toString();
    if (!matchType || matchType === 'qm') return `qm${num}`;
    if (matchType === 'sf') return `sf${num}m1`;
    if (matchType === 'f') return `f1m${num}`;
    return num;
}

function getZoneLabel(zone: ZoneType): string {
    switch (zone) {
        case 'allianceZone': return 'Alliance';
        case 'neutralZone': return 'Neutral';
        case 'opponentZone': return 'Opponent';
    }
}

function getZoneClassName(zone: ZoneType, alliance: 'red' | 'blue'): string {
    switch (zone) {
        case 'allianceZone':
            return alliance === 'red'
                ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300';
        case 'neutralZone':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300';
        case 'opponentZone':
            return alliance === 'red'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
    }
}

function getStatColorClass(color: FieldHeaderStat['color']): string {
    switch (color) {
        case 'green': return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-600/20 dark:text-green-400 dark:border-green-500/30';
        case 'purple': return 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-600/20 dark:text-purple-400 dark:border-purple-500/30';
        case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-600/20 dark:text-yellow-400 dark:border-yellow-500/30';
        case 'slate': return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50';
    }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FieldHeader({
    phase,
    headerLabel,
    headerInputSlot,
    stats,
    hideStats = false,
    currentZone,
    onActionLogOpen,
    isFullscreen,
    onFullscreenToggle,
    actionLogSlot,
    matchNumber,
    matchType,
    teamNumber,
    alliance = 'blue',
    isFieldRotated = false,
    canUndo = false,
    onUndo,
    onBack,
    onProceed,
    highlightProceed = false,
    proceedCountdownSeconds = null,
    toggleFieldOrientation,
    isBrokenDown = false,
    onBrokenDownToggle,
    onNoShow,
    hideOverflowMenu = false,
    prominentFullscreenControl = false,
    customActionSlot,
}: FieldHeaderProps) {
    const phaseLabel = phase === 'auto' ? 'Autonomous' : 'Teleop';
    const proceedLabel = phase === 'auto' ? 'Teleop' : 'Post Match';
    const proceedDisplayLabel =
        phase === 'auto' && proceedCountdownSeconds !== null
            ? `${proceedLabel} (${proceedCountdownSeconds}s)`
            : proceedLabel;
    
    const [showNoShowDialog, setShowNoShowDialog] = useState(false);

    const handleProceedClick = () => {
        if (!onProceed) return;
        if (!shouldAllowProceed(DEFAULT_PROCEED_DEBOUNCE_MS)) {
            return;
        }
        onProceed();
    };

    return (
        <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Back button + Phase Label (fullscreen only) */}
                {isFullscreen && !headerInputSlot && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        {onBack && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onBack}
                                className="h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                        )}
                        <span className="text-sm mr-2 font-bold text-slate-700 dark:text-slate-200">
                            {phaseLabel}
                        </span>
                    </div>
                )}

                {headerInputSlot && (
                    <div className="shrink-0">{headerInputSlot}</div>
                )}

                {/* Match Info */}
                {(matchNumber || teamNumber) && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-md border border-slate-300 dark:bg-slate-800/50 dark:border-slate-700/50 shrink-0">
                        {matchNumber && (
                            <span className="text-[10px] md:text-xs font-bold text-slate-700 dark:text-slate-400">
                                {formatMatchLabel(matchNumber, matchType)}
                            </span>
                        )}
                        {matchNumber && teamNumber && <div className="w-px h-3 bg-slate-300 dark:bg-slate-700" />}
                        {teamNumber && (
                            <span className="text-[10px] md:text-xs font-bold text-slate-700 dark:text-slate-400">
                                {teamNumber}
                            </span>
                        )}
                    </div>
                )}

                {/* Custom Header Label */}
                {headerLabel && (
                    <div className="max-w-48 md:max-w-72 truncate px-2 py-1 bg-slate-100 rounded-md border border-slate-300 text-[10px] md:text-xs font-semibold text-slate-700 dark:bg-slate-800/50 dark:border-slate-700/50 dark:text-slate-300 shrink-0">
                        {headerLabel}
                    </div>
                )}

                {/* Zone Badge */}
                {currentZone && (
                    <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] md:text-xs font-medium shrink-0",
                        getZoneClassName(currentZone, alliance)
                    )}>
                        {getZoneLabel(currentZone)}
                    </span>
                )}

                {/* Stat Badges */}
                {!hideStats && stats.length > 0 && (
                    <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                        {stats.map((stat, i) => (
                            <Badge
                                key={i}
                                variant="secondary"
                                className={cn(
                                    "text-[10px] md:text-xs px-1.5 py-0",
                                    getStatColorClass(stat.color)
                                )}
                            >
                                {stat.label}: {stat.value}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 pl-4">
                {customActionSlot}

                {/* Broken Down Button - Always visible */}
                {onBrokenDownToggle && (
                    <Button
                        variant={isBrokenDown ? "destructive" : "outline"}
                        size="sm"
                        onClick={onBrokenDownToggle}
                        className={cn(
                            "h-8 px-2 md:px-3 text-[10px] md:text-xs font-bold gap-1",
                            isBrokenDown && "animate-pulse"
                        )}
                        title={isBrokenDown ? "Robot is broken down - tap to resume (X)" : "Mark robot as broken down (X)"}
                    >
                        <AlertTriangle className="h-3 w-3 md:h-4 md:w-4" />
                        <span className="hidden sm:inline-flex items-center gap-1.5">
                            <span>Broken?</span>
                            <Kbd className="h-4 px-1 text-[9px]">X</Kbd>
                        </span>
                    </Button>
                )}

                {/* Undo - Always visible on mobile/tablet */}
                {onUndo && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={cn("h-8 w-8 hover:bg-slate-200 dark:hover:bg-slate-800 lg:hidden", canUndo && "text-red-500 dark:text-red-400 animate-in fade-in zoom-in duration-300")}
                    >
                        <Undo2 className="h-4 w-4" />
                    </Button>
                )}

                {/* Kebab Menu (mobile and tablet, until lg) */}
                {!hideOverflowMenu && <div className="lg:hidden">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-slate-200 dark:hover:bg-slate-800"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 z-150">
                            {/* Action Log */}
                            {onActionLogOpen && (
                                <>
                                    <DropdownMenuItem onClick={onActionLogOpen}>
                                        <List className="h-4 w-4 mr-2" />
                                        Action History
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </>
                            )}

                            {/* No Show (auto only) */}
                            {phase === 'auto' && onNoShow && (
                                <>
                                    <DropdownMenuItem
                                        onClick={() => setShowNoShowDialog(true)}
                                        className="text-orange-400"
                                    >
                                        <UserX className="h-4 w-4 mr-2" />
                                        No Show
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </>
                            )}
                            
                            {/* Rotate Field */}
                            {toggleFieldOrientation && (
                                <DropdownMenuItem
                                    onClick={toggleFieldOrientation}
                                    className={cn(isFieldRotated && "text-blue-400")}
                                >
                                    <RotateCw className={cn("h-4 w-4 mr-2 transition-transform", isFieldRotated && "rotate-180")} />
                                    {isFieldRotated ? "Reset Rotation" : "Rotate 180°"}
                                </DropdownMenuItem>
                            )}
                            
                            {/* Fullscreen Toggle */}
                            <DropdownMenuItem onClick={onFullscreenToggle}>
                                {isFullscreen ? (
                                    <>
                                        <Minimize2 className="h-4 w-4 mr-2" />
                                        Exit Fullscreen
                                    </>
                                ) : (
                                    <>
                                        <Maximize2 className="h-4 w-4 mr-2" />
                                        Enter Fullscreen
                                    </>
                                )}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>}

                {/* Prominent Fullscreen Control */}
                {prominentFullscreenControl && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onFullscreenToggle}
                        className="h-8 px-3 text-[11px] font-bold"
                    >
                        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    </Button>
                )}

                {/* Desktop Action Buttons (lg and up) */}
                <div className="hidden lg:flex lg:items-center lg:gap-1">
                    {/* No Show Button (auto only) */}
                    {phase === 'auto' && onNoShow && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowNoShowDialog(true)}
                            className="h-8 px-2 lg:px-3 text-[10px] lg:text-xs font-bold gap-1 text-orange-400 hover:text-orange-300 border-orange-500/30"
                            title="Robot did not show up for this match"
                        >
                            <UserX className="h-3 w-3 lg:h-4 lg:w-4" />
                            <span>No Show</span>
                        </Button>
                    )}

                    {/* Undo */}
                    {onUndo && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onUndo}
                            disabled={!canUndo}
                            className={cn("h-8 w-8 hover:bg-slate-200 dark:hover:bg-slate-800", canUndo && "text-red-500 dark:text-red-400 animate-in fade-in zoom-in duration-300")}
                        >
                            <Undo2 className="h-4 w-4" />
                        </Button>
                    )}

                    {/* Action Log Slot (phase-specific) */}
                    {actionLogSlot}

                    {/* Rotate Field */}
                    {toggleFieldOrientation && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleFieldOrientation}
                            className={cn("h-8 w-8 hover:bg-slate-200 dark:hover:bg-slate-800", isFieldRotated && "text-blue-500 dark:text-blue-400")}
                            title={isFieldRotated ? "Reset field orientation" : "Rotate field 180°"}
                        >
                            <RotateCw className={cn("h-4 w-4 transition-transform", isFieldRotated && "rotate-180")} />
                        </Button>
                    )}

                    {/* Fullscreen Toggle */}
                    {!prominentFullscreenControl && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onFullscreenToggle}
                            className="h-8 w-8 hover:bg-slate-200 dark:hover:bg-slate-800"
                        >
                            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                    )}
                </div>

                {/* Proceed (fullscreen only) - Always visible when applicable */}
                {isFullscreen && onProceed && (
                    <Button
                        onClick={handleProceedClick}
                        className={cn(
                            "h-8 px-3 ml-1 text-[11px] font-bold tracking-tight gap-1",
                            phase === 'teleop' && "bg-green-600 hover:bg-green-500",
                            highlightProceed && "bg-green-600 hover:bg-green-500 animate-pulse"
                        )}
                    >
                        <span className="hidden sm:inline">{proceedDisplayLabel}</span>
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* No Show Confirmation Dialog */}
            <Dialog open={showNoShowDialog} onOpenChange={setShowNoShowDialog}>
                <DialogContent className="z-210">
                    <DialogHeader>
                        <DialogTitle>Confirm No Show</DialogTitle>
                        <DialogDescription>
                            Are you sure team {teamNumber} did not show up for match {formatMatchLabel(matchNumber || '', matchType)}?
                            <br /><br />
                            This will immediately submit the match data with a no-show flag.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            className='p-4'
                            onClick={() => setShowNoShowDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className='p-4'
                            onClick={() => {
                                setShowNoShowDialog(false);
                                if (onNoShow) onNoShow();
                            }}
                        >
                            Confirm No Show
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
