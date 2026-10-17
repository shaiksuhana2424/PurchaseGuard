
import "./env.js";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STORES, envPrefix } from "./stores.js";
import { compareAll } from "./providers.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public"
);

function readPositiveInteger(name, fallback, max) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be between 1 and ${max}.`);
  }

  return value;
}

const port = readPositiveInteger("PORT", 8080, 65535);
const LIMIT = readPositiveInteger("RATE_LIMIT_PER_MINUTE", 40, 10000);
const WINDOW = 60_000;
const MAX_BUCKETS = 10000;
const MAX_QUERY_LENGTH = 200;
const buckets = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function limited(ip) {
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || now - bucket.start >= WINDOW) {
    if (!bucket && buckets.size >= MAX_BUCKETS) {
      for (const [key, value] of buckets) {
        if (now - value.start >= WINDOW) buckets.delete(key);
      }

      if (buckets.size >= MAX_BUCKETS) return true;
    }

    buckets.set(ip, { start: now, count: 1 });
    return false;
  }

  bucket.count++;
  return bucket.count > LIMIT;
}

function send(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

function setSecurityHeaders(res) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    "Cache-Control": "no-store"
  };

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

async function serveStatic(urlPath, res) {
  let decoded;

  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    send(res, 400, { error: "Invalid URL encoding." });
    return;
  }

  if (decoded.includes("\0") || decoded.includes("\\")) {
    send(res, 400, { error: "Invalid file path." });
    return;
  }

  const requested = decoded === "/" ? "/index.html" : decoded;
  const segments = requested.split("/").filter(Boolean);

  if (
    segments.length !== 1 ||
    segments[0].startsWith(".") ||
    !/^[a-zA-Z0-9_-]+\.(html|css|js|json|svg|png|jpe?g|webp|ico)$/i.test(segments[0])
  ) {
    send(res, 404, { error: "Resource not found." });
    return;
  }

  const filePath = path.resolve(root, segments[0]);

  if (path.dirname(filePath) !== root) {
    send(res, 404, { error: "Resource not found." });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      send(res, 404, { error: "Resource not found." });
      return;
    }

    const data = await readFile(filePath);
    if (res.writableEnded) return;

    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      send(res, 404, { error: "Resource not found." });
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);

  let url;

  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    send(res, 400, { error: "Invalid request URL." });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (limited(req.socket.remoteAddress || "unknown")) {
      send(res, 429, {
        error: "Rate limit exceeded. Please wait and retry."
      });
      return;
    }
  }

  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      send(res, 405, { error: "Method not allowed." });
      return;
    }

    if (req.method === "HEAD") {
      if (url.pathname.startsWith("/api/")) {
        res.writeHead(405, { Allow: "GET" });
        res.end();
        return;
      }

      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!/^[a-zA-Z0-9_-]+\.(html|css|js|json|svg|png|jpe?g|webp|ico)$/i.test(name)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const filePath = path.resolve(root, name);
      if (path.dirname(filePath) !== root) {
        res.writeHead(404);
        res.end();
        return;
      }

      try {
  const info = await stat(filePath);

  if (!info.isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
 res.writeHead(200, {
          "Content-Type": mime[path.extname(filePath).toLowerCase()] ||
            "application/octet-stream"
        });
      } catch {
        res.writeHead(404);
      }
      res.end();
      return;
    }

    if (url.pathname === "/api/health") {
      send(res, 200, {
        status: "ok",
        service: "PurchaseGuard",
        version: "2.0.0",
        time: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/stores") {
      send(res, 200, {
        stores: STORES.map(store => ({
          id: store.id,
          name: store.name,
          searchUrl: store.search(""),
          directApiConfigured: Boolean(
            process.env[`${envPrefix(store)}_API_URL`]
          ),
          discoveryConfigured: Boolean(process.env.SERPAPI_KEY)
        }))
      });
      return;
    }

    if (url.pathname === "/api/config/status") {
      send(res, 200, {
        aggregatorConfigured: Boolean(process.env.SERPAPI_KEY?.trim()),
        directStoresConfigured: STORES
          .filter(store => process.env[`${envPrefix(store)}_API_URL`]?.trim())
          .map(store => store.id),
        storeCount: STORES.length,
        secretsReturned: false
      });
      return;
    }

    if (url.pathname === "/api/compare") {
      const query = url.searchParams.get("q");

      if (typeof query !== "string" || !query.trim()) {
        send(res, 400, {
          error: "Provide a product search query using the q parameter."
        });
        return;
      }

      if (query.length > MAX_QUERY_LENGTH) {
        send(res, 400, {
          error: `Search query must be ${MAX_QUERY_LENGTH} characters or fewer.`
        });
        return;
      }

      if (/[\u0000-\u001F\u007F]/.test(query)) {
        send(res, 400, {
          error: "Search query contains unsupported control characters."
        });
        return;
      }

      send(res, 200, await compareAll(query.trim()));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      send(res, 404, { error: "API route not found." });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }

    const status = Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : 500;

    send(res, status, {
      error: status === 500 ? "Internal server error." : error.message
    });
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.listen(port, "0.0.0.0", () => {
  console.log(`PurchaseGuard listening on port ${port}`);
});

server.on("error", error => {
  console.error("PurchaseGuard server error:", error.message);
  process.exitCode = 1;
});
