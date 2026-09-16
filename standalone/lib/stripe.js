import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export const UNLOCK_AMOUNT_CENTS = Number(process.env.STRIPE_UNLOCK_AMOUNT_CENTS ?? "999");
export const UNLOCK_CURRENCY = process.env.STRIPE_UNLOCK_CURRENCY ?? "usd";
export const UNLOCK_TAX_CODE = process.env.STRIPE_TAX_CODE ?? "txcd_10103000";

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

function flatten(value, params, prefix) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, params, `${prefix}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, params, prefix ? `${prefix}[${key}]` : key);
    }
    return;
  }
  params.append(prefix, String(value));
}

async function stripeRequest(method, path, params) {
  const url = new URL(`${STRIPE_API}${path}`);
  const headers = { Authorization: `Bearer ${secretKey()}` };
  let body;
  if (method === "GET" && params) {
    const search = new URLSearchParams();
    flatten(params, search, "");
    url.search = search.toString();
  } else if (params) {
    const form = new URLSearchParams();
    flatten(params, form, "");
    body = form.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const response = await fetch(url, { method, headers, body });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Stripe request failed (${response.status})`);
  }
  return data;
}

function constructEvent(payload, signatureHeader, webhookSecret) {
  const items = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = items.t;
  const expected = items.v1;
  if (!timestamp || !expected) throw new Error("Invalid Stripe signature header");
  const signed = `${timestamp}.${payload}`;
  const actual = createHmac("sha256", webhookSecret).update(signed).digest("hex");
  const actualBuf = Buffer.from(actual, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error("Invalid Stripe signature");
  }
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new Error("Stripe signature timestamp is too old");
  }
  return JSON.parse(payload);
}

export function getStripe() {
  return {
    customers: {
      search(options) {
        return stripeRequest("GET", "/customers/search", options);
      },
      create(params) {
        return stripeRequest("POST", "/customers", params);
      },
      update(id, params) {
        return stripeRequest("POST", `/customers/${id}`, params);
      },
    },
    checkout: {
      sessions: {
        create(params) {
          return stripeRequest("POST", "/checkout/sessions", params);
        },
        retrieve(id) {
          return stripeRequest("GET", `/checkout/sessions/${id}`);
        },
      },
    },
    webhooks: { constructEvent },
  };
}

export function getAppUrl() {
  const fromEnv = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? process.env.DYNASTY_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:4173";
}
