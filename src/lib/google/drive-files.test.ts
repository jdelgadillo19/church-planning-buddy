import {
  buildBlankNameHintQuery,
  escapeDriveQueryValue,
  extractBlankSearchTokens,
} from "./drive-files";

{
  const tokens = extractBlankSearchTokens(
    "Shout To The Lord (Song Scan LF August 20 & 21, 2022)",
  );
  if (!tokens.some((t) => t.includes("shout") && t.includes("lord"))) {
    throw new Error(`expected shout/lord tokens, got ${JSON.stringify(tokens)}`);
  }
}

{
  const tokens = extractBlankSearchTokens("(Resources) Song Scan MASTER - Peace Be Still");
  if (tokens.length === 0) throw new Error("expected tokens from master-style name");
}

{
  const q = buildBlankNameHintQuery(["shout lord"], "drive-abc");
  if (!q.includes("name contains 'blank'") || !q.includes("shout lord")) {
    throw new Error(`unexpected query: ${q}`);
  }
}

if (escapeDriveQueryValue("O'Brien") !== "O\\'Brien") {
  throw new Error("escapeDriveQueryValue failed");
}

console.log("drive-files tests ok");
