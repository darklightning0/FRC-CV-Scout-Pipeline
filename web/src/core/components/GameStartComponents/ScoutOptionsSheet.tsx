import { Button } from "@/core/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/core/components/ui/sheet";
import { Separator } from "@/core/components/ui/separator";
import type { ScoutOptionsContentProps, ScoutOptionsState } from "@/types";
import { Settings2 } from "lucide-react";
import type { ComponentType } from "react";

export const CORE_SCOUT_OPTION_KEYS = {
  startAutoCueFromStartConfirmation: "startAutoCueFromStartConfirmation",
  startAutoCueFromAutoScreenEntry: "startAutoCueFromAutoScreenEntry",
  autoAdvanceToTeleopAfter20s: "autoAdvanceToTeleopAfter20s",
} as const;

const CORE_SCOUT_OPTION_NONE_KEY = "__coreOptionNone";

interface ScoutOptionsSheetProps {
  options: ScoutOptionsState;
  onOptionChange: (key: string, value: boolean) => void;
  customContent?: ComponentType<ScoutOptionsContentProps>;
  trigger?: React.ReactNode;
}

export function ScoutOptionsSheet({
  options,
  onOptionChange,
  customContent: CustomContent,
  trigger,
}: ScoutOptionsSheetProps) {
  const coreModeOptions = [
    {
      key: CORE_SCOUT_OPTION_NONE_KEY,
      title: "None",
      description: "No auto cue timing behavior is enabled.",
    },
    {
      key: CORE_SCOUT_OPTION_KEYS.startAutoCueFromStartConfirmation,
      title: "Start auto cue timer on start location confirmation",
      description: "Begins timing once start location is confirmed.",
    },
    {
      key: CORE_SCOUT_OPTION_KEYS.startAutoCueFromAutoScreenEntry,
      title: "Start auto cue timer on auto screen entry",
      description: "Begins timing as soon as the auto page opens.",
    },
    {
      key: CORE_SCOUT_OPTION_KEYS.autoAdvanceToTeleopAfter20s,
      title: "Auto-move to Teleop after 20s",
      description: "Starts from start confirmation and waits if popups, path drawing, or waypoint selection are active.",
    },
  ] as const;

  const selectedCoreMode = coreModeOptions.find((option) => options[option.key] === true)?.key
    ?? CORE_SCOUT_OPTION_NONE_KEY;

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Settings2 className="h-4 w-4 mr-2" />
            Scout Options
          </Button>
        )}
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Scout Options</SheetTitle>
          <SheetDescription>
            Configure scouting behavior before starting a match.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Core Options
            </h4>
            <p className="text-xs text-muted-foreground">Select one mode</p>

            {coreModeOptions.map((option) => (
              <label key={option.key} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="core-auto-timing-mode"
                  checked={selectedCoreMode === option.key}
                  onChange={() => {
                    if (option.key === CORE_SCOUT_OPTION_NONE_KEY) {
                      onOptionChange(CORE_SCOUT_OPTION_KEYS.startAutoCueFromStartConfirmation, false);
                      onOptionChange(CORE_SCOUT_OPTION_KEYS.startAutoCueFromAutoScreenEntry, false);
                      onOptionChange(CORE_SCOUT_OPTION_KEYS.autoAdvanceToTeleopAfter20s, false);
                      return;
                    }

                    onOptionChange(option.key, true);
                  }}
                  className="mt-1 h-4 w-4"
                />
                <div>
                  <p className="text-sm font-medium">{option.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {CustomContent && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Game-Specific Options
                </h4>
                <CustomContent options={options} onOptionChange={onOptionChange} />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
