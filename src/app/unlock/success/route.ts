import { NextResponse } from "next/server";
import { markCustomerUnlocked, getOrCreateUserId, setUnlockCookie } from "@/lib/entitlement";
import { getAppUrl } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

export async function GET(request: Request) {
  const origin = getAppUrl();
  const userId = await getOrCreateUserId();
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(new URL("/", origin));
  }

  const checkout = await getStripe().checkout.sessions.retrieve(sessionId);
  const paidUser = checkout.metadata?.dynastyUserId;
  const paid =
    checkout.payment_status === "paid" &&
    (paidUser === userId || checkout.client_reference_id === userId);

  if (paid) {
    const customerId = typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id;
    await markCustomerUnlocked(userId, customerId);
    await setUnlockCookie(userId);
    return NextResponse.redirect(new URL("/?unlocked=1", origin));
  }

  return NextResponse.redirect(new URL("/", origin));
}
