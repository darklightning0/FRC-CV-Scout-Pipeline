import { Button } from '@/core/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Kbd } from '@/core/components/ui/kbd';
import { cn } from '@/core/lib/utils';
import type { ShotType } from './types';
import { useEffect } from 'react';

interface ShotTypePopupProps {
    isFieldRotated: boolean;
    onSelect: (shotType: ShotType) => void;
    onCancel: () => void;
}

export function ShotTypePopup({ isFieldRotated, onSelect, onCancel }: ShotTypePopupProps) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();

            if (key === 'escape') {
                event.preventDefault();
                onCancel();
                return;
            }

            if (key === 'a') {
                event.preventDefault();
                onSelect('onTheMove');
                return;
            }

            if (key === 'f') {
                event.preventDefault();
                onSelect('stationary');
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onCancel, onSelect]);

    return (
        <div className={cn('absolute inset-0 z-40 flex items-center justify-center p-2 pointer-events-none')}>
            <Card className={cn('w-full max-w-sm pointer-events-auto shadow-xl', isFieldRotated && 'rotate-180')}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-center gap-2">
                        <Badge variant="outline" className="text-green-500 border-green-500/50">SHOT</Badge>
                        <CardTitle className="text-lg font-bold">Shot Type</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground text-center">
                        Was this shot on the move or stationary?
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            className="h-14 font-semibold"
                            onClick={() => onSelect('onTheMove')}
                        >
                            On the Move (A)
                        </Button>
                        <Button
                            variant="outline"
                            className="h-14 font-semibold"
                            onClick={() => onSelect('stationary')}
                        >
                            Stationary (F)
                        </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                        Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">A</Kbd> on the move, <Kbd className="h-4 px-1 text-[9px] align-middle">F</Kbd> stationary, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel
                    </p>
                    <Button variant="ghost" className="w-full" onClick={onCancel}>
                        Cancel
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
