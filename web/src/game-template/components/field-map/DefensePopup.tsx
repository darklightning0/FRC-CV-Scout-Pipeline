import { Button } from '@/core/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Input } from '@/core/components/ui/input';
import { Label } from '@/core/components/ui/label';
import { Kbd } from '@/core/components/ui/kbd';
import { cn } from '@/core/lib/utils';
import { ArrowRight, Check, X } from 'lucide-react';
import type { DefenseEffectiveness } from './types';

interface DefensePopupProps {
    isFieldRotated: boolean;
    isTargetOpen: boolean;
    isEffectivenessOpen: boolean;
    opponentTeamOptions: string[];
    selectedDefenseTeam: string;
    customDefenseTeamInput: string;
    selectedDefenseEffectiveness: DefenseEffectiveness | null;
    onSelectTeam: (team: string) => void;
    onCustomDefenseTeamInputChange: (value: string) => void;
    onSelectEffectiveness: (value: DefenseEffectiveness) => void;
    onCancel: () => void;
    onNext: () => void;
    onConfirm: () => void;
    canProceed: boolean;
    canConfirm: boolean;
}

export function DefensePopup({
    isFieldRotated,
    isTargetOpen,
    isEffectivenessOpen,
    opponentTeamOptions,
    selectedDefenseTeam,
    customDefenseTeamInput,
    selectedDefenseEffectiveness,
    onSelectTeam,
    onCustomDefenseTeamInputChange,
    onSelectEffectiveness,
    onCancel,
    onNext,
    onConfirm,
    canProceed,
    canConfirm,
}: DefensePopupProps) {
    if (!isTargetOpen && !isEffectivenessOpen) return null;

    return (
        <div className={cn('absolute inset-0 z-40 flex items-center justify-center p-2 pointer-events-none')}>
            <Card className={cn('w-full max-w-lg pointer-events-auto shadow-xl flex flex-col border-border/50 bg-background/98 backdrop-blur-sm gap-2', isFieldRotated && 'rotate-180')}>
                <CardHeader className="pb-1">
                    <div className="flex items-center justify-center gap-2">
                        <Badge variant="outline" className="text-orange-500 border-orange-500/50">DEFENSE</Badge>
                        <CardTitle className="text-lg font-bold tracking-tight">
                            {isTargetOpen ? 'Who are they defending?' : 'How effective was the defense?'}
                        </CardTitle>
                    </div>
                </CardHeader>

                <CardContent className="space-y-3 px-3">
                    {isTargetOpen ? (
                        <>
                            <p className="text-sm text-muted-foreground text-center">
                                Select an opponent team number, or enter one manually.
                            </p>

                            {opponentTeamOptions.length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {opponentTeamOptions.map((team, index) => {
                                        const shortcut = index === 0 ? 'A' : index === 1 ? 'S' : 'D';

                                        return (
                                            <Button
                                                key={team}
                                                type="button"
                                                variant={selectedDefenseTeam === team ? 'default' : 'outline'}
                                                onClick={() => onSelectTeam(team)}
                                            >
                                                <span className="inline-flex items-center justify-center gap-1.5">
                                                    <Kbd className="h-5 px-1.5 text-[10px]">{shortcut}</Kbd>
                                                    <span>{team}</span>
                                                </span>
                                            </Button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="space-y-1">
                                <Label htmlFor="defense-custom-team">Team Number (optional override)</Label>
                                <Input
                                    id="defense-custom-team"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="Enter team number"
                                    value={customDefenseTeamInput}
                                    onChange={(event) => {
                                        const numericOnly = event.target.value.replace(/\D/g, '');
                                        onCustomDefenseTeamInputChange(numericOnly);
                                    }}
                                />
                            </div>

                            <p className="text-[11px] text-muted-foreground text-center">
                                Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">A</Kbd>/<Kbd className="h-4 px-1 text-[9px] align-middle">S</Kbd>/<Kbd className="h-4 px-1 text-[9px] align-middle">D</Kbd> select, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> or <Kbd className="h-4 px-1 text-[9px] align-middle">Enter</Kbd> next, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground text-center">
                                Pick the level that best describes the impact.
                            </p>

                            <div className="grid grid-cols-3 gap-2">
                                <Button
                                    type="button"
                                    variant={selectedDefenseEffectiveness === 'very' ? 'default' : 'outline'}
                                    className="h-auto min-h-24 px-2 py-2"
                                    onClick={() => onSelectEffectiveness('very')}
                                >
                                    <span className="text-center">
                                        <span className="font-semibold inline-flex items-center justify-center gap-2">
                                            <Kbd className="h-5 px-1.5 text-[10px]">A</Kbd>
                                            <span>High Impact</span>
                                        </span>
                                        <span className="text-xs opacity-80 block mt-1">prevented significant scoring</span>
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    variant={selectedDefenseEffectiveness === 'somewhat' ? 'default' : 'outline'}
                                    className="h-auto min-h-24 px-2 py-2"
                                    onClick={() => onSelectEffectiveness('somewhat')}
                                >
                                    <span className="text-center">
                                        <span className="font-semibold inline-flex items-center justify-center gap-2">
                                            <Kbd className="h-5 px-1.5 text-[10px]">S</Kbd>
                                            <span>Some Impact</span>
                                        </span>
                                        <span className="text-xs opacity-80 block mt-1">prevented some scoring</span>
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    variant={selectedDefenseEffectiveness === 'not' ? 'default' : 'outline'}
                                    className="h-auto min-h-24 px-2 py-2"
                                    onClick={() => onSelectEffectiveness('not')}
                                >
                                    <span className="text-center">
                                        <span className="font-semibold inline-flex items-center justify-center gap-2">
                                            <Kbd className="h-5 px-1.5 text-[10px]">D</Kbd>
                                            <span>No Impact</span>
                                        </span>
                                        <span className="text-xs opacity-80 block mt-1">prevented little/no scoring</span>
                                    </span>
                                </Button>
                            </div>

                            <p className="text-[11px] text-muted-foreground text-center">
                                Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">A</Kbd>/<Kbd className="h-4 px-1 text-[9px] align-middle">S</Kbd>/<Kbd className="h-4 px-1 text-[9px] align-middle">D</Kbd> select, <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> or <Kbd className="h-4 px-1 text-[9px] align-middle">Enter</Kbd> save, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel
                            </p>
                        </>
                    )}
                </CardContent>

                <CardFooter className="flex flex-row items-center justify-between gap-3 border-t shrink-0 pt-2!">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12 rounded-full border-2"
                        onClick={onCancel}
                        aria-label="Cancel defense"
                    >
                        <X className="h-6 w-6 text-muted-foreground" />
                    </Button>

                    <div className="flex flex-row gap-3">
                        {isTargetOpen ? (
                            <Button
                                size="icon"
                                onClick={onNext}
                                disabled={!canProceed}
                                className="h-12 w-12 rounded-full border-2 bg-blue-600 hover:bg-blue-500"
                                aria-label="Next"
                            >
                                <ArrowRight className="h-6 w-6" />
                            </Button>
                        ) : (
                            <Button
                                size="icon"
                                onClick={onConfirm}
                                disabled={!canConfirm}
                                className="h-12 w-12 rounded-full border-2 bg-green-600 hover:bg-green-500"
                                aria-label="Save defense"
                            >
                                <Check className="h-6 w-6" />
                            </Button>
                        )}
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
