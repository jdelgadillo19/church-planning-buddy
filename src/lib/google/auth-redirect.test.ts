import { googleOAuthRedirectUri } from "./auth";

const prev = process.env.GOOGLE_REDIRECT_URI;

process.env.GOOGLE_REDIRECT_URI = "https://grapevineprep.com/api/auth/google/callback";
if (
  googleOAuthRedirectUri("https://www.grapevineprep.com") !==
  "https://grapevineprep.com/api/auth/google/callback"
) {
  throw new Error("expected env GOOGLE_REDIRECT_URI to win over request origin");
}

delete process.env.GOOGLE_REDIRECT_URI;
if (
  googleOAuthRedirectUri("http://localhost:3000") !==
  "http://localhost:3000/api/auth/google/callback"
) {
  throw new Error("expected localhost fallback when env unset");
}

if (prev) process.env.GOOGLE_REDIRECT_URI = prev;

console.log("auth-redirect tests ok");
