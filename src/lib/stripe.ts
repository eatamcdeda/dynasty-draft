import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export const UNLOCK_AMOUNT_CENTS = Number(process.env.STRIPE_UNLOCK_AMOUNT_CENTS ?? "999");
export const UNLOCK_CURRENCY = process.env.STRIPE_UNLOCK_CURRENCY ?? "usd";
/** SaaS, personal use — required when Stripe Managed Payments is enabled. */
export const UNLOCK_TAX_CODE = process.env.STRIPE_TAX_CODE ?? "txcd_10103000";

type StripeParams = Record<string, unknown>;

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return key;
}

function flatten(value: unknown, params: URLSearchParams, prefix: string) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, params, `${prefix}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      flatten(nested, params, prefix ? `${prefix}[${key}]` : key);
    }
    return;
  }
  params.append(prefix, String(value));
}

async function stripeRequest(method: string, path: string, params?: StripeParams) {
  const url = new URL(`${STRIPE_API}${path}`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
  };
  let body: string | undefined;
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
  const data = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Stripe request failed (${response.status})`);
  }
  return data;
}

function constructEvent(payload: string, signatureHeader: string, webhookSecret: string) {
  const items = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = items.t;
  const expected = items.v1;
  if (!timestamp || !expected) {
    throw new Error("Invalid Stripe signature header");
  }
  const signed = `${timestamp}.${payload}`;
  const actual = createHmac("sha256", webhookSecret).update(signed).digest("hex");
  const actualBuf = Buffer.from(actual, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error("Invalid Stripe signature");
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) {
    throw new Error("Stripe signature timestamp is too old");
  }
  return JSON.parse(payload) as {
    type: string;
    data: { object: Record<string, unknown> };
  };
}

export function getStripe() {
  return {
    customers: {
      search(options: { query: string; limit?: number }) {
        return stripeRequest("GET", "/customers/search", options) as Promise<{
          data: Array<{ id: string }>;
        }>;
      },
      create(params: StripeParams) {
        return stripeRequest("POST", "/customers", params) as Promise<{ id: string }>;
      },
      update(id: string, params: StripeParams) {
        return stripeRequest("POST", `/customers/${id}`, params) as Promise<{ id: string }>;
      },
    },
    checkout: {
      sessions: {
        create(params: StripeParams) {
          return stripeRequest("POST", "/checkout/sessions", params) as Promise<{
            id: string;
            url?: string | null;
          }>;
        },
        retrieve(id: string) {
          return stripeRequest("GET", `/checkout/sessions/${id}`) as Promise<{
            id: string;
            payment_status?: string;
            customer?: string | { id: string } | null;
            metadata?: Record<string, string> | null;
            client_reference_id?: string | null;
          }>;
        },
      },
    },
    webhooks: {
      constructEvent,
    },
  };
}
