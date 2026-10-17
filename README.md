# PurchaseGuard 2.0 — multi-store price discovery

PurchaseGuard is a Node.js application with a responsive comparison UI, 11 retailer entries, a Google Shopping discovery connector, optional direct retailer/provider adapters, variant-match screening, API status visibility, rate limiting, and deployment configuration.

## Important data and access boundary

The included Google Shopping connector uses SerpApi's licensed Google Shopping API. It can return live shopping-search results for some of the listed retailers, depending on the product, location, Google Shopping coverage, and the provider's plan. **It cannot guarantee that all 11 retailers will return an offer for every query, and it is not the same as 11 direct official retailer APIs.** A retailer is marked `live` only when a valid offer attributed to that retailer is returned. `no_matching_offer` means no listing was found in that search; it does not prove the product is unavailable.

Amazon and Flipkart provide official affiliate/product APIs subject to their own account, eligibility, credentials, rate, and usage requirements. Other retailer access may require an approved partner feed or a licensed data provider. PurchaseGuard does not bypass access controls, scrape blocked pages, or invent prices. For retailers that do not expose an authorized endpoint to your account, their live integration cannot be activated by source code alone.

“Exact match” is a conservative query-token/attribute check against the returned listing. It helps flag likely wrong capacity/model/size/color variants, but it is not a manufacturer-grade identity guarantee. For purchase-critical certainty, include the exact model/SKU/GTIN and confirm the retailer's final checkout page. Prices, delivery, stock, coupons, and taxes can change.

## Run locally (Windows)

1. Install Node.js 20 or newer (Node 22 recommended).
2. Extract the ZIP to a folder such as `C:\Users\YourName\Desktop\PurchaseGuard`.
3. Copy `.env.example` to `.env`.
4. Open `.env` in Notepad and set `SERPAPI_KEY=YOUR_REAL_KEY` using your own key from [SerpApi](https://serpapi.com/). Do not add quotes unless needed. Keep `.env` private.
5. Open Command Prompt in the project folder and run:

   ```bat
   npm.cmd test
   npm.cmd start
   ```

6. Open `http://localhost:8080`.
7. Check `http://localhost:8080/api/health` and `http://localhost:8080/api/config/status`.

Without `SERPAPI_KEY` or direct-provider API endpoints, the app still starts, but it will correctly show stores as not configured rather than fabricating live prices. SerpApi may require a paid plan; check its current pricing, quotas, and terms before using it in production.

## Optional direct provider integrations

For any retailer where you have an authorized API/product feed, set that retailer's `*_API_URL` in `.env`. The configured endpoint must accept `GET ?q=<query>` (or your custom `*_QUERY_PARAM`) and return JSON with an array at `*_OFFERS_PATH` (default `offers`). Supported offer fields include:

```json
{
  "offers": [
    {
      "title": "Brand Exact Model 256GB",
      "price": 64999,
      "currency": "INR",
      "url": "https://retailer.example/product/model",
      "inStock": true,
      "brand": "Brand",
      "model": "Exact Model",
      "variant": "256GB",
      "sku": "SKU-123",
      "gtin": "0000000000000"
    }
  ]
}
```

The default authentication header is `Authorization: Bearer <*_API_KEY>`. If the provider requires a different header, configure `*_API_HEADER_NAME` and `*_API_HEADER_VALUE`. Some APIs require request signing, OAuth, or a custom payload and need a dedicated adapter; the generic adapter is not automatically compatible with every provider. Never put a secret in frontend code.

## API routes

- `GET /api/health` — health check.
- `GET /api/stores` — the 11 retailer entries and non-secret configuration flags.
- `GET /api/config/status` — non-secret integration configuration status.
- `GET /api/compare?q=<product query>` — checks providers, normalizes offers, sorts by price, and returns match scores and missing query terms.

## Deployment

### Docker

```sh
docker build -t purchaseguard .
docker run --rm -p 8080:8080 --env-file .env purchaseguard
```

### Render

1. Push this project to a private Git repository.
2. Create a new Render service from the repository; the included `render.yaml` describes a Docker web service.
3. Add `SERPAPI_KEY` as a secret environment variable in Render (do not commit `.env`).
4. Deploy, then open `/api/health`, `/api/config/status`, and the homepage.
5. Search several known model/SKU queries and compare results with the retailer checkout pages.

## Test status

Run `npm.cmd test` before deployment. Tests use mock provider responses so they are deterministic and do not consume paid API calls. A passing mock suite proves the application's contracts, not the availability of third-party APIs or that all 11 stores return live offers. After adding credentials, run real smoke searches and record which retailers actually returned matching offers.

## Production checklist

- [ ] Set `SERPAPI_KEY` securely in hosting secrets, or configure authorized direct provider endpoints.
- [ ] Confirm the chosen provider's price, rate, caching, attribution, and data-retention terms.
- [ ] Verify live results against retailer product pages and final checkout prices.
- [ ] Test exact model/size/color/capacity queries and confirm mismatches are flagged.
- [ ] Configure domain, HTTPS, uptime monitoring, backups/logging, and provider usage alerts.
- [ ] Review rate limits for the real expected traffic; the included in-memory limit is per instance and is not a substitute for an edge/WAF limit.
- [ ] Keep secrets out of Git and frontend bundles.

This repository is a deployable application foundation. The production deployment is not live until you deploy it to an account you control and configure a valid provider key. No source ZIP can create retailer approvals or credentials on your behalf.
