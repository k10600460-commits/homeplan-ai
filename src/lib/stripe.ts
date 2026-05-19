import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
});

export const STRIPE_PRICE_ID      = process.env.STRIPE_PRICE_ID!;
export const STRIPE_TEAM_PRICE_ID = process.env.STRIPE_TEAM_PRICE_ID!;

export function planFromPriceId(priceId: string): "pro" | "team" {
  return priceId === STRIPE_TEAM_PRICE_ID ? "team" : "pro";
}

// Trial: 14 days free, card required at signup
export const TRIAL_PERIOD_DAYS = 14;
