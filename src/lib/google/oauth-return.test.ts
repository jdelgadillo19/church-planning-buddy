import {
  decodeOAuthState,
  encodeLegacyOAuthState,
  encodeOAuthState,
  sanitizeOAuthReturnTo,
} from "./oauth-return";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-oauth-state-secret";

if (sanitizeOAuthReturnTo("/grg") !== "/grg") throw new Error("expected /grg");
if (sanitizeOAuthReturnTo("//evil.com") !== "/") throw new Error("rejected external");
if (sanitizeOAuthReturnTo("https://evil.com/x") !== "/") throw new Error("rejected url");

const legacyState = encodeLegacyOAuthState("/slide-deck");
if (decodeOAuthState(legacyState).returnTo !== "/slide-deck") throw new Error("legacy roundtrip failed");

const signedState = encodeOAuthState("/grg", "11111111-1111-1111-1111-111111111111");
const signed = decodeOAuthState(signedState);
if (signed.returnTo !== "/grg") throw new Error("signed returnTo failed");
if (signed.userId !== "11111111-1111-1111-1111-111111111111") throw new Error("signed userId failed");

console.log("oauth-return tests ok");
