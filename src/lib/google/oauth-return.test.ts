import { decodeOAuthState, encodeOAuthState, sanitizeOAuthReturnTo } from "./oauth-return";

if (sanitizeOAuthReturnTo("/grg") !== "/grg") throw new Error("expected /grg");
if (sanitizeOAuthReturnTo("//evil.com") !== "/") throw new Error("rejected external");
if (sanitizeOAuthReturnTo("https://evil.com/x") !== "/") throw new Error("rejected url");

const state = encodeOAuthState("/slide-deck");
if (decodeOAuthState(state) !== "/slide-deck") throw new Error("roundtrip failed");

console.log("oauth-return tests ok");
