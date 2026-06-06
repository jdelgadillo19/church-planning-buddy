import { exchangeGoogleOAuthCode } from "./oauth-exchange";

const originalFetch = globalThis.fetch;

process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      access_token: "at-123",
      refresh_token: "rt-456",
      scope: "https://www.googleapis.com/auth/drive",
      token_type: "Bearer",
      expires_in: 3600,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

async function run() {
  const tokens = await exchangeGoogleOAuthCode(
    "auth-code",
    "https://grapevineprep.com/api/auth/google/callback",
  );
  if (tokens.access_token !== "at-123") throw new Error("expected access_token");
  if (tokens.refresh_token !== "rt-456") throw new Error("expected refresh_token");
  if (!tokens.expiry_date || tokens.expiry_date <= Date.now()) throw new Error("expected expiry_date");

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "invalid_grant", error_description: "Code expired" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  let threw = false;
  try {
    await exchangeGoogleOAuthCode("bad", "https://grapevineprep.com/api/auth/google/callback");
  } catch (e) {
    threw = e instanceof Error && e.message.includes("Code expired");
  }
  if (!threw) throw new Error("expected invalid_grant to throw");

  globalThis.fetch = originalFetch;
  console.log("oauth-exchange tests ok");
}

void run();
