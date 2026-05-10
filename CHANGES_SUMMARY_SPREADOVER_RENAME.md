# Spreadover Rename & Shift Time Logic Clarification - Changes Summary

**Date**: May 6, 2026  
**Objective**: Rename "Spreadover" to "Max Shift Time Remaining" and clarify that POA, work, and breaks all count toward the 13h/15h shift limit equally.

---

## Files Modified

### 1. `src/lib/tacho/constants.ts`
**Changes**: Added new constants for shift time limits
```typescript
✅ Added: MAX_SHIFT_TIME_13H = 13 * 3600
✅ Added: MAX_SHIFT_TIME_15H = 15 * 3600
✅ Kept: SPREADOVER_13H (backward compatibility alias)
```

### 2. `src/lib/tacho/types.ts`
**Changes**: Renamed display state properties
```typescript
DisplayState type:
  ✅ OLD: spreadoverRemaining: number
  ✅ NEW: maxShiftTimeRemaining: number
  ✅ ALIAS: spreadoverRemaining (backward compat)

LiveDisplayInput type:
  ✅ OLD: spreadOverSeconds: number
  ✅ NEW: maxShiftTimeSeconds: number
  ✅ ALIAS: spreadOverSeconds (backward compat)

ShiftLifecycleState type:
  ✅ OLD: prevSpreadRemaining: number
  ✅ NEW: prevMaxShiftTimeRemaining: number
  ✅ ALIAS: prevSpreadRemaining (backward compat)
```

### 3. `src/lib/tacho/lifecycle.ts`
**Changes**: Updated state initialization to use new property names
```typescript
✅ Updated: createInitialDisplayState() 
   - maxShiftTimeRemaining: MAX_SHIFT_TIME_13H

✅ Updated: createStartedShiftState()
   - prevMaxShiftTimeRemaining: MAX_SHIFT_TIME_13H

✅ Updated: createEndedShiftResetState()
   - prevMaxShiftTimeRemaining: MAX_SHIFT_TIME_13H
```

### 4. `src/lib/tacho/display.ts`
**Changes**: Updated display calculation to use new property names
```typescript
✅ Parameter rename: spreadOverSeconds → maxShiftTimeSeconds
✅ Added backward compatibility handling
✅ Return object: maxShiftTimeRemaining (with spreadoverRemaining alias)
```

### 5. `src/lib/tacho/display.FIXED.ts`
**Changes**: Same as display.ts (parallel implementation)
```typescript
✅ Parameter rename: spreadOverSeconds → maxShiftTimeSeconds
✅ Updated return values with new property names
```

### 6. `src/screens/Dashboard.tsx`
**Changes**: Updated UI display and labels
```typescript
✅ Updated default object: maxShiftTimeRemaining instead of spreadoverRemaining
✅ Renamed calculation: maxShiftTimePct (was spreadPct)
✅ Updated UI label: "Max Shift Time Remaining" (was "Spreadover Remaining")
✅ Added clarification note: "Note: POA, work, and breaks all count toward this limit"
✅ Added display logic:
   - Shows countdown when < 3 hours remaining
   - Color: amber when < 1 hour, red when exceeded
   - Includes (13h limit) indicator
```

### 7. `src/hooks/useWorkTimer.ts`
**Changes**: Updated references throughout the hook
```typescript
✅ Import update: Added MAX_SHIFT_TIME_13H
✅ Reference update: prevRemainingRef.maxShiftTime (was .spread)
✅ Updated syncPrevRemainingFromDisplay() to use new property name
✅ Updated buildComplianceSchedule() to use MAX_SHIFT_TIME_13H constant
✅ Updated display derivation calls (3 locations):
   - maxShiftTimeSeconds parameter
✅ Updated alert logic to use maxShiftTime instead of spread
✅ Updated state reset logic on shift start
```

---

## Key Logic Verification

### Shift Span Calculation (Unchanged, but Clarified)
```typescript
// The shift span is simple: elapsed time from shift start
const shiftElapsed = Math.floor((nowMs - shiftStartMs) / 1000);
const maxShiftTimeRemaining = Math.max(0, MAX_SHIFT_TIME_13H - shiftElapsed);

// This INCLUDES all activities equally:
// - When status = 'break': time still counts
// - When status = 'poa': time still counts  
// - When status = 'working' (driving or other work): time counts
// - When status = 'idle': shift not active
```

### POA Does NOT Stop the Clock
The calculation is wall-clock elapsed time from shift start, not activity-based. Therefore:
- POA time counts toward the 13h limit ✅
- Breaks count toward the 13h limit ✅
- Work counts toward the 13h limit ✅
- Nothing pauses the clock ✅

---

## Backward Compatibility

All changes include backward compatibility:
- `SPREADOVER_13H` alias still works
- `spreadoverRemaining` property mirrored in display state
- `spreadOverSeconds` parameter handled in function signatures
- No breaking changes to public APIs

---

## UI/UX Improvements

1. **Clearer Label**: "Max Shift Time Remaining" vs ambiguous "Spreadover"
2. **Helpful Hint**: "Note: POA, work, and breaks all count toward this limit"
3. **13h Indicator**: Shows "(13h limit)" next to time display
4. **Intelligent Display**: Only shows when < 3 hours to avoid clutter
5. **Visual Hierarchy**: Amber → Red color progression as limit approaches

---

## Testing Recommendations

1. **Start Shift Test**
   - Verify countdown starts at 13:00:00
   - Verify it decrements every second

2. **POA Test**
   - Go on POA for 30 minutes
   - Verify countdown continues (doesn't pause)
   - Verify POA minutes are counted in totals AND deducted from max shift time

3. **Break Test**
   - Take a 45-minute break
   - Verify countdown continues
   - Verify break doesn't reset or pause the 13h limit

4. **Alert Test**
   - Verify alert fires when 30 minutes remain
   - Verify UI turns amber at 1 hour
   - Verify UI turns red when exceeded

5. **Mixed Activity Test**
   - Drive for 4 hours
   - Go on POA for 2 hours
   - Take a break for 30 minutes
   - Work for 4 hours
   - Total elapsed = 10:30, remaining should be 2:30

---

## Future Enhancements

When implementing 15-hour extended shifts:
1. Detect when daily rest reduced to 9h (vs standard 11h)
2. Switch max shift time to 15h for that day
3. Track "3x per week" enforcement
4. Update UI label to show "(15h limit)" on extended days

---

## Documentation
See `SHIFT_TIME_LOGIC_EXPLANATION.md` for detailed technical explanation of how the shift span limit works and why POA counts toward it.

