import { buildServicePackageKey } from "./service-package-key";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(buildServicePackageKey("2026-06-08") === "2026.06.08-SUN", "iso date key");
assert(buildServicePackageKey("2026-06-08", "SUN") === "2026.06.08-SUN", "explicit prefix");
assert(buildServicePackageKey("") === "SUN", "empty date falls back to prefix");

console.log("service-package-key.test.ts: ok");
