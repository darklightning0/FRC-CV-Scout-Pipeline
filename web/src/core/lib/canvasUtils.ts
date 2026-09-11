/**
 * Canvas Utilities
 * 
 * Shared functions for drawing overlays and managing layered rendering.
 */

import { CANVAS_CONSTANTS } from "./canvasConstants";
import type { StrategyAutoRoutine } from "@/core/hooks/useMatchStrategy";

type StrategyStageId = 'autonomous' | 'teleop' | 'endgame';

interface TeamSpotPoint {
    x: number;
    y: number;
    pathPoints?: Array<{ x: number; y: number }>;
}

interface TeamStageSpots {
    shooting: TeamSpotPoint[];
    passing: TeamSpotPoint[];
}

interface TeamSlotSpotVisibility {
    showShooting: boolean;
    showPassing: boolean;
}

const SLOT_COLORS = {
    red: ['#ef4444', '#dc2626', '#b91c1c'],
    blue: ['#3b82f6', '#2563eb', '#1d4ed8'],
} as const;

/**
 * Draws team numbers on the canvas based on alliance positions.
 */
export const drawTeamNumbers = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    selectedTeams: (number | null)[]
) => {
    if (!selectedTeams || selectedTeams.length !== 6) return;

    const {
        TEAM_LABEL_FONT_SIZE_RATIO,
        BLUE_ALLIANCE_X_POSITION,
        RED_ALLIANCE_X_POSITION,
        TEAM_POSITION_TOP_Y,
        TEAM_POSITION_MIDDLE_Y,
        TEAM_POSITION_BOTTOM_Y
    } = CANVAS_CONSTANTS;

    const fontSize = Math.floor(width * TEAM_LABEL_FONT_SIZE_RATIO);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Blue alliance (left) - positions 3, 4, 5
    const blueX = width * BLUE_ALLIANCE_X_POSITION;
    const blueTeams = [
        { team: selectedTeams[3], y: height * TEAM_POSITION_TOP_Y },
        { team: selectedTeams[4], y: height * TEAM_POSITION_MIDDLE_Y },
        { team: selectedTeams[5], y: height * TEAM_POSITION_BOTTOM_Y },
    ];

    blueTeams.forEach(({ team, y }) => {
        if (team !== null && team !== undefined && team !== 0) {
            const teamStr = team.toString();
            ctx.save();
            ctx.translate(blueX, y);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.strokeText(teamStr, 0, 0);
            ctx.fillText(teamStr, 0, 0);
            ctx.restore();
        }
    });

    // Red alliance (right) - positions 0, 1, 2
    const redX = width * RED_ALLIANCE_X_POSITION;
    const redTeams = [
        { team: selectedTeams[0], y: height * TEAM_POSITION_BOTTOM_Y },
        { team: selectedTeams[1], y: height * TEAM_POSITION_MIDDLE_Y },
        { team: selectedTeams[2], y: height * TEAM_POSITION_TOP_Y },
    ];

    redTeams.forEach(({ team, y }) => {
        if (team !== null && team !== undefined && team !== 0) {
            const teamStr = team.toString();
            ctx.save();
            ctx.translate(redX, y);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.strokeText(teamStr, 0, 0);
            ctx.fillText(teamStr, 0, 0);
            ctx.restore();
        }
    });
};

const getSlotColor = (slotIndex: number) => {
    if (slotIndex >= 3) {
        const colorIndex = Math.min(slotIndex - 3, 2);
        return SLOT_COLORS.blue[colorIndex] ?? SLOT_COLORS.blue[0];
    }

    const colorIndex = Math.min(slotIndex, 2);
    return SLOT_COLORS.red[colorIndex] ?? SLOT_COLORS.red[0];
};

const transformSpotForSlot = (spot: TeamSpotPoint, slotIndex: number): TeamSpotPoint => {
    // Red alliance slots are indices 0-2 and should be mirrored across the field center line
    if (slotIndex <= 2) {
        return {
            x: 1 - spot.x,
            y: spot.y,
        };
    }

    return spot;
};

const getSlotShapeIndex = (slotIndex: number): number => {
    // Keep same shape per slot position across alliances:
    // slot 1 -> triangle, slot 2 -> circle, slot 3 -> square
    return slotIndex % 3;
};

const drawSlotShapePath = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    slotIndex: number,
) => {
    const shapeIndex = getSlotShapeIndex(slotIndex);

    ctx.beginPath();

    if (shapeIndex === 0) {
        // Triangle (pointing up)
        const angleOffset = -Math.PI / 2;
        for (let i = 0; i < 3; i++) {
            const angle = angleOffset + (i * (Math.PI * 2)) / 3;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        return;
    }

    if (shapeIndex === 1) {
        // Circle
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        return;
    }

    // Square
    const size = radius * 2;
    ctx.rect(x - radius, y - radius, size, size);
};

export const drawTeamNumbersAndSpots = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    selectedTeams: (number | null)[],
    stageId: StrategyStageId,
    teamSlotSpotVisibility: TeamSlotSpotVisibility[] = [],
    getTeamSpots?: (teamNumber: number | null, stageId: StrategyStageId) => TeamStageSpots,
) => {
    drawTeamNumbers(ctx, width, height, selectedTeams);

    if (!getTeamSpots) return;

    selectedTeams.forEach((teamNumber, slotIndex) => {
        if (!teamNumber) return;

        const visibility = teamSlotSpotVisibility[slotIndex] ?? {
            showShooting: true,
            showPassing: true,
        };

        if (!visibility.showShooting && !visibility.showPassing) return;

        const spots = getTeamSpots(teamNumber, stageId);
        const slotColor = getSlotColor(slotIndex);

        const drawSpotPath = (spot: TeamSpotPoint, dashed = false) => {
            if (!Array.isArray(spot.pathPoints) || spot.pathPoints.length < 2) return;

            const mappedPoints = spot.pathPoints.map((pathPoint) => transformSpotForSlot(pathPoint, slotIndex));
            if (mappedPoints.length < 2) return;

            ctx.save();
            if (dashed) {
                ctx.setLineDash([8, 6]);
            }

            ctx.beginPath();
            const start = mappedPoints[0];
            if (!start) {
                ctx.restore();
                return;
            }
            ctx.moveTo(start.x * width, start.y * height);

            for (let index = 1; index < mappedPoints.length; index++) {
                const point = mappedPoints[index];
                if (!point) continue;
                ctx.lineTo(point.x * width, point.y * height);
            }

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 4.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(start.x * width, start.y * height);
            for (let index = 1; index < mappedPoints.length; index++) {
                const point = mappedPoints[index];
                if (!point) continue;
                ctx.lineTo(point.x * width, point.y * height);
            }
            ctx.strokeStyle = slotColor;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.restore();
        };

        ctx.save();
        ctx.globalAlpha = 0.55;

        if (visibility.showShooting) {
            ctx.fillStyle = slotColor;
            spots.shooting.forEach((spot) => {
                drawSpotPath(spot, false);
                const mappedSpot = transformSpotForSlot(spot, slotIndex);
                const x = mappedSpot.x * width;
                const y = mappedSpot.y * height;
                drawSlotShapePath(ctx, x, y, 6, slotIndex);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fill();
            });
        }

        if (visibility.showPassing) {
            ctx.strokeStyle = slotColor;
            spots.passing.forEach((spot) => {
                drawSpotPath(spot, true);
                const mappedSpot = transformSpotForSlot(spot, slotIndex);
                const x = mappedSpot.x * width;
                const y = mappedSpot.y * height;
                drawSlotShapePath(ctx, x, y, 8, slotIndex);
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.stroke();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = slotColor;
                ctx.stroke();
            });
        }

        ctx.restore();
    });
};

export const drawSelectedAutoRoutines = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    selectedTeams: (number | null)[],
    stageId: StrategyStageId,
    selectedAutoRoutinesBySlot: (StrategyAutoRoutine | null)[] = [],
    isolatedAutoSlot: number | null = null,
    replayDrawProgress?: number,
) => {
    if (stageId !== 'autonomous') return;

    const getActionColor = (actionType?: string) => {
        switch (actionType) {
            case 'score':
                return '#22c55e';
            case 'pass':
                return '#9333ea';
            case 'collect':
                return '#eab308';
            default:
                return '#06b6d4';
        }
    };

    const getAllianceConnectorColor = (slotIndex: number) => (slotIndex >= 3 ? '#3b82f6' : '#ef4444');

    const getSlotStampConfig = (slotIndex: number) => {
        const shapeIndex = getSlotShapeIndex(slotIndex);

        if (shapeIndex === 0) {
            return { radius: 3.8, spacing: 16 };
        }

        if (shapeIndex === 1) {
            return { radius: 2.4, spacing: 11 };
        }

        return { radius: 2.9, spacing: 15 };
    };

    const drawShapeStamp = (
        x: number,
        y: number,
        slotIndex: number,
        color: string,
        angleRadians: number,
        radius: number,
    ) => {
        const shapeIndex = getSlotShapeIndex(slotIndex);

        ctx.save();
        ctx.translate(x, y);
        if (shapeIndex !== 0) {
            ctx.rotate(angleRadians + Math.PI / 2);
        }

        drawSlotShapePath(ctx, 0, 0, radius, slotIndex);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.stroke();
        ctx.restore();
    };

    const drawShapeStampedPolyline = (
        points: Array<{ x: number; y: number }>,
        color: string,
        slotIndex: number,
    ) => {
        if (points.length < 2) return;

        const { radius, spacing } = getSlotStampConfig(slotIndex);

        // Keep a subtle continuous guide so shape-stamped routes remain readable at a distance.
        ctx.beginPath();
        ctx.moveTo(points[0]!.x, points[0]!.y);
        for (let index = 1; index < points.length; index++) {
            const point = points[index];
            if (!point) continue;
            ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha *= 0.55;
        ctx.stroke();
        ctx.globalAlpha /= 0.55;

        let carryDistance = spacing * 0.5;

        for (let index = 1; index < points.length; index++) {
            const previous = points[index - 1];
            const current = points[index];
            if (!previous || !current) continue;

            const dx = current.x - previous.x;
            const dy = current.y - previous.y;
            const segmentLength = Math.hypot(dx, dy);
            if (segmentLength < 0.001) continue;

            const angle = Math.atan2(dy, dx);
            let distanceAlong = carryDistance;

            while (distanceAlong <= segmentLength) {
                const t = distanceAlong / segmentLength;
                const stampX = previous.x + dx * t;
                const stampY = previous.y + dy * t;
                drawShapeStamp(stampX, stampY, slotIndex, color, angle, radius);
                distanceAlong += spacing;
            }

            carryDistance = distanceAlong - segmentLength;
        }
    };

    const mapPointForSlot = (point: TeamSpotPoint, slotIndex: number) => {
        const mappedSpot = transformSpotForSlot(point, slotIndex);
        return {
            x: mappedSpot.x * width,
            y: mappedSpot.y * height,
        };
    };

    const buildRoutineSegments = (routine: StrategyAutoRoutine, slotIndex: number) => {
        const segments: Array<{
            points: Array<{ x: number; y: number }>;
            type?: string;
            kind: 'connector' | 'path' | 'fallback';
            length: number;
        }> = [];
        let previousPoint: { x: number; y: number } | null = null;

        const getPolylineLength = (points: Array<{ x: number; y: number }>) => {
            if (points.length < 2) return 0;

            let length = 0;
            for (let index = 1; index < points.length; index++) {
                const previous = points[index - 1];
                const current = points[index];
                if (!previous || !current) continue;
                length += Math.hypot(current.x - previous.x, current.y - previous.y);
            }

            return length;
        };

        routine.actions.forEach((waypoint) => {
            const currentPoint = mapPointForSlot(waypoint.position, slotIndex);

            const originalPath = Array.isArray(waypoint.pathPoints) && waypoint.pathPoints.length >= 2
                ? waypoint.pathPoints.map((point) => mapPointForSlot(point, slotIndex))
                : null;

            if (originalPath && originalPath.length >= 2) {
                if (previousPoint) {
                    const pathStart = originalPath[0];
                    if (pathStart) {
                        segments.push({
                            points: [previousPoint, pathStart],
                            type: waypoint.type,
                            kind: 'connector',
                            length: getPolylineLength([previousPoint, pathStart]),
                        });
                    }
                }

                segments.push({
                    points: originalPath,
                    type: waypoint.type,
                    kind: 'path',
                    length: getPolylineLength(originalPath),
                });
                previousPoint = originalPath[originalPath.length - 1] ?? currentPoint;
            } else if (previousPoint) {
                const fallbackPoints = [previousPoint, currentPoint];
                segments.push({
                    points: fallbackPoints,
                    type: waypoint.type,
                    kind: 'fallback',
                    length: getPolylineLength(fallbackPoints),
                });
                previousPoint = currentPoint;
            } else {
                previousPoint = currentPoint;
            }
        });

        return segments;
    };

    selectedAutoRoutinesBySlot.forEach((routine, slotIndex) => {
        const teamNumber = selectedTeams[slotIndex];
        if (!teamNumber || !routine) return;
        if (routine.teamNumber !== teamNumber) return;
        if (!Array.isArray(routine.actions) || routine.actions.length === 0) return;

        const isIsolatedOut = isolatedAutoSlot !== null && isolatedAutoSlot !== slotIndex;
        const alpha = isIsolatedOut ? 0.2 : 0.95;
        const connectorColor = getAllianceConnectorColor(slotIndex);

        const pathPoints = routine.actions.map((waypoint) => ({
            ...mapPointForSlot(waypoint.position, slotIndex),
            type: waypoint.type,
        }));
        const segments = buildRoutineSegments(routine, slotIndex);
        const clampedReplayProgress = typeof replayDrawProgress === 'number'
            ? Math.max(0, Math.min(1, replayDrawProgress))
            : null;

        const trimPolylineToLength = (
            points: Array<{ x: number; y: number }>,
            maxLength: number,
        ): Array<{ x: number; y: number }> => {
            if (points.length < 2) return points;
            if (maxLength <= 0) return [points[0]!];

            const trimmed: Array<{ x: number; y: number }> = [points[0]!];
            let remaining = maxLength;

            for (let index = 1; index < points.length; index++) {
                const previous = points[index - 1]!;
                const current = points[index]!;
                const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);

                if (segmentLength <= 0) continue;

                if (remaining >= segmentLength) {
                    trimmed.push(current);
                    remaining -= segmentLength;
                    continue;
                }

                const t = remaining / segmentLength;
                trimmed.push({
                    x: previous.x + (current.x - previous.x) * t,
                    y: previous.y + (current.y - previous.y) * t,
                });
                break;
            }

            return trimmed;
        };

        if (pathPoints.length === 0) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const totalSegmentLength = segments.reduce((sum, segment) => sum + segment.length, 0);
        let remainingLength = clampedReplayProgress === null
            ? Number.POSITIVE_INFINITY
            : totalSegmentLength * clampedReplayProgress;

        segments.forEach((segment) => {
            if (!segment.points.length) return;
            if (segment.length <= 0) return;
            if (remainingLength <= 0) return;
            const segmentColor = segment.kind === 'connector'
                ? connectorColor
                : (segment.kind === 'path' ? getActionColor(segment.type) : connectorColor);

            const visiblePoints = clampedReplayProgress === null
                ? segment.points
                : trimPolylineToLength(segment.points, Math.min(segment.length, remainingLength));

            drawShapeStampedPolyline(visiblePoints, segmentColor, slotIndex);

            if (clampedReplayProgress !== null) {
                remainingLength -= segment.length;
            }
        });

        pathPoints.forEach((point, pointIndex) => {
            const pointColor = getActionColor(point.type);

            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = pointColor;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 9px Arial';
            ctx.fillText(`${pointIndex + 1}`, point.x, point.y);
        });

        const startPoint = pathPoints[0];
        if (startPoint) {
            const label = `${teamNumber}`;
            ctx.font = 'bold 11px Arial';
            const metrics = ctx.measureText(label);
            const widthPadding = 12;
            const badgeWidth = metrics.width + widthPadding;
            const badgeHeight = 20;
            const badgeX = startPoint.x + 10;
            const badgeY = startPoint.y - 26;

            ctx.beginPath();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
            ctx.fill();

            ctx.strokeStyle = connectorColor;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, badgeX + (widthPadding / 2), badgeY + (badgeHeight / 2));
        }

        ctx.restore();
    });
};

const distanceToSegment = (
    pointX: number,
    pointY: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        const px = pointX - x1;
        const py = pointY - y1;
        return Math.hypot(px, py);
    }

    const t = Math.max(0, Math.min(1, ((pointX - x1) * dx + (pointY - y1) * dy) / (dx * dx + dy * dy)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(pointX - projX, pointY - projY);
};

const isPointInRect = (
    pointX: number,
    pointY: number,
    rectX: number,
    rectY: number,
    rectWidth: number,
    rectHeight: number,
) => {
    return (
        pointX >= rectX
        && pointX <= rectX + rectWidth
        && pointY >= rectY
        && pointY <= rectY + rectHeight
    );
};

export const getAutoRoutineSlotAtPoint = (
    pointX: number,
    pointY: number,
    width: number,
    height: number,
    selectedTeams: (number | null)[],
    stageId: StrategyStageId,
    selectedAutoRoutinesBySlot: (StrategyAutoRoutine | null)[] = [],
): number | null => {
    if (stageId !== 'autonomous') return null;

    const pathHitThreshold = 14;
    const pointHitThreshold = 16;

    const mapPointForSlot = (point: TeamSpotPoint, slotIndex: number) => {
        const mappedSpot = transformSpotForSlot(point, slotIndex);
        return {
            x: mappedSpot.x * width,
            y: mappedSpot.y * height,
        };
    };

    const buildRoutineSegments = (routine: StrategyAutoRoutine, slotIndex: number) => {
        const segments: Array<Array<{ x: number; y: number }>> = [];
        let previousPoint: { x: number; y: number } | null = null;

        routine.actions.forEach((waypoint) => {
            const currentPoint = mapPointForSlot(waypoint.position, slotIndex);
            const originalPath = Array.isArray(waypoint.pathPoints) && waypoint.pathPoints.length >= 2
                ? waypoint.pathPoints.map((point) => mapPointForSlot(point, slotIndex))
                : null;

            if (originalPath && originalPath.length >= 2) {
                if (previousPoint) {
                    const pathStart = originalPath[0];
                    if (pathStart) {
                        segments.push([previousPoint, pathStart]);
                    }
                }
                segments.push(originalPath);
                previousPoint = originalPath[originalPath.length - 1] ?? currentPoint;
            } else if (previousPoint) {
                segments.push([previousPoint, currentPoint]);
                previousPoint = currentPoint;
            } else {
                previousPoint = currentPoint;
            }
        });

        return segments;
    };

    for (let slotIndex = 0; slotIndex < selectedAutoRoutinesBySlot.length; slotIndex++) {
        const routine = selectedAutoRoutinesBySlot[slotIndex];
        const teamNumber = selectedTeams[slotIndex];
        if (!routine || !teamNumber) continue;
        if (routine.teamNumber !== teamNumber) continue;
        if (!Array.isArray(routine.actions) || routine.actions.length === 0) continue;

        const pathPoints = routine.actions.map((waypoint) => {
            const mappedSpot = transformSpotForSlot(waypoint.position, slotIndex);
            return {
                x: mappedSpot.x * width,
                y: mappedSpot.y * height,
            };
        });

        const startPoint = pathPoints[0];
        if (startPoint) {
            const label = `${teamNumber}`;
            const widthPadding = 12;
            const badgeHeight = 20;
            const badgeX = startPoint.x + 10;
            const badgeY = startPoint.y - 26;

            // Keep hit-test math aligned with drawSelectedAutoRoutines label placement.
            // Approximate width is sufficient for click target since we only render team numbers.
            const approxCharWidth = 7;
            const badgeWidth = (label.length * approxCharWidth) + widthPadding;

            if (isPointInRect(pointX, pointY, badgeX, badgeY, badgeWidth, badgeHeight)) {
                return slotIndex;
            }
        }

        for (let index = 0; index < pathPoints.length; index++) {
            const point = pathPoints[index];
            if (!point) continue;

            if (Math.hypot(pointX - point.x, pointY - point.y) <= pointHitThreshold) {
                return slotIndex;
            }
        }

        const segments = buildRoutineSegments(routine, slotIndex);
        for (const segment of segments) {
            for (let index = 1; index < segment.length; index++) {
                const previous = segment[index - 1];
                const current = segment[index];
                if (!previous || !current) continue;

                const distance = distanceToSegment(pointX, pointY, previous.x, previous.y, current.x, current.y);
                if (distance <= pathHitThreshold) {
                    return slotIndex;
                }
            }
        }
    }

    return null;
};

/**
 * Restores ONLY the background image for a specific area.
 * Used during active erasing to avoid clipped text artifacts.
 */
export const restoreBackgroundOnly = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    backgroundImage: HTMLImageElement,
    clipRect: { x: number; y: number; w: number; h: number }
) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
    ctx.clip();
    ctx.drawImage(backgroundImage, 0, 0, width, height);
    ctx.restore();
};

/**
 * Redraws all overlays on the full canvas.
 * Call this once after erasing is complete to restore team numbers.
 */
export const redrawOverlays = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    selectedTeams: (number | null)[]
) => {
    drawTeamNumbers(ctx, width, height, selectedTeams);
};

/**
 * Restores the background and standard overlays for a specific area.
 * This is used by the eraser to avoid "punching holes" in overlays.
 */
export const restoreBackgroundWithOverlays = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    backgroundImage: HTMLImageElement,
    selectedTeams: (number | null)[],
    clipRect?: { x: number; y: number; w: number; h: number }
) => {
    ctx.save();

    if (clipRect) {
        ctx.beginPath();
        ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
        ctx.clip();
    }

    // Draw background
    ctx.drawImage(backgroundImage, 0, 0, width, height);

    ctx.restore();

    // Draw overlays on full canvas (no clipping) to avoid artifacts
    drawTeamNumbers(ctx, width, height, selectedTeams);
};
