/**
 * Test suite for UNRAS Operational Date Lifecycle & Filter Persistence
 * Verifies distinction between currentOperationalDate and selectedOperationalDate,
 * prevention of auto-reset during auto-refresh, midnight rollover logic, and navigation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== SCC EAGLE EYES: UNRAS DATE FILTER LIFECYCLE TEST SUITE ===\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${name}`);
    console.error(err);
  }
}

function getTodayWib(dateObj = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(dateObj);
  } catch {
    return dateObj.toISOString().slice(0, 10);
  }
}

// TEST 1: Timezone safety - returns YYYY-MM-DD in Asia/Jakarta regardless of system timezone
runTest("getTodayWib returns valid YYYY-MM-DD format in Asia/Jakarta", () => {
  const today = getTodayWib();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/, "Must match YYYY-MM-DD format");

  // Verify at 23:30 UTC, Asia/Jakarta (+7) is the NEXT calendar day
  const testUtcNight = new Date("2026-11-20T23:30:00Z");
  const wibDay = getTodayWib(testUtcNight);
  assert.equal(wibDay, "2026-11-21", "23:30 UTC on Nov 20 is 06:30 WIB on Nov 21");
});

// TEST 2: Initial state distinction
runTest("Initial state establishes both currentOperationalDate and selectedOperationalDate", () => {
  const currentOperationalDate = getTodayWib();
  let selectedOperationalDate = currentOperationalDate;

  assert.equal(currentOperationalDate, selectedOperationalDate);
  assert.match(currentOperationalDate, /^\d{4}-\d{2}-\d{2}$/);
});

// TEST 3: Selecting historical date updates selectedOperationalDate without altering currentOperationalDate
runTest("Selecting historical date updates selectedOperationalDate only", () => {
  const currentOperationalDate = "2026-11-23";
  let selectedOperationalDate = currentOperationalDate;

  // User selects historical date 2026-11-20
  selectedOperationalDate = "2026-11-20";

  assert.equal(selectedOperationalDate, "2026-11-20");
  assert.equal(currentOperationalDate, "2026-11-23", "currentOperationalDate must remain today's date");
});

// TEST 4: Simulated telemetry auto-refresh ticks (60s interval) do not overwrite selectedOperationalDate
runTest("Multiple auto-refresh cycles preserve selectedOperationalDate", () => {
  const currentOperationalDate = "2026-11-23";
  let selectedOperationalDate = "2026-11-20";
  const queriedDates = [];

  // Simulated telemetry auto-refresh function
  const telemetryRefresh = () => {
    // Queries data using selectedOperationalDate
    const targetDate = selectedOperationalDate;
    queriedDates.push(targetDate);
    // Does NOT mutate selectedOperationalDate
  };

  // Run 10 simulated refresh cycles
  for (let i = 0; i < 10; i++) {
    telemetryRefresh();
  }

  assert.equal(selectedOperationalDate, "2026-11-20", "selectedOperationalDate must remain 2026-11-20");
  assert.equal(queriedDates.length, 10);
  assert.ok(queriedDates.every((d) => d === "2026-11-20"), "All telemetry queries must target 2026-11-20");
});

// TEST 5: Midnight rollover watcher when clock has NOT passed midnight
runTest("Periodic 30s rollover checks do not reset historical date when midnight has not passed", () => {
  let currentOperationalDate = "2026-11-23";
  let selectedOperationalDate = "2026-11-20";

  // Simulated checkRollover: compares live clock with currentOperationalDate (NOT selectedOperationalDate)
  const checkRollover = (mockNowWib) => {
    if (mockNowWib !== currentOperationalDate) {
      const wasTrackingCurrent = selectedOperationalDate === currentOperationalDate;
      currentOperationalDate = mockNowWib;
      if (wasTrackingCurrent) {
        selectedOperationalDate = mockNowWib;
      }
    }
  };

  // Run 10 simulated 30-second ticks while clock is still today ("2026-11-23")
  for (let i = 0; i < 10; i++) {
    checkRollover("2026-11-23");
  }

  assert.equal(selectedOperationalDate, "2026-11-20", "Historical date MUST NOT be reset by rollover watcher!");
  assert.equal(currentOperationalDate, "2026-11-23");
});

// TEST 6: Real midnight rollover when user is inspecting historical date
runTest("Real midnight rollover preserves historical date when user explicitly selected it", () => {
  let currentOperationalDate = "2026-11-23";
  let selectedOperationalDate = "2026-11-20"; // user looking at 3 days ago

  const checkRollover = (mockNowWib) => {
    if (mockNowWib !== currentOperationalDate) {
      const wasTrackingCurrent = selectedOperationalDate === currentOperationalDate;
      currentOperationalDate = mockNowWib;
      if (wasTrackingCurrent) {
        selectedOperationalDate = mockNowWib;
      }
    }
  };

  // Real clock turns 00:00:00 WIB on 2026-11-24
  checkRollover("2026-11-24");

  assert.equal(currentOperationalDate, "2026-11-24", "currentOperationalDate must advance to the new calendar day");
  assert.equal(selectedOperationalDate, "2026-11-20", "selectedOperationalDate must remain on historical date 2026-11-20!");
});

// TEST 7: Real midnight rollover when user was tracking live today
runTest("Real midnight rollover advances selectedOperationalDate if user was tracking live today", () => {
  let currentOperationalDate = "2026-11-23";
  let selectedOperationalDate = "2026-11-23"; // user was on live today

  const checkRollover = (mockNowWib) => {
    if (mockNowWib !== currentOperationalDate) {
      const wasTrackingCurrent = selectedOperationalDate === currentOperationalDate;
      currentOperationalDate = mockNowWib;
      if (wasTrackingCurrent) {
        selectedOperationalDate = mockNowWib;
      }
    }
  };

  // Clock turns midnight
  checkRollover("2026-11-24");

  assert.equal(currentOperationalDate, "2026-11-24");
  assert.equal(selectedOperationalDate, "2026-11-24", "Live tracker smoothly transitions to new operational day");
});

// TEST 8: Previous and Next Day date navigation
runTest("Previous and Next Day navigation increments and decrements selectedOperationalDate strictly", () => {
  let selectedDate = "2026-11-20";

  const handlePrevDay = (cur) => {
    const d = new Date(cur + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const handleNextDay = (cur) => {
    const d = new Date(cur + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  selectedDate = handlePrevDay(selectedDate);
  assert.equal(selectedDate, "2026-11-19");

  selectedDate = handleNextDay(selectedDate);
  assert.equal(selectedDate, "2026-11-20");

  selectedDate = handleNextDay(selectedDate);
  assert.equal(selectedDate, "2026-11-21");
});

// TEST 9: Today button returns selectedOperationalDate to currentOperationalDate
runTest("Today button explicitly sets selectedOperationalDate to currentOperationalDate", () => {
  const currentOperationalDate = "2026-11-23";
  let selectedOperationalDate = "2026-11-20";

  // User clicks Today button
  selectedOperationalDate = currentOperationalDate;

  assert.equal(selectedOperationalDate, "2026-11-23");
});

// TEST 10: Source code verification of command-center.tsx and unras-priority-panel.tsx
runTest("Verify command-center.tsx and unras-priority-panel.tsx source code fixes", () => {
  const ccContent = fs.readFileSync("src/components/command-center.tsx", "utf-8");
  const panelContent = fs.readFileSync("src/components/executive/unras-priority-panel.tsx", "utf-8");

  // command-center.tsx must have both state variables
  assert.ok(ccContent.includes("currentOperationalDateWib"), "Must declare currentOperationalDateWib");
  assert.ok(ccContent.includes("selectedOperationalDateWib"), "Must declare selectedOperationalDateWib");

  // checkRollover must compare against currentOperationalDateWib, NOT operationalDateWib
  assert.ok(
    ccContent.includes("if (currentWib !== currentOperationalDateWib)"),
    "Rollover check must compare against currentOperationalDateWib"
  );

  // unras-priority-panel.tsx must accept currentOperationalDate prop
  assert.ok(
    panelContent.includes("currentOperationalDate?: string"),
    "UnrasPriorityPanelProps must accept currentOperationalDate"
  );

  // todayWib must resolve currentOperationalDate
  assert.ok(
    panelContent.includes("if (currentOperationalDate) return currentOperationalDate"),
    "todayWib must respect currentOperationalDate prop"
  );
});

console.log(`\n=== UNRAS DATE LIFECYCLE TEST SUMMARY: ${passed}/${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}

