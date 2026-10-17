
import test from "node:test";
import assert from "node:assert/strict";
import { STORES } from "../src/stores.js";
import { checkStore, compareAll } from "../src/providers.js";
import { matchProduct } from "../src/matching.js";

const query = "Samsung Galaxy S25";

function mockResponse(data, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => {
      if (options.jsonError) throw options.jsonError;
      return data;
    }
  };
}

function validRawOffer(overrides = {}) {
  return {
    title: "Samsung Galaxy S25 256GB",
    price: 79999,
    url: "https://www.amazon.in/dp/example",
    brand: "Samsung",
    model: "Galaxy S25",
    ...overrides
  };
}

test("registry contains 11 stores", () => {
  assert.equal(STORES.length, 11);
});

test("unconfigured store returns not_configured", async () => {
  const store = STORES[0];
  const result = await checkStore(store, query, {});

  assert.equal(result.status, "not_configured");
  assert.equal(result.storeId, store.id);
  assert.ok(result.searchUrl);
});

test("direct provider returns a valid matching offer", async () => {
  const store = STORES[0];

  const result = await checkStore(
    store,
    query,
    { AMAZON_API_URL: "https://provider.example/search" },
    async () => mockResponse({ offers: [validRawOffer()] })
  );

  assert.equal(result.status, "live");
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].price, 79999);
  assert.equal(result.source, "direct-provider");
});

test("invalid offers are discarded", async () => {
  const store = STORES[0];

  const result = await checkStore(
    store,
    query,
    { AMAZON_API_URL: "https://provider.example/search" },
    async () =>
      mockResponse({
        offers: [
          validRawOffer({ price: -1 }),
          validRawOffer({ url: "javascript:alert(1)" }),
          validRawOffer({ title: "" })
        ]
      })
  );

  assert.equal(result.status, "no_matching_offer");
  assert.equal(result.offers.length, 0);
});

test("provider HTTP errors are reported", async () => {
  const store = STORES[0];

  const result = await checkStore(
    store,
    query,
    { AMAZON_API_URL: "https://provider.example/search" },
    async () => mockResponse({}, { ok: false, status: 503 })
  );

  assert.equal(result.status, "provider_error");
  assert.match(result.message, /HTTP 503/);
});

test("provider invalid JSON is reported as invalid_response", async () => {
  const store = STORES[0];

  const result = await checkStore(
    store,
    query,
    { AMAZON_API_URL: "https://provider.example/search" },
    async () =>
      mockResponse(null, {
        jsonError: new SyntaxError("Invalid JSON")
      })
  );

  assert.equal(result.status, "invalid_response");
  assert.match(result.message, /invalid JSON/i);
});

test("provider response with missing offers array is invalid", async () => {
  const store = STORES[0];

  const result = await checkStore(
    store,
    query,
    { AMAZON_API_URL: "https://provider.example/search" },
    async () => mockResponse({ results: [] })
  );

  assert.equal(result.status, "invalid_response");
  assert.match(result.message, /Expected an array/);
});

test("invalid direct provider URL is rejected", async () => {
  const result = await checkStore(
    STORES[0],
    query,
    { AMAZON_API_URL: "not-a-valid-url" }
  );

  assert.equal(result.status, "configuration_error");
});

test("non-local HTTP provider URL is rejected", async () => {
  const result = await checkStore(
    STORES[0],
    query,
    { AMAZON_API_URL: "http://provider.example/search" }
  );

  assert.equal(result.status, "configuration_error");
});

test("provider timeout is reported correctly", async () => {
  const store = STORES[0];

  const result = await checkStore(
    store,
    query,
    { AMAZON_API_URL: "https://provider.example/search" },
    async () => {
      const error = new Error("Request aborted");
      error.name = "AbortError";
      throw error;
    }
  );

  assert.equal(result.status, "timeout");
  assert.match(result.message, /timed out/i);
});

test("provider network failure is reported as unreachable", async () => {
  const store = STORES[0];

  const result = await checkStore(
    store,
    query,
    { AMAZON_API_URL: "https://provider.example/search" },
    async () => {
      throw new TypeError("Failed to fetch");
    }
  );

  assert.equal(result.status, "unreachable");
  assert.match(result.message, /could not be reached/i);
});

test("empty query is rejected by compareAll", async () => {
  await assert.rejects(
    () => compareAll(""),
    error => error.statusCode === 400
  );
});

test("oversized query is rejected by compareAll", async () => {
  await assert.rejects(
    () => compareAll("a".repeat(161)),
    error => error.statusCode === 400
  );
});


test("matching rejects a different product variant", () => {
  const match = matchProduct(
    "Samsung Galaxy S25 256GB",
    { title: "Samsung Galaxy S25 Ultra 512GB" }
  );

  assert.equal(match.exactMatch, false);
});

test("matching rejects a different storage capacity", () => {
  const match = matchProduct(
    "Samsung Galaxy S25 256GB",
    { title: "Samsung Galaxy S25 512GB" }
  );

  assert.equal(match.exactMatch, false);
});

test("matching rejects listings missing requested storage capacity", () => {
  const match = matchProduct(
    "Samsung Galaxy S25 256GB",
    { title: "Samsung Galaxy S25" }
  );

  assert.equal(match.exactMatch, false);
});

test("matching rejects accessory listings for a phone query", () => {
  const match = matchProduct(
    "Samsung Galaxy S25 256GB",
    { title: "Samsung Galaxy S25 protective case cover" }
  );

  assert.equal(match.exactMatch, false);
  assert.equal(match.isAccessoryMismatch, true);
});

test("matching rejects Samsung Galaxy A56 Rugged Armor accessory listings", () => {
  const match = matchProduct(
    "Samsung Galaxy A56 5G",
    { title: "Galaxy A56 5G Series - Rugged Armor" }
  );

  assert.equal(match.exactMatch, false);
  assert.equal(match.isAccessoryMismatch, true);
});
test("matching does not verify an unrequested model variant as exact", () => {
  const match = matchProduct(
    "Samsung Galaxy S25",
    { title: "Samsung Galaxy S25 Ultra 256GB" }
  );

  assert.equal(match.exactMatch, false);
});


test("shopping results are attributed only to the matching retailer", async () => {
  const result = await compareAll(
    query,
    { SERPAPI_KEY: "test-key" },
    async url => {
      const requested = new URL(url);
      assert.equal(
        requested.searchParams.get("engine"),
        "google_shopping"
      );

      return mockResponse({
        shopping_results: [
          {
            title: "Samsung Galaxy S25 256GB",
            extracted_price: 79999,
            link: "https://www.amazon.in/dp/example",
            source: "Amazon"
          },
          {
            title: "Samsung Galaxy S25 256GB",
            extracted_price: 78999,
            link: "https://www.flipkart.com/example",
            source: "Flipkart"
          }
        ]
      });
    }
  );

  assert.equal(result.summary.storesChecked, 11);
  assert.ok(
    result.offers.every(offer =>
      ["Amazon", "Flipkart"].includes(offer.store)
    )
  );

  for (let i = 1; i < result.offers.length; i++) {
    assert.ok(result.offers[i - 1].price <= result.offers[i].price);
  }
});

test("shopping results with no matching retailer offer are not marked live", async () => {
  const result = await compareAll(
    query,
    { SERPAPI_KEY: "test-key" },
    async () =>
      mockResponse({
        shopping_results: [
          {
            title: "Samsung Galaxy S25 256GB",
            extracted_price: 79999,
            link: "https://www.example.com/product",
            source: "Unknown Shop"
          }
        ]
      })
  );

  assert.equal(result.summary.offersFound, 0);
  assert.ok(
    result.stores.every(store => store.status === "no_matching_offer")
  );
});

test("empty shopping_results returns no matching offers", async () => {
  const result = await checkStore(
    STORES[0],
    query,
    { SERPAPI_KEY: "test-key" },
    async () => mockResponse({ shopping_results: [] })
  );

  assert.equal(result.status, "no_matching_offer");
  assert.equal(result.offers.length, 0);
});

test("shopping provider API errors are reported", async () => {
  const result = await checkStore(
    STORES[0],
    query,
    { SERPAPI_KEY: "test-key" },
    async () => mockResponse({ error: "API key invalid" })
  );

  assert.equal(result.status, "provider_error");
});

test("shopping provider missing shopping_results is invalid", async () => {
  const result = await checkStore(
    STORES[0],
    query,
    { SERPAPI_KEY: "test-key" },
    async () => mockResponse({ unexpected: [] })
  );

  assert.equal(result.status, "invalid_response");
});
