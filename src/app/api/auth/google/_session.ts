import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

export type GoogleTokens = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

const COOKIE_NAME = "cpb_session";
const TOKEN_DIR = path.join(process.cwd(), ".data");
const TOKEN_FILE = path.join(TOKEN_DIR, "google-tokens.json");

type TokenStore = Record<string, GoogleTokens>;

const globalForSessions = globalThis as unknown as {
  __cpbSessions?: Map<string, GoogleTokens>;
};

function memoryStore() {
  if (!globalForSessions.__cpbSessions) globalForSessions.__cpbSessions = new Map();
  return globalForSessions.__cpbSessions;
}

async function readDiskStore(): Promise<TokenStore> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    return JSON.parse(raw) as TokenStore;
  } catch {
    return {};
  }
}

async function writeDiskStore(store: TokenStore) {
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function getOrCreateSessionId() {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = crypto.randomBytes(18).toString("base64url");
  jar.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return id;
}

export async function saveTokensForCurrentSession(tokens: GoogleTokens) {
  const id = await getOrCreateSessionId();
  memoryStore().set(id, tokens);
  const disk = await readDiskStore();
  disk[id] = tokens;
  await writeDiskStore(disk);
}

export async function loadTokensForCurrentSession(): Promise<GoogleTokens | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE_NAME)?.value;
  if (!id) return null;

  const mem = memoryStore().get(id);
  if (mem) return mem;

  const disk = await readDiskStore();
  const tokens = disk[id] ?? null;
  if (tokens) memoryStore().set(id, tokens);
  return tokens;
}

export function googleConnected(tokens: GoogleTokens | null) {
  return Boolean(tokens?.access_token || tokens?.refresh_token);
}

/** First stored session — for local CLI runners (launchd) without browser cookies. */
export async function loadAnyStoredGoogleTokens(): Promise<GoogleTokens | null> {
  const disk = await readDiskStore();
  for (const tokens of Object.values(disk)) {
    if (googleConnected(tokens)) return tokens;
  }
  return null;
}
