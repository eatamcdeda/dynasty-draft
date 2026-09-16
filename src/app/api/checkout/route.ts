import { NextResponse } from "next/server";
import {
  findOrCreateStripeCustomer,
  getOrCreateUserId,
  hasUnlockedAccess,
} from "@/lib/entitlement";
import { getAppUrl } from "@/lib/env";
import {
  getStripe,
  UNLOCK_AMOUNT_CENTS,
  UNLOCK_CURRENCY,
  UNLOCK_TAX_CODE,
} from "@/lib/stripe";

function checkoutFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/ENOTFOUND|connection to Stripe/i.test(message)) {
    return "Could not reach Stripe. Check your internet connection and try again.";
  }
  if (/tax code/i.test(message) && process.env.STRIPE_PRICE_ID) {
    return "This Stripe Price is missing a product tax code. In the Stripe Dashboard, open the product and set tax code to SaaS – personal use (txcd_10103000), or remove STRIPE_PRICE_ID to use the built-in unlock product.";
  }
  if (message) return message;
  return "Could not start checkout.";
}

export async function POST() {
  try {
    const userId = await getOrCreateUserId();
    if (await hasUnlockedAccess(userId)) {
      return NextResponse.json({ alreadyUnlocked: true, url: "/?unlocked=1" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to .env.local." },
        { status: 503 },
      );
    }

    const origin = getAppUrl();
    const stripe = getStripe();
    const customer = await findOrCreateStripeCustomer({ userId });

    const lineItems = process.env.STRIPE_PRICE_ID
      ? [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }]
      : [
          {
            price_data: {
              currency: UNLOCK_CURRENCY,
              unit_amount: UNLOCK_AMOUNT_CENTS,
              product_data: {
                name: "Dynasty Draft — full access",
                description:
                  "One-time unlock for unlimited drafts this season, plus upcoming live ratings and head-to-head drafts.",
                tax_code: UNLOCK_TAX_CODE,
              },
            },
            quantity: 1,
          },
        ];

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customer.id,
      client_reference_id: userId,
      metadata: {
        dynastyUserId: userId,
      },
      line_items: lineItems,
      success_url: `${origin}/unlock/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    if (!checkout.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("Checkout session failed:", error);
    return NextResponse.json({ error: checkoutFailureMessage(error) }, { status: 502 });
  }
}
