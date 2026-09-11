import { Checkbox } from "@/core/components/ui/checkbox";
import type { ScoutOptionsContentProps } from "@/types";
import { GAME_SCOUT_OPTION_KEYS } from "@/game-template/scout-options";

export function GameSpecificScoutOptions({
  options,
  onOptionChange,
}: ScoutOptionsContentProps) {
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
        <Checkbox
          checked={options[GAME_SCOUT_OPTION_KEYS.disableHubFuelScoringPopup] ?? false}
          onCheckedChange={(checked) =>
            onOptionChange(GAME_SCOUT_OPTION_KEYS.disableHubFuelScoringPopup, checked === true)
          }
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-medium">Disable hub fuel scoring popup</p>
          <p className="text-xs text-muted-foreground">
            Makes hub scoring one-tap by auto-recording +0 fuel instead of opening the amount popup. This can be used by teams that will only be using OPR, cOPRs, and EPA.
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
        <Checkbox
          checked={options[GAME_SCOUT_OPTION_KEYS.disablePassingPopup] ?? false}
          onCheckedChange={(checked) =>
            onOptionChange(GAME_SCOUT_OPTION_KEYS.disablePassingPopup, checked === true)
          }
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-medium">Disable passing popup</p>
          <p className="text-xs text-muted-foreground">
            Makes pass actions one-tap by skipping amount selection.
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
        <Checkbox
          checked={options[GAME_SCOUT_OPTION_KEYS.disableDefensePopup] ?? false}
          onCheckedChange={(checked) =>
            onOptionChange(GAME_SCOUT_OPTION_KEYS.disableDefensePopup, checked === true)
          }
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-medium">Disable defense popup</p>
          <p className="text-xs text-muted-foreground">
            Makes defense one-tap by recording a defense action without target/effectiveness details.
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
        <Checkbox
          checked={options[GAME_SCOUT_OPTION_KEYS.disableAutoPathDrawingTapOnly] ?? false}
          onCheckedChange={(checked) =>
            onOptionChange(GAME_SCOUT_OPTION_KEYS.disableAutoPathDrawingTapOnly, checked === true)
          }
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-medium">Auto: Disable paths (tap-only spots)</p>
          <p className="text-xs text-muted-foreground">
            Keeps autonomous scoring/pass/collect as waypoint taps and removes draw-path input.
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
        <Checkbox
          checked={options[GAME_SCOUT_OPTION_KEYS.disableTeleopPathDrawingTapOnly] ?? false}
          onCheckedChange={(checked) =>
            onOptionChange(GAME_SCOUT_OPTION_KEYS.disableTeleopPathDrawingTapOnly, checked === true)
          }
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-medium">Teleop: Disable paths (tap-only spots)</p>
          <p className="text-xs text-muted-foreground">
            Keeps teleop scoring/pass actions as waypoint taps and removes draw-path input.
          </p>
        </div>
      </label>
    </div>
  );
}
