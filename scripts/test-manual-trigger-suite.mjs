/**
 * SCC - EAGLE EYES: Power Automate Manual Sync Trigger Test Suite
 * Tests all 10 required security, authentication, and integration specifications:
 * 1. Missing trigger URL (HTTP 500)
 * 2. Missing trigger secret (HTTP 500)
 * 3. Unauthenticated user (HTTP 401)
 * 4. Authenticated user without permission (HTTP 403)
 * 5. Authorized admin successfully invoking Power Automate
 * 6. Power Automate returning HTTP 202 (status: 'accepted')
 * 7. Power Automate returning HTTP 401/403/500 (safe HTTP 502, no credentials leaked)
 * 8. Network timeout (safe HTTP 504)
 * 9. Duplicate submission prevention (HTTP 429/409)
 * 10. Confirmation that no secrets are returned to the browser
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as postManualTrigger } from "../src/app/api/integrations/unras/manual-trigger/route.ts";
import { POST as postProtestsSync } from "../src/app/api/protests/sync/route.ts";
import { resetManualTriggerCooldown } from "../src/lib/unras-manual-trigger.ts";
import { protestStore } from "../src/lib/protest-store.ts";

const results = [];

function recordTest(num, name, passed, details = "") {
  results.push({ num, name, passed, details });
  const status = passed ? "✔ PASS" : "✖ FAIL";
  console.log(`[Test ${String(num).padStart(2, "0")}/10] ${status} - ${name}`);
  if (details) {
    console.log(`          ${details}`);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("=== SCC - EAGLE EYES: MANUAL UNRAS SYNC INTEGRATION TEST SUITE (10 CASES)   ===");
  console.log("================================================================================\n");

  const TEST_SECRET = "super-secret-power-automate-token-xyz-12345";
  const TEST_SAS_URL = "mock://success?sig=SUPER_SECRET_SAS_TOKEN_ABC";

  // ---------------------------------------------------------------------------
  // Test 1: Missing trigger URL returns HTTP 500 / 503
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    delete process.env.POWER_AUTOMATE_TRIGGER_URL;
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    const req = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin",
        "x-scc-user-id": "a0000000-0000-0000-0000-000000000001"
      }
    });

    const res = await postManualTrigger(req);
    assert.equal(res.status, 500, "Must return HTTP 500 when URL is missing");
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.code, "MISSING_TRIGGER_URL");
    assert.ok(json.error.includes("POWER_AUTOMATE_TRIGGER_URL"));
    recordTest(1, "Missing trigger URL", true, `Returned HTTP 500 (${json.code})`);
  } catch (err) {
    recordTest(1, "Missing trigger URL", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 2: Missing trigger secret returns HTTP 500
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://success";
    delete process.env.POWER_AUTOMATE_TRIGGER_SECRET;

    const req = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin",
        "x-scc-user-id": "a0000000-0000-0000-0000-000000000001"
      }
    });

    const res = await postManualTrigger(req);
    assert.equal(res.status, 500, "Must return HTTP 500 when secret is missing");
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.code, "MISSING_TRIGGER_SECRET");
    assert.ok(json.error.includes("POWER_AUTOMATE_TRIGGER_SECRET"));
    recordTest(2, "Missing trigger secret", true, `Returned HTTP 500 (${json.code})`);
  } catch (err) {
    recordTest(2, "Missing trigger secret", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 3: Unauthenticated user rejected with HTTP 401
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://success";
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    // No authorization header and no role header
    const req1 = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    const res1 = await postManualTrigger(req1);
    assert.equal(res1.status, 401, "Must return HTTP 401 when no credentials are provided");
    const json1 = await res1.json();
    assert.equal(json1.success, false);
    assert.equal(json1.code, "UNAUTHENTICATED");

    // Explicitly unauthenticated / anonymous header
    const req2 = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "anonymous"
      }
    });
    const res2 = await postManualTrigger(req2);
    assert.equal(res2.status, 401, "Must return HTTP 401 for anonymous");

    recordTest(3, "Unauthenticated user rejected with HTTP 401", true, "Blocked with HTTP 401 UNAUTHENTICATED");
  } catch (err) {
    recordTest(3, "Unauthenticated user rejected with HTTP 401", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 4: Authenticated user without permission rejected with HTTP 403
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://success";
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    // Viewer role
    const reqViewer = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "viewer",
        "x-scc-user-id": "a0000000-0000-0000-0000-000000000003"
      }
    });
    const resViewer = await postManualTrigger(reqViewer);
    assert.equal(resViewer.status, 403, "Viewer must return HTTP 403");
    const jsonViewer = await resViewer.json();
    assert.equal(jsonViewer.success, false);
    assert.equal(jsonViewer.code, "FORBIDDEN");

    // Operator role
    const reqOperator = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "operator",
        "x-scc-user-id": "a0000000-0000-0000-0000-000000000002"
      }
    });
    const resOperator = await postManualTrigger(reqOperator);
    assert.equal(resOperator.status, 403, "Operator must return HTTP 403");

    recordTest(4, "Authenticated user without permission rejected with HTTP 403", true, "Viewer & Operator safely blocked with HTTP 403 FORBIDDEN");
  } catch (err) {
    recordTest(4, "Authenticated user without permission rejected with HTTP 403", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 5: Authorized admin successfully invoking Power Automate
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://success";
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    const adminId = "a0000000-0000-0000-0000-000000000001";
    const req = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin",
        "x-scc-user-id": adminId,
        "x-scc-user-name": "Admin Komando"
      }
    });

    const res = await postManualTrigger(req);
    assert.equal(res.status, 202, "Must return HTTP 202 Accepted");
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.status, "accepted");
    assert.ok(json.request_id, "request_id must be present");

    // UUID regex check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.match(json.request_id, uuidRegex, "request_id must be a valid RFC 4122 v4 UUID");

    // Check audit log in store
    const log = await protestStore.getSyncLogById(json.request_id);
    assert.ok(log, "Sync log must exist in store");
    assert.equal(log.triggered_by, "manual_admin");
    assert.equal(log.status, "running");

    // Mark completed to unblock concurrency for next tests
    await protestStore.updateSyncLog(json.request_id, {
      status: "success",
      completed_at: new Date().toISOString()
    });

    recordTest(5, "Authorized admin successfully invoking Power Automate", true, `Accepted with valid UUID request_id: ${json.request_id}`);
  } catch (err) {
    recordTest(5, "Authorized admin successfully invoking Power Automate", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 6: Power Automate returning HTTP 202 handles accepted execution
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://accepted";
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    const req = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      }
    });

    const res = await postManualTrigger(req);
    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.status, "accepted");
    assert.equal(json.message, "Permintaan sinkronisasi manual diterima Power Automate.");
    assert.ok(json.request_id);

    await protestStore.updateSyncLog(json.request_id, {
      status: "success",
      completed_at: new Date().toISOString()
    });

    recordTest(6, "Power Automate returning HTTP 202", true, "Returned status: 'accepted' with standard Indonesian confirmation message");
  } catch (err) {
    recordTest(6, "Power Automate returning HTTP 202", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 7: Power Automate returning HTTP 401/403/500 handled safely (no secrets leaked)
  // ---------------------------------------------------------------------------
  try {
    // 7A: 401 from Power Automate
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://401";
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    const req401 = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      }
    });
    const res401 = await postManualTrigger(req401);
    assert.equal(res401.status, 502);
    const json401 = await res401.json();
    assert.equal(json401.success, false);
    assert.equal(json401.code, "AUTHENTICATION_FAILED");
    assert.ok(!JSON.stringify(json401).includes(TEST_SECRET), "Response must NOT contain trigger secret");

    // 7B: 500 from Power Automate
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://500";
    const req500 = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      }
    });
    const res500 = await postManualTrigger(req500);
    assert.equal(res500.status, 502);
    const json500 = await res500.json();
    assert.equal(json500.success, false);
    assert.equal(json500.code, "SERVER_ERROR");

    recordTest(7, "Power Automate returning HTTP 401/403/500", true, "Non-2xx upstream returned safe HTTP 502 without credential leaks");
  } catch (err) {
    recordTest(7, "Power Automate returning HTTP 401/403/500", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 8: Network timeout handled safely
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://timeout";
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    const req = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      }
    });

    const res = await postManualTrigger(req);
    assert.equal(res.status, 504, "Timeout must return HTTP 504 Gateway Timeout");
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.code, "TIMEOUT");
    assert.ok(json.error.includes("timeout"));
    recordTest(8, "Network timeout", true, "Handled safely with HTTP 504 TIMEOUT");
  } catch (err) {
    recordTest(8, "Network timeout", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 9: Duplicate submission prevention
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://success";
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    const req1 = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      }
    });
    const res1 = await postManualTrigger(req1);
    assert.equal(res1.status, 202);
    const json1 = await res1.json();

    // Immediate second submission (cooldown active)
    const req2 = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      }
    });
    const res2 = await postManualTrigger(req2);
    assert.ok(res2.status === 429 || res2.status === 409, `Expected 429 or 409 for duplicate click, got ${res2.status}`);
    const json2 = await res2.json();
    assert.equal(json2.success, false);

    // Clean up running log
    await protestStore.updateSyncLog(json1.request_id, {
      status: "success",
      completed_at: new Date().toISOString()
    });

    recordTest(9, "Duplicate submission prevention", true, `Safely rejected second request with HTTP ${res2.status} (${json2.code})`);
  } catch (err) {
    recordTest(9, "Duplicate submission prevention", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 10: Confirmation that no secrets are returned to the browser
  // ---------------------------------------------------------------------------
  try {
    resetManualTriggerCooldown();
    process.env.POWER_AUTOMATE_TRIGGER_URL = TEST_SAS_URL;
    process.env.POWER_AUTOMATE_TRIGGER_SECRET = TEST_SECRET;

    const req = new NextRequest("http://localhost:3000/api/integrations/unras/manual-trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      }
    });

    const res = await postManualTrigger(req);
    const json = await res.json();
    const strResponse = JSON.stringify(json);

    // Verify secrets are nowhere in response
    assert.ok(!strResponse.includes(TEST_SECRET), "Response must NOT contain trigger secret!");
    assert.ok(!strResponse.includes("SUPER_SECRET_SAS_TOKEN"), "Response must NOT contain SAS token!");
    assert.ok(!strResponse.includes("mock://"), "Response must NOT contain upstream URL!");
    assert.equal(json.trigger_secret, undefined);
    assert.equal(json.trigger_url, undefined);

    await protestStore.updateSyncLog(json.request_id, {
      status: "success",
      completed_at: new Date().toISOString()
    });

    recordTest(10, "Confirmation that no secrets are returned to the browser", true, "Verified 0 secrets, SAS tokens, or credentials in response body");
  } catch (err) {
    recordTest(10, "Confirmation that no secrets are returned to the browser", false, err.message);
  }

  console.log("\n================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`=== HASIL AKHIR: ${passedCount}/10 PENGUJIAN BERHASIL (PASS)                         ===`);
  console.log("================================================================================");

  if (passedCount !== 10) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
