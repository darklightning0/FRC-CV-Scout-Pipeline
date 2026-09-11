/**
 * 2026 REBUILT Pit Scouting Questions
 * 
 * Game-specific questions focused on robot capabilities that cannot be determined
 * from watching matches:
 * - Physical specifications (height, trench capability)
 * - Capacity and intake methods
 * - Strategic preferences (starting positions, roles)
 * - Autonomous and endgame capabilities
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Label } from "@/core/components/ui/label";
import { Input } from "@/core/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { ScoutOptionsSheet } from "@/core/components/GameStartComponents/ScoutOptionsSheet";
import { AutoFieldMap } from "@/game-template/components/auto-path/AutoFieldMap";
import type { PathWaypoint } from "@/game-template/components/field-map";
import { GameSpecificScoutOptions } from "@/game-template/components/game-start/ScoutOptions";
import {
  SCOUT_OPTIONS_STORAGE_KEY,
  getEffectiveScoutOptions,
} from "@/game-template/scout-options";
import { Eraser, Save, Settings2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ScoutOptionsState } from "@/types";

interface GameSpecificQuestionsProps {
  gameData?: Record<string, unknown>;
  onGameDataChange: (data: Record<string, unknown>) => void;
}

const START_POSITIONS = ['Left Trench', 'Left Bump', 'Hub', 'Right Bump', 'Right Trench'];
const ROLES = ['Cycler', 'Clean Up', 'Passer', 'Thief', 'Defense'];

type PitAutoStartPosition = typeof START_POSITIONS[number];

interface PitReportedAuto {
  id: string;
  name: string;
  actions: PathWaypoint[];
  createdAt: number;
  updatedAt: number;
}

type PitReportedAutosByStart = Record<PitAutoStartPosition, PitReportedAuto[]>;

const PIT_START_TO_FIELD_KEY: Record<PitAutoStartPosition, 'trench1' | 'bump1' | 'hub' | 'bump2' | 'trench2'> = {
  'Left Trench': 'trench1',
  'Left Bump': 'bump1',
  'Hub': 'hub',
  'Right Bump': 'bump2',
  'Right Trench': 'trench2',
};

function createEmptyReportedAutos(): PitReportedAutosByStart {
  return {
    'Left Trench': [],
    'Left Bump': [],
    'Hub': [],
    'Right Bump': [],
    'Right Trench': [],
  };
}

function coerceReportedAutos(value: unknown): PitReportedAutosByStart {
  const empty = createEmptyReportedAutos();
  if (!value || typeof value !== 'object') return empty;

  const input = value as Record<string, unknown>;
  for (const start of START_POSITIONS) {
    const rawAutos = input[start];
    if (!Array.isArray(rawAutos)) continue;

    empty[start] = rawAutos
      .filter((auto): auto is Record<string, unknown> => !!auto && typeof auto === 'object')
      .map((auto, index) => ({
        id: typeof auto.id === 'string' ? auto.id : `${start}-${index}-${Date.now()}`,
        name: typeof auto.name === 'string' && auto.name.trim() ? auto.name.trim() : `${start} Auto ${index + 1}`,
        actions: Array.isArray(auto.actions) ? (auto.actions as PathWaypoint[]) : [],
        createdAt: typeof auto.createdAt === 'number' ? auto.createdAt : Date.now(),
        updatedAt: typeof auto.updatedAt === 'number' ? auto.updatedAt : Date.now(),
      }));
  }

  return empty;
}

export function GameSpecificQuestions({ gameData = {}, onGameDataChange }: GameSpecificQuestionsProps) {
  const [recordingStart, setRecordingStart] = useState<PitAutoStartPosition | null>(null);
  const [recordingActions, setRecordingActions] = useState<PathWaypoint[]>([]);
  const [recordingName, setRecordingName] = useState('');
  const [recordingScoutOptions, setRecordingScoutOptions] = useState<ScoutOptionsState>(() =>
    getEffectiveScoutOptions()
  );

  const handleChange = (key: string, value: unknown) => {
    onGameDataChange({ ...gameData, [key]: value });
  };

  const reportedAutosByStart = useMemo(
    () => coerceReportedAutos(gameData.reportedAutosByStart),
    [gameData.reportedAutosByStart]
  );

  const persistReportedAutos = (next: PitReportedAutosByStart) => {
    handleChange('reportedAutosByStart', next);
  };

  const openRecorder = (start: PitAutoStartPosition) => {
    const nextIndex = (reportedAutosByStart[start]?.length || 0) + 1;
    setRecordingStart(start);
    setRecordingActions([]);
    setRecordingName(`${start} Auto ${nextIndex}`);
  };

  const closeRecorder = () => {
    setRecordingStart(null);
    setRecordingActions([]);
    setRecordingName('');
  };

  const saveRecordedAuto = () => {
    if (!recordingStart || recordingActions.length === 0) return;

    const currentAutos = reportedAutosByStart[recordingStart] ?? [];

    const now = Date.now();
    const newAuto: PitReportedAuto = {
      id: `pit-auto-${recordingStart}-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: recordingName.trim() || `${recordingStart} Auto ${currentAutos.length + 1}`,
      actions: recordingActions,
      createdAt: now,
      updatedAt: now,
    };

    persistReportedAutos({
      ...reportedAutosByStart,
      [recordingStart]: [...currentAutos, newAuto],
    });

    closeRecorder();
  };

  const renameReportedAuto = (start: PitAutoStartPosition, autoId: string, name: string) => {
    const currentAutos = reportedAutosByStart[start] ?? [];
    const next = {
      ...reportedAutosByStart,
      [start]: currentAutos.map((auto) =>
        auto.id === autoId
          ? {
              ...auto,
              name,
              updatedAt: Date.now(),
            }
          : auto
      ),
    };
    persistReportedAutos(next);
  };

  const deleteReportedAuto = (start: PitAutoStartPosition, autoId: string) => {
    const currentAutos = reportedAutosByStart[start] ?? [];
    persistReportedAutos({
      ...reportedAutosByStart,
      [start]: currentAutos.filter((auto) => auto.id !== autoId),
    });
  };

  const handleMultiSelectChange = (key: string, value: string, checked: boolean) => {
    const current = (gameData[key] as string[]) || [];
    const updated = checked
      ? [...current, value]
      : current.filter(v => v !== value);
    handleChange(key, updated);
  };

  const getRank = (key: string, value: string) => {
    const selected = (gameData[key] as string[]) || [];
    const index = selected.indexOf(value);
    return index >= 0 ? index + 1 : null;
  };

  const targetClimbLevel = (gameData.targetClimbLevel as string) || 'none';
  const isTargetClimbLevelNone = targetClimbLevel === 'none';

  const handleTargetClimbLevelChange = (value: string) => {
    const nextGameData: Record<string, unknown> = {
      ...gameData,
      targetClimbLevel: value,
    };

    if (value === 'none') {
      nextGameData.targetClimbLocation = 'none';
    }

    onGameDataChange(nextGameData);
  };

  const handleRecordingScoutOptionChange = (key: string, value: boolean) => {
    setRecordingScoutOptions((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };
      localStorage.setItem(SCOUT_OPTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Physical Specifications */}
      <Card>
        <CardHeader>
          <CardTitle>Physical Specifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxLength">Robot Max Length (inches, with any extension)</Label>
            <Input
              id="maxLength"
              type="number"
              placeholder="e.g., 30"
              value={(gameData.maxLength as number) || ''}
              onChange={(e) => handleChange('maxLength', parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxWidth">Robot Max Width (inches, with any extension)</Label>
            <Input
              id="maxWidth"
              type="number"
              placeholder="e.g., 28"
              value={(gameData.maxWidth as number) || ''}
              onChange={(e) => handleChange('maxWidth', parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxHeight">Robot Max Height (inches)</Label>
            <Input
              id="maxHeight"
              type="number"
              placeholder="e.g., 22"
              value={(gameData.maxHeight as number) || ''}
              onChange={(e) => handleChange('maxHeight', parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={gameData.canGoUnderTrench ? "default" : "outline"}
              onClick={() => handleChange('canGoUnderTrench', !gameData.canGoUnderTrench)}
              className="flex-1"
            >
              Can go under trench (22.25" clearance)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Fuel Handling */}
      <Card>
        <CardHeader>
          <CardTitle>Fuel Handling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fuelCapacity">Fuel Capacity (max pieces held)</Label>
            <Input
              id="fuelCapacity"
              type="number"
              placeholder="e.g., 8"
              value={(gameData.fuelCapacity as number) || ''}
              onChange={(e) => handleChange('fuelCapacity', parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={gameData.canOutpostPickup ? "default" : "outline"}
              onClick={() => handleChange('canOutpostPickup', !gameData.canOutpostPickup)}
              className="flex-1"
            >
              Can pickup from outpost chute
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={gameData.canPassToCorral ? "default" : "outline"}
              onClick={() => handleChange('canPassToCorral', !gameData.canPassToCorral)}
              className="flex-1"
            >
              Can pass fuel to corral
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Strategic Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Strategic Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Click options in priority order. Click a selected option again to unrank it.</p>
          <div className="space-y-2">
            <Label>Preferred Starting Positions (ranked by click order)</Label>
            <div className="grid grid-cols-2 gap-2">
              {START_POSITIONS.map((position) => (
                (() => {
                  const rank = getRank('preferredStartPositions', position);
                  const isSelected = rank !== null;
                  return (
                <Button
                  key={position}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => 
                    handleMultiSelectChange('preferredStartPositions', position, 
                      !isSelected)
                  }
                  className="h-auto py-3"
                >
                  {isSelected ? `${rank}. ${position}` : position}
                </Button>
                  );
                })()
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preferred Role - Active Shift (ranked by click order)</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((role) => (
                (() => {
                  const rank = getRank('preferredActiveRoles', role);
                  const isSelected = rank !== null;
                  return (
                <Button
                  key={`active-${role}`}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => 
                    handleMultiSelectChange('preferredActiveRoles', role, 
                      !isSelected)
                  }
                  className="h-auto py-3"
                >
                  {isSelected ? `${rank}. ${role}` : role}
                </Button>
                  );
                })()
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preferred Role - Inactive Shift (ranked by click order)</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((role) => (
                (() => {
                  const rank = getRank('preferredInactiveRoles', role);
                  const isSelected = rank !== null;
                  return (
                <Button
                  key={`inactive-${role}`}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => 
                    handleMultiSelectChange('preferredInactiveRoles', role, 
                      !isSelected)
                  }
                  className="h-auto py-3"
                >
                  {isSelected ? `${rank}. ${role}` : role}
                </Button>
                  );
                })()
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Autonomous & Endgame */}
      <Card>
        <CardHeader>
          <CardTitle>Autonomous & Endgame</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={gameData.canAutoClimbL1 ? "default" : "outline"}
              onClick={() => handleChange('canAutoClimbL1', !gameData.canAutoClimbL1)}
              className="flex-1"
            >
              Can climb Level 1 in auto
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetClimbLevel">Target Endgame Climb Level</Label>
            <Select
              value={targetClimbLevel}
              onValueChange={handleTargetClimbLevelChange}
            >
              <SelectTrigger id="targetClimbLevel">
                <SelectValue placeholder="Select climb level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="level1">Level 1 (10 pts)</SelectItem>
                <SelectItem value="level2">Level 2 (20 pts)</SelectItem>
                <SelectItem value="level3">Level 3 (30 pts)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetClimbLocation"> Climb Location?</Label>
            <Select
              value={(gameData.targetClimbLocation as string) || 'none'}
              onValueChange={(value) => handleChange('targetClimbLocation', value)}
              disabled={isTargetClimbLevelNone}
            >
              <SelectTrigger id="targetClimbLocation" disabled={isTargetClimbLevelNone}>
                <SelectValue placeholder="Select climb location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unknown / No preference</SelectItem>
                <SelectItem value="side">Side</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reported Autos by Start Position */}
      <Card>
        <CardHeader>
          <CardTitle>Reported Autos by Starting Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {START_POSITIONS.map((start) => {
            const autos = reportedAutosByStart[start] || [];
            return (
              <div key={start} className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{start}</p>
                    <p className="text-xs text-muted-foreground">{autos.length} saved auto{autos.length === 1 ? '' : 's'}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => openRecorder(start)}>
                    Add Auto
                  </Button>
                </div>

                {autos.length > 0 ? (
                  <div className="space-y-2">
                    {autos.map((auto) => (
                      <div key={auto.id} className="flex items-center gap-2 rounded-md border p-2">
                        <Input
                          value={auto.name}
                          onChange={(e) => renameReportedAuto(start, auto.id, e.target.value)}
                          placeholder="Auto name"
                        />
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {auto.actions.length} actions
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteReportedAuto(start, auto.id)}
                          aria-label={`Delete ${auto.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No autos recorded yet for this location.</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={recordingStart !== null} onOpenChange={(open) => { if (!open) closeRecorder(); }}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none border-0 p-4 sm:p-6 flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Record Reported Auto</DialogTitle>
            <DialogDescription>
              Use the field map to capture one reported auto path for {recordingStart}. Then save it with a name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="w-full">
              <AutoFieldMap
                actions={recordingActions}
                onAddAction={(action) => setRecordingActions((prev) => [...prev, action])}
                onUndo={() => setRecordingActions((prev) => prev.slice(0, -1))}
                canUndo={recordingActions.length > 0}
                teamNumber="pit"
                matchNumber="pit"
                enableNoShow={false}
                recordingMode={true}
                preferredStartKey={recordingStart ? PIT_START_TO_FIELD_KEY[recordingStart] : undefined}
                headerInputSlot={
                  <div className="flex items-center gap-2">
                    <Input
                      id="pit-reported-auto-name"
                      value={recordingName}
                      onChange={(e) => setRecordingName(e.target.value)}
                      placeholder={recordingStart ? `${recordingStart} Auto` : 'Reported Auto'}
                      className="h-8 w-48 sm:w-72"
                      aria-label="Auto name"
                    />
                    <ScoutOptionsSheet
                      options={recordingScoutOptions}
                      onOptionChange={handleRecordingScoutOptionChange}
                      customContent={GameSpecificScoutOptions}
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Scout settings"
                          title="Scout settings"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                }
                recordingActionSlot={
                  <div className="flex items-center gap-1">
                    <Button
                      className="h-8 w-8 md:w-auto md:px-2"
                      type="button"
                      variant="outline"
                      onClick={closeRecorder}
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                      <span className="hidden md:inline md:ml-1">Cancel</span>
                    </Button>
                    <Button
                      className="h-8 w-8 md:w-auto md:px-2"
                      type="button"
                      variant="secondary"
                      onClick={() => setRecordingActions([])}
                      disabled={recordingActions.length === 0}
                      aria-label="Clear Path"
                    >
                      <Eraser className="h-4 w-4" />
                      <span className="hidden md:inline md:ml-1">Clear Path</span>
                    </Button>
                    <Button
                      className="h-8 w-8 md:w-auto md:px-2"
                      type="button"
                      onClick={saveRecordedAuto}
                      disabled={recordingActions.length === 0}
                      aria-label="Save Reported Auto"
                    >
                      <Save className="h-4 w-4" />
                      <span className="hidden md:inline md:ml-1">Save</span>
                    </Button>
                  </div>
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/*
EXAMPLE IMPLEMENTATION FOR A REAL GAME YEAR:

import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Checkbox } from "@/core/components/ui/checkbox";
import { Label } from "@/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";

interface GameSpecificQuestionsProps {
  gameData?: Record<string, unknown>;
  onGameDataChange: (data: Record<string, unknown>) => void;
}

export function GameSpecificQuestions({ gameData = {}, onGameDataChange }: GameSpecificQuestionsProps) {
  const handleChange = (key: string, value: unknown) => {
    onGameDataChange({ ...gameData, [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>2025 Reefscape Capabilities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Scoring Capabilities</h4>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canScoreCoral"
              checked={gameData.canScoreCoral as boolean}
              onCheckedChange={(checked) => handleChange('canScoreCoral', checked)}
            />
            <Label htmlFor="canScoreCoral">Can score coral pieces</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canScoreAlgae"
              checked={gameData.canScoreAlgae as boolean}
              onCheckedChange={(checked) => handleChange('canScoreAlgae', checked)}
            />
            <Label htmlFor="canScoreAlgae">Can score algae pieces</Label>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-medium text-sm">Endgame</h4>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canClimb"
              checked={gameData.canClimb as boolean}
              onCheckedChange={(checked) => handleChange('canClimb', checked)}
            />
            <Label htmlFor="canClimb">Can climb at endgame</Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredScoring">Preferred Scoring Location</Label>
          <Select
            value={gameData.preferredScoring as string}
            onValueChange={(value) => handleChange('preferredScoring', value)}
          >
            <SelectTrigger id="preferredScoring">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reef_low">Reef (Low)</SelectItem>
              <SelectItem value="reef_high">Reef (High)</SelectItem>
              <SelectItem value="processor">Processor</SelectItem>
              <SelectItem value="barge">Barge</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
*/
