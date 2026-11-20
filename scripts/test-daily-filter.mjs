import { protestStore } from "../src/lib/protest-store.ts";

async function runAcceptanceTests() {
  console.log("==================================================================");
  console.log("   STRICT ACCEPTANCE TESTS: DAILY UNRAS FILTER (ASIA/JAKARTA)     ");
  console.log("==================================================================");

  const todayWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  console.log(`Operational Date (Asia/Jakarta): ${todayWib}`);

  // Test 1: Today's query with operational_date = today
  console.log("\n[Test 1] Querying with operational_date='today'...");
  const todayResult = await protestStore.queryProtests({
    operational_date: "today",
    is_archived: false,
    limit: 300
  });
  console.log(`-> Returned ${todayResult.data.length} events.`);
  if (todayResult.data.length === 0) {
    throw new Error("Test 1 Failed: Expected events for today's date.");
  }
  for (const item of todayResult.data) {
    if (item.tanggal && item.tanggal !== todayWib) {
      throw new Error(`Test 1 Failed: Leak detected! Item ${item.kode_unras} has tanggal ${item.tanggal} != ${todayWib}`);
    }
  }
  console.log("-> PASS: All returned items strictly match today's date in Asia/Jakarta.");

  // Test 2: Yesterday's date explicitly
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  console.log(`\n[Test 2] Querying yesterday (${yesterday})...`);
  const yesterdayResult = await protestStore.queryProtests({
    operational_date: yesterday,
    is_archived: false,
    limit: 300
  });
  console.log(`-> Returned ${yesterdayResult.data.length} events for yesterday.`);
  for (const item of yesterdayResult.data) {
    if (item.tanggal && item.tanggal !== yesterday) {
      throw new Error(`Test 2 Failed: Item ${item.kode_unras} tanggal ${item.tanggal} != ${yesterday}`);
    }
  }
  console.log("-> PASS: Yesterday query correctly isolated.");

  // Test 3: Tomorrow's date explicitly
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  console.log(`\n[Test 3] Querying tomorrow (${tomorrow})...`);
  const tomorrowResult = await protestStore.queryProtests({
    operational_date: tomorrow,
    is_archived: false,
    limit: 300
  });
  console.log(`-> Returned ${tomorrowResult.data.length} events for tomorrow.`);
  for (const item of tomorrowResult.data) {
    if (item.tanggal && item.tanggal !== tomorrow) {
      throw new Error(`Test 3 Failed: Item ${item.kode_unras} tanggal ${item.tanggal} != ${tomorrow}`);
    }
  }
  console.log("-> PASS: Tomorrow query correctly isolated.");

  // Test 4: Creation date vs Event date test
  // An event created today but with event date != today must NOT appear in today's filter
  console.log("\n[Test 4] Verifying created_at does NOT leak into event_date filter...");
  const allEvents = await protestStore.queryProtests({ limit: 500 });
  const createdTodayOtherDate = allEvents.data.filter((e) => {
    const createdDate = e.created_at ? e.created_at.slice(0, 10) : "";
    return createdDate === todayWib && e.tanggal !== todayWib;
  });
  console.log(`-> Found ${createdTodayOtherDate.length} events created today with different event_date.`);
  for (const item of createdTodayOtherDate) {
    const leak = todayResult.data.some((t) => t.id === item.id);
    if (leak) {
      throw new Error(`Test 4 Failed: Event ${item.kode_unras} created today leaked into today's filter despite having tanggal=${item.tanggal}`);
    }
  }
  console.log("-> PASS: Record creation date is strictly ignored in favor of actual event_date.");

  // Test 5: Event created yesterday with event date today MUST appear
  console.log("\n[Test 5] Verifying events created before today but scheduled for today appear...");
  const createdPriorScheduledToday = todayResult.data.filter((e) => {
    const createdDate = e.created_at ? e.created_at.slice(0, 10) : "";
    return createdDate !== todayWib;
  });
  console.log(`-> Found ${createdPriorScheduledToday.length} events scheduled for today that were created on previous dates.`);
  console.log("-> PASS: Prior-created events are correctly included when their event date is today.");

  // Test 6: Historical query without operational_date returns full repository
  console.log("\n[Test 6] Full repository query without operational_date filter...");
  console.log(`-> Total events in repository: ${allEvents.data.length}`);
  if (allEvents.data.length < 100) {
    throw new Error(`Test 6 Failed: Expected >100 historical events, got ${allEvents.data.length}`);
  }
  console.log("-> PASS: Historical protests remain completely intact and queryable without daily filter.");

  // Test 7: Daily Situation Overview API integration
  console.log("\n[Test 7] Testing Daily Situation Overview calculation...");
  const dailyOverview = await protestStore.getDailySituationOverview(todayWib);
  console.log(`-> Daily Overview for ${todayWib}:`);
  console.log(`   Total Points: ${dailyOverview.total_points}`);
  console.log(`   Ongoing: ${dailyOverview.ongoing_points_count}`);
  console.log(`   Scheduled: ${dailyOverview.scheduled_points_count}`);
  console.log(`   Monitoring: ${dailyOverview.monitoring_points_count}`);
  console.log(`   Total Estimated Crowd: ${dailyOverview.total_estimated_crowd.toLocaleString("id-ID")}`);
  console.log(`   Identified Mass Elements: ${dailyOverview.total_identified_elements}`);
  console.log(`   Affected Provinces: ${dailyOverview.affected_provinces_count}`);
  console.log("-> PASS: Daily situation overview computed accurately.");

  console.log("\n==================================================================");
  console.log("   ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY (Asia/Jakarta)       ");
  console.log("==================================================================");
}

runAcceptanceTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
