# Shift Time Limit ("Max Shift Time Remaining") - Technical Explanation

## Overview
The app now displays **"Max Shift Time Remaining"** instead of the ambiguous "Spreadover" label. This countdown represents the **EU tachograph shift span limit** (13 hours standard, up to 15 hours with reduced rest up to 3x per week).

## Critical Concept: The Shift Span Clock Never Stops

### What Counts Toward the 13h/15h Limit
The shift span limit is based on **elapsed time from shift start**, counting all activities equally:
- ✅ **Driving** 
- ✅ **Working** (other work activities)
- ✅ **Period of Availability (POA)** - This is the key clarification
- ✅ **Breaks** (including rest in vehicle)

### What Does NOT Stop the Clock
Nothing stops the shift span clock:
- Breaks do not pause it (driver still needs 11h consecutive rest to end shift)
- POA does not pause it (waiting at a bay, marshalling, etc. all count)
- Rest periods in the vehicle do not pause it

## Why This Matters: POA Misconception

### The Common Driver Mistake
Many drivers believe: *"If I go on POA for 2 hours, I extend my 13-hour day by 2 hours"*

**This is WRONG.** The 13-hour clock is wall-clock time from shift start, not work-time.

Example:
- **06:00** - Shift starts (clock = 0h)
- **10:00** - 2 hours driving (clock = 4h)
- **10:30** - POA for 2 hours (clock still running: 4h 30m)
- **12:30** - Return to work (clock = 6h 30m)
- **19:00** - Shift must end (13h from start = deadline)

The driver has only **6h 30m left** to work, not **8h 30m**, because POA doesn't extend the 19:00 wall-clock deadline.

---

## Implementation Details

### Property Names (Updated)
```typescript
// Old naming (confusing)
spreadoverRemaining: number;
spreadOverSeconds: number;

// New naming (clear)
maxShiftTimeRemaining: number;
maxShiftTimeSeconds: number;
```

### Constants
```typescript
// EU Tachograph Rules
export const MAX_SHIFT_TIME_13H = 13 * 3600;    // Standard shift span
export const MAX_SHIFT_TIME_15H = 15 * 3600;    // With reduced rest (3x/week)
export const SPREADOVER_13H = MAX_SHIFT_TIME_13H; // Backward compatibility
```

### Display Logic
Location: `src/lib/tacho/display.ts`

```typescript
// Shift span calculation: elapsed time from shift start
const shiftElapsed = Math.floor((nowMs - shiftStartMs) / 1000);

// Remaining time to 13-hour limit
maxShiftTimeRemaining: Math.max(0, effectiveMaxShiftTimeSeconds - shiftElapsed)
```

**Key Point:** This calculation uses `shiftElapsed` (elapsed time from shift start), not work time. The shift start marker is set when the driver logs in at 06:00, and it keeps running regardless of POA, breaks, or other activities.

### UI Display
Location: `src/screens/Dashboard.tsx`

The countdown displays when remaining time < 3 hours:
```
Max Shift Time Remaining
💰 HH:MM:SS (13h limit)
⚠️ Note: POA, work, and breaks all count toward this limit
```

---

## How All Activities Are Treated Equally

The display state correctly counts all activities:

```typescript
// From deriveLiveDisplayState() in display.ts
if (status === 'break') {
  nextTotals.break += elapsedSec;        // ✅ Counts toward shift span
} else if (status === 'poa') {
  nextTotals.poa += elapsedSec;          // ✅ Counts toward shift span
} else if (status === 'working') {
  if (isDriving) {
    nextTotals.driving += elapsedSec;    // ✅ Counts toward shift span
  } else {
    nextTotals.work += elapsedSec;       // ✅ Counts toward shift span
  }
}

// Shift span remaining is independent of activity type:
maxShiftTimeRemaining = MAX_SHIFT_TIME_13H - (nowMs - shiftStartMs)
```

---

## Future Enhancement: 15-Hour Extended Days

When implementing the 15-hour extension feature:

1. **Detection**: Track when driver reduces daily rest to 9h (vs. standard 11h)
2. **Limit Application**: Switch from 13h to 15h limit for that day
3. **Weekly Limit**: Allow max 3x per week with extended 15h limit
4. **UI Update**: "Max Shift Time Remaining (15h limit)" on extended days

```typescript
// Future: Use MAX_SHIFT_TIME_15H when conditions met
const effectiveMaxShiftTime = shouldExtendToday ? MAX_SHIFT_TIME_15H : MAX_SHIFT_TIME_13H;
```

---

## Testing Checklist

- [ ] Verify countdown starts at 13:00:00 when shift starts
- [ ] Verify it decreases every second regardless of POA status
- [ ] Verify it continues during breaks (doesn't pause)
- [ ] Verify it counts POA time equally as work/driving time
- [ ] Verify UI only shows countdown when < 3 hours remaining
- [ ] Verify color changes to amber when < 1 hour
- [ ] Verify color changes to red when time expired
- [ ] Verify alert fires at 30 minute warning threshold

---

## References

**EU Regulation 561/2006 - Tachograph Rules**
- Article 7: Maximum daily driving time (4.5h)
- Article 8: Daily rest periods (11h or reduced to 9h, 3x/week max)
- Article 3: "Driving" definition (at wheel, engine on)
- POA (Period of Availability) is defined as time at driver's disposal, not active duty

**Key**: The 13-hour shift span is **wall-clock time**, not activity-based. The clock must never stop, and nothing the driver does (POA, breaks, vehicle checks) changes this fundamental rule.

