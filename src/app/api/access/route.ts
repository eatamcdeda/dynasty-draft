import { NextResponse } from "next/server";
import { getOrCreateUserId, hasUnlockedAccess, hasUsedTrial } from "@/lib/entitlement";
import { UNLOCK_AMOUNT_CENTS } from "@/lib/stripe";

export async function GET() {
  const userId = await getOrCreateUserId();
  const unlocked = await hasUnlockedAccess(userId);
  const trialUsed = unlocked ? false : await hasUsedTrial();
  return NextResponse.json({
    unlocked,
    trialUsed,
    amountCents: UNLOCK_AMOUNT_CENTS,
  });
}
