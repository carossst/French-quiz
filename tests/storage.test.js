"use strict";

const {
  loadBrowserScript,
  createWindowLike
} = require("./helpers/browser-loader");

function createStorageManager(windowOverrides) {
  const sharedWindow = createWindowLike(windowOverrides);
  const context = loadBrowserScript("storage.js", { window: sharedWindow });
  const StorageManager = context.window.StorageManager;
  const storage = new StorageManager();
  storage.init();
  return { context, storage };
}

test("unlockPremiumWithCode rejects a code that does not match the configured format", () => {
  const { storage } = createStorageManager();

  const result = storage.unlockPremiumWithCode("not-a-real-code");

  expect(result).toMatchObject({ success: false, error: "INVALID_CODE" });
  expect(storage.isPremiumUser()).toBe(false);
});

test("unlockPremiumWithCode rejects empty input", () => {
  const { storage } = createStorageManager();

  const result = storage.unlockPremiumWithCode("");

  expect(result).toMatchObject({ success: false, error: "INVALID_CODE" });
  expect(storage.isPremiumUser()).toBe(false);
});

// NOTE: this documents the current, known-insecure behavior (same root cause
// already flagged on the Pickleball/Coffee/Word Traps sibling apps): any
// string matching the TYF-####-#### shape unlocks premium, with no
// server-side link back to an actual Stripe payment. Tracked separately as a
// security gap to close; this test exists so a future fix intentionally
// changes this assertion rather than silently regressing coverage.
test("unlockPremiumWithCode currently accepts any code matching the configured format", () => {
  const { storage } = createStorageManager();

  const result = storage.unlockPremiumWithCode("TYF-AB12-CD34");

  expect(result).toMatchObject({ success: true, wasAlreadyPremium: false });
  expect(storage.isPremiumUser()).toBe(true);
});

test("unlockPremiumWithCode is case-insensitive on the code format", () => {
  const { storage } = createStorageManager();

  const result = storage.unlockPremiumWithCode("tyf-ab12-cd34");

  expect(result).toMatchObject({ success: true });
  expect(storage.isPremiumUser()).toBe(true);
});

test("unlockPremiumWithCode is idempotent once premium is already unlocked", () => {
  const { storage } = createStorageManager();

  storage.unlockPremiumWithCode("TYF-AB12-CD34");
  const second = storage.unlockPremiumWithCode("TYF-EF56-GH78");

  expect(second).toMatchObject({
    success: true,
    wasAlreadyPremium: true,
    bonusFP: 0
  });
});

test("unlockPremiumWithCode unlocks all quizzes and grants a French-points bonus", () => {
  const { storage } = createStorageManager();

  const before = storage.data.frenchPoints;
  const result = storage.unlockPremiumWithCode("TYF-AB12-CD34");

  expect(result.bonusFP).toBeGreaterThan(0);
  expect(storage.data.frenchPoints).toBe(before + result.bonusFP);
});

function mockJsonFetch(status, body) {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body)
    });
}

function windowWithRedeemApi(fetchImpl) {
  return {
    fetch: fetchImpl,
    TYF_CONFIG: {
      redeem: {
        apiBaseUrl: "https://tyf-redeem.example.workers.dev",
        requestTimeoutMs: 4000
      }
    }
  };
}

test("tryRedeemPremiumCodeRemote unlocks premium for a server-verified admin code", async () => {
  const { storage } = createStorageManager(
    windowWithRedeemApi(mockJsonFetch(200, { ok: true, tier: "admin" }))
  );

  const result = await storage.tryRedeemPremiumCodeRemote("super-secret-admin");

  expect(result).toMatchObject({ ok: true, reason: "UNLOCKED", tier: "admin" });
  expect(storage.isPremiumUser()).toBe(true);
  expect(storage.data.redeem.tier).toBe("admin");
});

test("tryRedeemPremiumCodeRemote unlocks premium for a server-verified guest code", async () => {
  const { storage } = createStorageManager(
    windowWithRedeemApi(
      mockJsonFetch(200, { ok: true, tier: "guest", uses_remaining: 6 })
    )
  );

  const result = await storage.tryRedeemPremiumCodeRemote("guest-2026");

  expect(result).toMatchObject({ ok: true, reason: "UNLOCKED", tier: "guest" });
  expect(storage.isPremiumUser()).toBe(true);
});

test("tryRedeemPremiumCodeRemote does not unlock when the guest code is exhausted", async () => {
  const { storage } = createStorageManager(
    windowWithRedeemApi(
      mockJsonFetch(403, { ok: false, reason: "GUEST_CODE_EXHAUSTED" })
    )
  );

  const result = await storage.tryRedeemPremiumCodeRemote("guest-2026");

  expect(result).toEqual({ ok: false, reason: "GUEST_CODE_EXHAUSTED" });
  expect(storage.isPremiumUser()).toBe(false);
});

test("tryRedeemPremiumCodeRemote reports NOT_FOUND for a code the server does not recognize", async () => {
  const { storage } = createStorageManager(
    windowWithRedeemApi(mockJsonFetch(404, { ok: false, reason: "NOT_FOUND" }))
  );

  const result = await storage.tryRedeemPremiumCodeRemote("TYF-1234-5678");

  expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  expect(storage.isPremiumUser()).toBe(false);
});

test("tryRedeemPremiumCodeRemote reports REMOTE_UNAVAILABLE when the network call fails", async () => {
  const { storage } = createStorageManager(
    windowWithRedeemApi(() => Promise.reject(new Error("network down")))
  );

  const result = await storage.tryRedeemPremiumCodeRemote("anything");

  expect(result).toEqual({ ok: false, reason: "REMOTE_UNAVAILABLE" });
  expect(storage.isPremiumUser()).toBe(false);
});

test("tryRedeemPremiumCodeRemote reports REMOTE_UNAVAILABLE without a network call when apiBaseUrl is unset", async () => {
  let called = false;
  const { storage } = createStorageManager({
    fetch: () => {
      called = true;
      return Promise.resolve();
    },
    TYF_CONFIG: {}
  });

  const result = await storage.tryRedeemPremiumCodeRemote("anything");

  expect(result).toEqual({ ok: false, reason: "REMOTE_UNAVAILABLE" });
  expect(called).toBe(false);
});

test("tryRedeemPremiumCodeRemote short-circuits without a network call once already premium", async () => {
  let called = false;
  const { storage } = createStorageManager(
    windowWithRedeemApi(() => {
      called = true;
      return Promise.resolve();
    })
  );

  storage.unlockPremiumWithCode("TYF-AB12-CD34");
  const result = await storage.tryRedeemPremiumCodeRemote("anything");

  expect(result).toEqual({ ok: true, reason: "ALREADY" });
  expect(called).toBe(false);
});

test("tryRedeemPremiumCodeRemote rejects empty input", async () => {
  const { storage } = createStorageManager(
    windowWithRedeemApi(mockJsonFetch(200, {}))
  );

  const result = await storage.tryRedeemPremiumCodeRemote("");

  expect(result).toEqual({ ok: false, reason: "EMPTY" });
});
