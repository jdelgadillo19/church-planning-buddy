import { isBlockedLibraryWrite, isWriteAllowed } from "./safety";

{
  if (!isBlockedLibraryWrite("v1/libraries", "POST")) {
    throw new Error("POST libraries must be blocked");
  }
  if (isBlockedLibraryWrite("v1/libraries", "GET")) {
    throw new Error("GET libraries must be allowed");
  }
  if (isWriteAllowed("v1/playlists", "GET", false).allowed !== true) {
    throw new Error("GET playlists should be allowed");
  }
  if (isWriteAllowed("v1/playlists", "POST", false).allowed !== false) {
    throw new Error("POST without allowWrites should be blocked");
  }
  if (isWriteAllowed("v1/playlists", "POST", true).allowed !== true) {
    throw new Error("POST playlists with allowWrites should be allowed");
  }
  if (isWriteAllowed("v1/presentation/active", "DELETE", true).allowed !== false) {
    throw new Error("DELETE presentation should not be on allowlist");
  }
}

console.log("propresenter/safety.test.ts: ok");
