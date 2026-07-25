"use strict";

const { loadBrowserScript } = require("./helpers/browser-loader");

function createStorageManager() {
  const context = loadBrowserScript("storage.js");
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
