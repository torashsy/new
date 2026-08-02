import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * セッション。
 *
 * 署名付きクッキーに userId を入れるだけ。サーバ側にセッション表を持たない。
 * パスワードを預からない設計なので、漏れて困る秘密はこの署名鍵だけになる。
 */

const COOKIE = "katachi_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30日

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET が設定されていません");
  }
  // 開発時のみ。プロセスを再起動するとログアウトする。
  globalThis.__katachiDevSecret ??= randomBytes(32).toString("hex");
  return globalThis.__katachiDevSecret;
}

const sign = (value: string): string =>
  createHmac("sha256", secret()).update(value).digest("base64url");

function verify(token: string): string | null {
  const index = token.lastIndexOf(".");
  if (index <= 0) return null;
  const value = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = sign(value);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return value;
}

export async function setSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** ログインしていなければ null。 */
export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return token ? verify(token) : null;
}

declare global {
  // eslint-disable-next-line no-var
  var __katachiDevSecret: string | undefined;
}
