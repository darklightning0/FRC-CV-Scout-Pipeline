/**
 * AutoStartConfirmation Component
 * 
 * Confirmation popup for start position selection.
 * Extracted from AutoFieldMap for better organization.
 */

import { Button } from '@/core/components/ui/button';
import { Card, CardHeader, CardTitle, CardFooter } from '@/core/components/ui/card';
import { Kbd } from '@/core/components/ui/kbd';
import { cn } from '@/core/lib/utils';
import { FIELD_ELEMENTS } from '../../field-map';

const START_POSITION_LABELS: Record<string, string> = {
    trench1: 'Left Trench',
    bump1: 'Left Bump',
    hub: 'Center Hub',
    bump2: 'Right Bump',
    trench2: 'Right Trench',
};

// =============================================================================
// TYPES
// =============================================================================

export interface AutoStartConfirmationProps {
    selectedStartKey: string;
    alliance: 'red' | 'blue';
    isFieldRotated: boolean;
    startPositionX: number; // The X coordinate used for displaying start buttons
    onConfirm: (elementKey: string, position: { x: number; y: number }) => void;
    onCancel: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AutoStartConfirmation({
    selectedStartKey,
    alliance,
    isFieldRotated,
    startPositionX,
    onConfirm,
    onCancel,
}: AutoStartConfirmationProps) {
    const element = FIELD_ELEMENTS[selectedStartKey];
    const startPositionLabel = START_POSITION_LABELS[selectedStartKey] ?? element?.name ?? selectedStartKey;

    if (!element) return null;

    return (
        <div className={cn(
            "absolute inset-0 z-30 flex items-center pointer-events-none",
            alliance === 'red' ? "justify-start pl-[10%]" : "justify-end pr-[10%]",
            isFieldRotated && "rotate-180"
        )}>
            <Card className="w-72 pointer-events-auto shadow-2xl border-primary/20">
                <CardHeader className="text-center pb-2">
                    <CardTitle className="text-2xl font-bold">{startPositionLabel}</CardTitle>
                </CardHeader>
                <CardFooter className="flex flex-col gap-2 pt-2">
                    <Button
                        onClick={() => {
                            console.log('[AutoStart] Confirming start:', {
                                key: selectedStartKey,
                                elementX: element.x,
                                elementY: element.y,
                                overrideX: startPositionX,
                                finalPosition: { x: startPositionX, y: element.y }
                            });
                            onConfirm(selectedStartKey, { x: startPositionX, y: element.y });
                        }}
                        className="w-full h-12 text-base font-bold"
                    >
                        Confirm Start Location
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        className="w-full h-10 text-muted-foreground"
                    >
                        Cancel
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                        Keys: <Kbd className="h-4 px-1 text-[9px] align-middle">Space</Kbd> confirm, <Kbd className="h-4 px-1 text-[9px] align-middle">Esc</Kbd> cancel
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
