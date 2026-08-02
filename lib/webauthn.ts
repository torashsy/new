import { headers } from "next/headers";
import { mutate, newId, readDb } from "./store";
import type { Challenge } from "./types";

export const RP_NAME = "かたち";

/**
 * rpID と origin はリクエストから決める。
 * ハードコードすると localhost と本番でどちらかが必ず壊れるので、
 * 環境変数があればそれを優先し、なければ Host ヘッダから組み立てる。
 */
export async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  if (process.env.RP_ID && process.env.ORIGIN) {
    return { rpID: process.env.RP_ID, origin: process.env.ORIGIN };
  }
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const hostname = host.split(":")[0];
  const proto = h.get("x-forwarded-proto") ?? (hostname === "localhost" ? "http" : "https");
  return { rpID: hostname, origin: `${proto}://${host}` };
}

const TTL_MS = 5 * 60 * 1000;

export async function storeChallenge(
  value: string,
  opts: { userId?: string; pendingHandle?: string } = {},
): Promise<string> {
  const id = newId("chl");
  await mutate((db) => {
    const now = Date.now();
    // 期限切れはここで掃除する。専用のジョブを持たない。
    db.challenges = db.challenges.filter((c) => Date.parse(c.expiresAt) > now);
    db.challenges.push({
      id,
      value,
      userId: opts.userId ?? null,
      pendingHandle: opts.pendingHandle ?? null,
      expiresAt: new Date(now + TTL_MS).toISOString(),
    });
  });
  return id;
}

/** 一度使ったチャレンジは必ず消す（再利用を許さない）。 */
export async function consumeChallenge(id: string): Promise<Challenge | null> {
  return mutate((db) => {
    const index = db.challenges.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const [challenge] = db.challenges.splice(index, 1);
    if (Date.parse(challenge.expiresAt) < Date.now()) return null;
    return challenge;
  });
}

export async function credentialsOf(userId: string) {
  const db = await readDb();
  return db.credentials.filter((c) => c.userId === userId);
}

export async function findCredential(id: string) {
  const db = await readDb();
  return db.credentials.find((c) => c.id === id) ?? null;
}

export async function handleTaken(handle: string): Promise<boolean> {
  const db = await readDb();
  return db.users.some((u) => u.handle.toLowerCase() === handle.toLowerCase());
}
