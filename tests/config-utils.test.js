"use strict";

const { loadBrowserScript } = require("./helpers/browser-loader");

function loadConfig() {
  const context = loadBrowserScript("config.js");
  return context.window.TYF_UTILS;
}

// TYF_UTILS.isValidStripeUrl gates every Stripe checkout redirect in the app
// (main.js's header link, and the buy buttons in ui-core.js/ui-features.js/
// ui-charts.js). Before this helper existed, most of those call sites just
// did `if (url) window.location.href = url` with no validation at all —
// only main.js's header-link binder had the check. These tests pin down the
// shared helper's contract so that guarantee can't silently regress again.
test("isValidStripeUrl accepts a well-formed buy.stripe.com URL", () => {
  const TYF_UTILS = loadConfig();

  expect(TYF_UTILS.isValidStripeUrl("https://buy.stripe.com/abc123")).toBe(
    true
  );
});

test("isValidStripeUrl rejects a non-Stripe hostname", () => {
  const TYF_UTILS = loadConfig();

  expect(TYF_UTILS.isValidStripeUrl("https://evil.example.com/steal")).toBe(
    false
  );
});

test("isValidStripeUrl rejects a scheme-relative or non-https attempt to spoof the host", () => {
  const TYF_UTILS = loadConfig();

  expect(TYF_UTILS.isValidStripeUrl("http://buy.stripe.com/abc123")).toBe(
    false
  );
  expect(TYF_UTILS.isValidStripeUrl("javascript:alert(1)")).toBe(false);
});

test("isValidStripeUrl rejects empty, missing, or non-string input", () => {
  const TYF_UTILS = loadConfig();

  expect(TYF_UTILS.isValidStripeUrl("")).toBe(false);
  expect(TYF_UTILS.isValidStripeUrl(undefined)).toBe(false);
  expect(TYF_UTILS.isValidStripeUrl(null)).toBe(false);
});
