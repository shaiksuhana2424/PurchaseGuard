
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 18271;
const base = `http://127.0.0.1:${port}`;

async function startServer(t, rateLimit = "40") {
  const child = spawn(
    process.execPath,
    ["src/server.js"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        RATE_LIMIT_PER_MINUTE: rateLimit,
        SERPAPI_KEY: ""
      },
      stdio: "ignore"
    }
  );

  t.after(() => {
    child.kill("SIGTERM");
  });

  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return child;
    } catch {}

    if (child.exitCode !== null) {
      throw new Error(`Test server exited with code ${child.exitCode}`);
    }

    await delay(100);
  }

  child.kill("SIGTERM");
  throw new Error("Test server did not become ready");
}

test("HTTP security and validation checks", async (t) => {
  await startServer(t);

  const healthResponse = await fetch(`${base}/api/health`);
  assert.equal(healthResponse.status, 200);

  const health = await healthResponse.json();
  assert.equal(health.status, "ok");

  assert.equal(
    healthResponse.headers.get("x-content-type-options"),
    "nosniff"
  );
  assert.equal(
    healthResponse.headers.get("x-frame-options"),
    "DENY"
  );
  assert.ok(healthResponse.headers.get("content-security-policy"));

  const storesResponse = await fetch(`${base}/api/stores`);
  assert.equal(storesResponse.status, 200);
  const stores = await storesResponse.json();
  assert.equal(stores.stores.length, 11);

  const configResponse = await fetch(`${base}/api/config/status`);
  const config = await configResponse.json();
  assert.equal(config.aggregatorConfigured, false);
  assert.equal(config.secretsReturned, false);

  const compareResponse = await fetch(
    `${base}/api/compare?q=sample%20product`
  );
  assert.equal(compareResponse.status, 200);
  const compare = await compareResponse.json();
  assert.equal(compare.summary.storesChecked, 11);
  assert.equal(compare.summary.liveStores, 0);
  assert.ok(
    compare.stores.every(store => store.status === "not_configured")
  );

  assert.equal(
    (await fetch(`${base}/api/compare?q=`)).status,
    400
  );
  assert.equal(
    (await fetch(`${base}/api/compare`)).status,
    400
  );
  assert.equal(
    (await fetch(`${base}/api/compare?q=${"a".repeat(201)}`)).status,
    400
  );
  assert.equal(
    (
      await fetch(
        `${base}/api/compare?q=${encodeURIComponent("phone\u0001test")}`
      )
    ).status,
    400
  );

  assert.equal(
    (await fetch(`${base}/api/not-a-route`)).status,
    404
  );

  const unsupportedMethod = await fetch(`${base}/api/health`, {
    method: "POST"
  });
  assert.equal(unsupportedMethod.status, 405);
  assert.equal(
    unsupportedMethod.headers.get("allow"),
    "GET, HEAD"
  );

  assert.equal((await fetch(`${base}/.env`)).status, 404);

  const traversal = await fetch(`${base}/%2e%2e%2f.env`);
  assert.ok([400, 404].includes(traversal.status));

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /PURCHASEGUARD/i);
});

test("API rate limit returns HTTP 429 when exceeded", async (t) => {
  await startServer(t, "3");

  // The readiness check consumes the first API request.
  // Two more requests reach the limit; the next must be blocked.
  const second = await fetch(`${base}/api/health`);
  const third = await fetch(`${base}/api/health`);
  const fourth = await fetch(`${base}/api/health`);

  assert.equal(second.status, 200);
  assert.equal(third.status, 200);
  assert.equal(fourth.status, 429);

  const body = await fourth.json();
  assert.match(body.error, /rate limit/i);
});
