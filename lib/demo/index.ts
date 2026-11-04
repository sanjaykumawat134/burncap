/**
 * Demo mode: a fake signed-in user and an in-memory database, so the UI can be previewed without
 * Supabase/Upstash/Stripe accounts. Dev server only: it is always off in production builds,
 * because it bypasses authentication.
 */
export const isDemo = () => process.env.BURNCAP_DEMO === "1" && process.env.NODE_ENV !== "production";

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@burncap.dev",
} as const;

export const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-0000000000a1";
