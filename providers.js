import { STORES, envPrefix } from "./stores.js";
import { matchProduct } from "./matching.js";
const timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS || 9000);
const SERP_ENDPOINT = "https://serpapi.com/search.json";
function validOffer(raw, store, query, source) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title ?? raw.name ?? "").trim();
  const price = Number(raw.price ?? raw.extracted_price ?? raw.sellingPrice);
  let url; try { url = new URL(String(raw.url ?? raw.link ?? raw.productUrl ?? raw.product_link)); } catch { return null; }
  if (!title || !Number.isFinite(price) || price <= 0 || !["http:", "https:"].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  const match = matchProduct(query, raw);
  // Fail closed for product identifiers and numeric variant requirements. For example,
  // a query for Galaxy A56 5G 256GB must not surface an A36 or an A56 listing that
  // does not establish the requested capacity as a purchasable offer.
  if (match.isAccessoryMismatch || match.missingCriticalTerms.length > 0) return null;
  return { store: store.name, storeId: store.id, title, price, currency: String(raw.currency || "INR"), url: url.href,
    inStock: typeof raw.inStock === "boolean" ? raw.inStock : typeof raw.in_stock === "boolean" ? raw.in_stock : null,
    brand: raw.brand || null, model: raw.model || raw.model_number || null, variant: raw.variant || null,
    sku: raw.sku || raw.productId || raw.product_id || null, source, ...match, checkedAt: new Date().toISOString() };
}
function result(store, status, searchUrl, extra = {}) { return { store: store.name, storeId: store.id, status, searchUrl, ...extra }; }
async function getJson(url, headers, fetchImpl) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetchImpl(url, { headers, signal: controller.signal }); if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status }); return await response.json(); }
  finally { clearTimeout(timer); }
}
function providerError(store, query, error) {
  const searchUrl = store.search(query);
  if (error?.name === "AbortError") return result(store, "timeout", searchUrl, { message: "Provider timed out." });
  if (error?.status) return result(store, "provider_error", searchUrl, { message: `Provider returned HTTP ${error.status}.` });
  return result(store, "unreachable", searchUrl, { message: "Provider could not be reached or returned invalid JSON." });
}
async function checkDirect(store, query, env, fetchImpl, endpoint) {
  const prefix = envPrefix(store); let api;
  try { api = new URL(endpoint); } catch { return result(store, "configuration_error", store.search(query), { message: "Store API URL is invalid." }); }
  if (!["https:", "http:"].includes(api.protocol) || (api.protocol === "http:" && !["localhost", "127.0.0.1"].includes(api.hostname))) return result(store, "configuration_error", store.search(query), { message: "Provider API must use HTTPS (HTTP is allowed only for localhost)." });
  api.searchParams.set(env[`${prefix}_QUERY_PARAM`] || "q", query);
  try {
    const headers = { accept: "application/json" };
    if (env[`${prefix}_API_KEY`]) headers.authorization = `Bearer ${env[`${prefix}_API_KEY`]}`;
    if (env[`${prefix}_API_HEADER_NAME`] && env[`${prefix}_API_HEADER_VALUE`]) headers[env[`${prefix}_API_HEADER_NAME`]] = env[`${prefix}_API_HEADER_VALUE`];
    const body = await getJson(api, headers, fetchImpl);
    const path = env[`${prefix}_OFFERS_PATH`] || "offers";
    const raw = path.split(".").reduce((v, k) => v?.[k], body);
    if (!Array.isArray(raw)) return result(store, "invalid_response", store.search(query), { message: `Expected an array at JSON path '${path}'.` });
    const offers = raw.map(o => validOffer(o, store, query, "direct-provider")).filter(Boolean);
    return result(store, offers.length ? "live" : "no_matching_offer", store.search(query), { checkedAt: new Date().toISOString(), source: "direct-provider", offers, message: offers.length ? undefined : "Provider responded, but returned no valid offers." });
  } catch (e) { return providerError(store, query, e); }
}
function matchesStore(row, store) {
  const source = String(row.source || row.merchant || "").toLowerCase();
  let host = ""; try { host = new URL(row.link || row.product_link || row.url || "").hostname.toLowerCase().replace(/^www\./, ""); } catch {}
  return store.aliases.some(alias => source.includes(alias) || host === alias || host.endsWith(`.${alias}`));
}
async function getShoppingResults(query, env, fetchImpl) {
  const url = new URL(SERP_ENDPOINT); url.searchParams.set("engine", "google_shopping"); url.searchParams.set("q", query);
  url.searchParams.set("gl", env.SHOPPING_COUNTRY || "in"); url.searchParams.set("hl", env.SHOPPING_LANGUAGE || "en");
  url.searchParams.set("google_domain", env.SHOPPING_GOOGLE_DOMAIN || "google.co.in");
  if (env.SHOPPING_LOCATION) url.searchParams.set("location", env.SHOPPING_LOCATION);
  url.searchParams.set("api_key", env.SERPAPI_KEY);
  return getJson(url, { accept: "application/json" }, fetchImpl);
}
export async function checkStore(store, query, env = process.env, fetchImpl = fetch) {
  const prefix = envPrefix(store); const endpoint = env[`${prefix}_API_URL`];
  if (endpoint) return checkDirect(store, query, env, fetchImpl, endpoint);
  if (!env.SERPAPI_KEY) return result(store, "not_configured", store.search(query), { message: "Add SERPAPI_KEY for live Google Shopping discovery, or configure this store's authorized API endpoint." });
  try {
    const data = await getShoppingResults(query, env, fetchImpl);
    if (data.error) return result(store, "provider_error", store.search(query), { message: "Shopping data provider returned an error." });
    if (!Array.isArray(data.shopping_results)) return result(store, "invalid_response", store.search(query), { message: "Shopping provider response did not include shopping_results." });
    const rows = data.shopping_results.filter(row => matchesStore(row, store));
    const offers = rows.map(row => validOffer({ title: row.title, price: row.extracted_price, currency: "INR", url: row.link || row.product_link, brand: row.brand, model: row.model, variant: row.variant, inStock: null, product_id: row.product_id }, store, query, "google-shopping-aggregator")).filter(Boolean);
    return result(store, offers.length ? "live" : "no_matching_offer", store.search(query), { checkedAt: new Date().toISOString(), source: "google-shopping-aggregator", offers, message: offers.length ? undefined : "Provider search succeeded, but no matching listing was found for this retailer. This does not prove the product is unavailable." });
  } catch (e) { return providerError(store, query, e); }
}
export async function compareAll(query, env = process.env, fetchImpl = fetch) {
  const q = String(query ?? "").trim();
  if (!q) throw Object.assign(new Error("Query is required."), { statusCode: 400 });
  if (q.length > 160) throw Object.assign(new Error("Query must be 160 characters or fewer."), { statusCode: 400 });
  // One aggregator request serves all retailers; store-specific direct APIs override aggregator results.
  const hasDirect = STORES.some(s => env[`${envPrefix(s)}_API_URL`]);
  let aggregateData = null, aggregateError = null;
  if (env.SERPAPI_KEY && STORES.some(s => !env[`${envPrefix(s)}_API_URL`])) {
    try { aggregateData = await getShoppingResults(q, env, fetchImpl); } catch (e) { aggregateError = e; }
  }
  const checks = await Promise.all(STORES.map(async store => {
    const endpoint = env[`${envPrefix(store)}_API_URL`];
    if (endpoint) return checkDirect(store, q, env, fetchImpl, endpoint);
    if (!env.SERPAPI_KEY) return result(store, "not_configured", store.search(q), { message: "Add SERPAPI_KEY for live Google Shopping discovery, or configure this store's authorized API endpoint." });
    if (aggregateError) return providerError(store, q, aggregateError);
    if (!aggregateData) return result(store, "not_configured", store.search(q), { message: "No aggregator response available." });
    if (aggregateData.error) return result(store, "provider_error", store.search(q), { message: "Shopping data provider returned an error." });
    if (!Array.isArray(aggregateData.shopping_results)) return result(store, "invalid_response", store.search(q), { message: "Shopping provider response did not include shopping_results." });
    const offers = aggregateData.shopping_results.filter(row => matchesStore(row, store)).map(row => validOffer({ title: row.title, price: row.extracted_price, currency: "INR", url: row.link || row.product_link, brand: row.brand, model: row.model, variant: row.variant, product_id: row.product_id }, store, q, "google-shopping-aggregator")).filter(Boolean);
    return result(store, offers.length ? "live" : "no_matching_offer", store.search(q), { checkedAt: new Date().toISOString(), source: "google-shopping-aggregator", offers, message: offers.length ? undefined : "No matching listing found for this retailer in this search. This does not prove unavailability." });
  }));
  const offers = checks.flatMap(c => c.offers || []).sort((a, b) => a.price - b.price);
  return { query: q, generatedAt: new Date().toISOString(), priceCurrency: "INR", summary: { storesChecked: checks.length, liveStores: checks.filter(c => c.status === "live").length, offersFound: offers.length, exactMatches: offers.filter(o => o.exactMatch).length, needsVariantReview: offers.filter(o => !o.exactMatch).length, hasDirectStoreApi: hasDirect, aggregator: env.SERPAPI_KEY ? "google-shopping-aggregator" : null }, stores: checks, offers,
    disclaimer: "Prices are third-party shopping results or authorized provider responses and can change at checkout. Exact match is a title/attribute token match, not a guarantee; verify model/SKU and final checkout price before purchase." };
}
