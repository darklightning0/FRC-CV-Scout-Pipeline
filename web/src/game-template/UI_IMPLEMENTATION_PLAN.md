# 2026 UI Implementation Plan

Schema complete ✓ — Now implement the scoring UI with bulk counters.

## Files to Modify

### 1. ScoringSections.tsx (Priority: High)
Replace placeholder with 2026 bulk counter UI:
- **Fuel Scored**: +1, +5, +10 buttons with running total
- **Fuel Passed**: +1, +5, +10 buttons (optional toggle)
- **Undo button**: Removes last increment
- Display current count prominently

```typescript
// Action structure for bulk counters
{ actionType: 'fuelScored', increment: 5, phase: 'auto' }
```

### 2. StatusToggles Updates (Priority: Medium)
Auto toggles:
- `leftStartZone` - Mobility
- `autoClimbL1` - 15pt auto climb bonus

Teleop toggles:
- `playedDefense`
- `underTrench`, `overBump`

Endgame toggles (mutually exclusive):
- `climbL1` (10pt), `climbL2` (20pt), `climbL3` (30pt)
- `climbFailed`, `noClimb`

### 3. Field Selector (Optional)
Update start position zones if needed for 2026 field layout.

---

## UI Design Reference

```
┌─────────────────────────────────┐
│      FUEL SCORED: 15            │
│  [+1]  [+5]  [+10]   [UNDO]    │
├─────────────────────────────────┤
│      FUEL PASSED: 3             │
│  [+1]  [+5]  [+10]   [UNDO]    │
└─────────────────────────────────┘
```

---

## Testing Checklist
- [ ] Bulk counters increment correctly
- [ ] Undo removes last increment (not total)
- [ ] Data transforms to `fuelScoredCount` in database
- [ ] Points calculate correctly (1pt per fuel)
- [ ] Climb toggles are mutually exclusive
- [ ] Auto climb adds 15pt bonus
