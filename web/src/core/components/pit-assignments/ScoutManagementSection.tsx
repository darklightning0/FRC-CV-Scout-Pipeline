import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { AlertCircle, Users, UserPlus, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from "@/core/components/ui/alert";
import { useScoutManagement } from '@/core/hooks/useScoutManagement';
import { useWebRTC } from '@/core/contexts/WebRTCContext';
import { toast } from "sonner";

export const ScoutManagementSection: React.FC = () => {
  const { scoutsList, saveScout, removeScout } = useScoutManagement();
  const { connectedScouts } = useWebRTC();
  const [newScoutName, setNewScoutName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const activeScouts = connectedScouts.filter((scout) => scout.status !== 'disconnected');
  const readyConnectedScouts = activeScouts.filter((scout) => {
    const channelState = scout.channel?.readyState || scout.dataChannel?.readyState;
    return channelState === 'open' || scout.status === 'connected';
  });

  const connectedScoutNames = useMemo(() => {
    return activeScouts
      .map((scout) => scout.name.trim())
      .filter((name) => name.length > 0);
  }, [activeScouts]);

  const combinedScouts = useMemo(() => {
    return Array.from(new Set([...scoutsList, ...connectedScoutNames])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [scoutsList, connectedScoutNames]);

  const handleAddScout = async () => {
    if (!newScoutName.trim()) {
      toast.error('Please enter a scout name');
      return;
    }

    if (scoutsList.includes(newScoutName.trim())) {
      toast.error('Scout already exists');
      return;
    }

    setIsAdding(true);
    try {
      await saveScout(newScoutName.trim());
      setNewScoutName('');
      toast.success(`Added scout: ${newScoutName.trim()}`);
    } catch (error) {
      console.error('Error adding scout:', error);
      toast.error('Failed to add scout');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveScout = async (scoutName: string) => {
    try {
      await removeScout(scoutName);
      toast.success(`Removed scout: ${scoutName}`);
    } catch (error) {
      console.error('Error removing scout:', error);
      toast.error('Failed to remove scout');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddScout();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Scout Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Add New Scout */}
          <div className="flex gap-2">
            <Input
              placeholder="Enter scout name or initials..."
              value={newScoutName}
              onChange={(e) => setNewScoutName(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button 
              onClick={handleAddScout}
              disabled={isAdding || !newScoutName.trim()}
              className="flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {/* Current Scouts List */}
          {combinedScouts.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No scouts added yet. Add scouts above to create pit assignments.
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  Since pit scouting happens before competition, you can add temporary names/initials here.
                </span>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                Available Scouts ({combinedScouts.length}):
              </div>
              <div className="flex flex-wrap gap-2">
                {combinedScouts.map((scout) => {
                  const isSavedScout = scoutsList.includes(scout);
                  const isConnectedScout = connectedScoutNames.includes(scout);

                  return (
                  <div
                    key={scout}
                    className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border"
                  >
                    <span className="text-sm font-medium">{scout}</span>
                    {isConnectedScout && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-green-600">
                        WiFi
                      </span>
                    )}
                    {isSavedScout && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveScout(scout)}
                        className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )})}
              </div>
            </div>
          )}

          {combinedScouts.length > 0 && (
            <div className="text-xs text-muted-foreground">
              💡 Tip: Teams will be divided into blocks among scouts. More scouts = smaller blocks per person.
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-2">
                {readyConnectedScouts.length > 0 ? (
                  <Wifi className="h-4 w-4 text-green-600" />
                ) : (
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                )}
                Connected Scouts (WiFi)
              </div>
              <span className="text-xs text-muted-foreground">
                {readyConnectedScouts.length} live
              </span>
            </div>

            {activeScouts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No scouts connected yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeScouts.map((scout) => {
                  const channelState = scout.channel?.readyState || scout.dataChannel?.readyState;
                  const isReady = channelState === 'open' || scout.status === 'connected';

                  return (
                  <div
                    key={scout.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${isReady ? 'bg-green-500/10' : 'bg-yellow-500/10'
                      }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-sm font-medium">{scout.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {isReady ? 'Connected' : 'Connecting'}
                    </span>
                  </div>
                )})}
              </div>
            )}

          </div>
        </div>
      </CardContent>
    </Card>
  );
};
