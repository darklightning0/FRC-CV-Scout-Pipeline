import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Label } from '@/core/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/core/components/ui/select';
import { Download, Upload } from 'lucide-react';
import type { TransferDataType } from '@/core/contexts/WebRTCContext';

interface DataTransferControlsProps {
    dataType: TransferDataType;
    onDataTypeChange: (value: TransferDataType) => void;
    onRequestData: () => void;
    onPushData: () => void;
    readyScoutsCount: number;
    disabled?: boolean;
}

export function DataTransferControls({
    dataType,
    onDataTypeChange,
    onRequestData,
    onPushData,
    readyScoutsCount,
    disabled = false
}: DataTransferControlsProps) {
    const getDataTypeLabel = (type: TransferDataType) => {
        switch (type) {
            case 'scouting': return 'Scouting';
            case 'pit-scouting': return 'Pit Scouting';
            case 'pit-assignments': return 'Pit Assignments';
            case 'match': return 'Match';
            case 'scout': return 'Scout Profile';
            case 'combined': return 'Combined';
            default: return type;
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>Data Transfer</CardTitle>
                <CardDescription>
                    Select data type, then request from or push to scouts
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="dataType">Data Type</Label>
                    <Select value={dataType} onValueChange={onDataTypeChange}>
                        <SelectTrigger id="dataType">
                            <SelectValue placeholder="Select data type..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="scouting">Scouting Data</SelectItem>
                            <SelectItem value="pit-scouting">Pit Scouting</SelectItem>
                            <SelectItem value="pit-assignments">Pit Assignments</SelectItem>
                            <SelectItem value="match">Match Schedule</SelectItem>
                            <SelectItem value="scout">Scout Profiles</SelectItem>
                            <SelectItem value="combined">Combined (Scouting + Profiles)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    onClick={onRequestData}
                    disabled={disabled || readyScoutsCount === 0}
                    className="h-auto w-full whitespace-normal py-3"
                    size="lg"
                >
                    <Download className="mr-2 h-5 w-5 shrink-0 self-start sm:self-center" />
                    <span className="text-left leading-tight">
                        Request {getDataTypeLabel(dataType)} Data ({readyScoutsCount} scouts)
                    </span>
                </Button>

                <Button
                    onClick={onPushData}
                    disabled={disabled || readyScoutsCount === 0}
                    className="h-auto w-full whitespace-normal py-3"
                    variant="outline"
                    size="lg"
                >
                    <Upload className="mr-2 h-5 w-5 shrink-0 self-start sm:self-center" />
                    <span className="text-left leading-tight">
                        Push {getDataTypeLabel(dataType)} Data to Scouts
                    </span>
                </Button>
            </CardContent>
        </Card>
    );
}
