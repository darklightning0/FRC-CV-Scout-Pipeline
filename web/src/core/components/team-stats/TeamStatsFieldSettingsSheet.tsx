import { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/core/components/ui/button";
import { Checkbox } from "@/core/components/ui/checkbox";
import { Badge } from "@/core/components/ui/badge";
import { Separator } from "@/core/components/ui/separator";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/core/components/ui/sheet";

export interface TeamStatsFieldOption {
    key: string;
    label: string;
    category: string;
}

interface TeamStatsFieldSettingsSheetProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    fieldOptions: TeamStatsFieldOption[];
    hiddenFieldKeys: Set<string>;
    autoHiddenFieldKeys: Set<string>;
    autoHideUncollected: boolean;
    onAutoHideUncollectedChange: (value: boolean) => void;
    onToggleField: (key: string) => void;
    onShowAll: () => void;
    onHideAll: () => void;
}

export function TeamStatsFieldSettingsSheet({
    isOpen,
    onOpenChange,
    fieldOptions,
    hiddenFieldKeys,
    autoHiddenFieldKeys,
    autoHideUncollected,
    onAutoHideUncollectedChange,
    onToggleField,
    onShowAll,
    onHideAll,
}: TeamStatsFieldSettingsSheetProps) {
    const groupedFields = useMemo(() => {
        return fieldOptions.reduce<Record<string, TeamStatsFieldOption[]>>((acc, field) => {
            if (!acc[field.category]) {
                acc[field.category] = [];
            }
            acc[field.category]?.push(field);
            return acc;
        }, {});
    }, [fieldOptions]);

    const manuallyVisibleCount = fieldOptions.length - hiddenFieldKeys.size;

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Customize Stats
                </Button>
            </SheetTrigger>

            <SheetContent className="w-96">
                <SheetHeader>
                    <SheetTitle>Customize Team Stats</SheetTitle>
                    <SheetDescription>
                        Hide fields you do not want to show on Team Statistics.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 h-[calc(100vh-120px)] overflow-y-auto px-4 pb-4 space-y-6">
                    <div className="space-y-3">
                        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                            Display Options
                        </h4>

                        <div className="flex items-center justify-between rounded-md border p-3">
                            <div>
                                <p className="text-sm font-medium">Auto-hide uncollected stats</p>
                                <p className="text-xs text-muted-foreground">
                                    Hides enabled fields that are empty/zero for selected teams
                                </p>
                            </div>
                            <Checkbox
                                checked={autoHideUncollected}
                                onCheckedChange={(checked) => onAutoHideUncollectedChange(Boolean(checked))}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                                {manuallyVisibleCount} of {fieldOptions.length} enabled
                            </Badge>
                            {autoHideUncollected && autoHiddenFieldKeys.size > 0 && (
                                <Badge variant="outline" className="text-xs">
                                    {autoHiddenFieldKeys.size} auto-hidden
                                </Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" onClick={onShowAll}>Show All</Button>
                            <Button variant="outline" size="sm" onClick={onHideAll}>Hide All</Button>
                        </div>
                    </div>

                    <Separator />

                    {Object.entries(groupedFields).map(([category, fields]) => (
                        <div key={category} className="space-y-3">
                            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                                {category}
                            </h4>
                            <div className="space-y-2">
                                {fields.map((field) => (
                                    <div key={field.key} className="flex items-center justify-between gap-3">
                                        <label htmlFor={field.key} className="text-sm leading-none">
                                            {field.label}
                                        </label>
                                        <Checkbox
                                            id={field.key}
                                            checked={!hiddenFieldKeys.has(field.key)}
                                            onCheckedChange={() => onToggleField(field.key)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}
