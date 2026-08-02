import { NextResponse } from "next/server";
import { setSession } from "@/lib/session";
import { readDb } from "@/lib/store";

/**
 * 開発用の入口。パスキーを作らずに初期データのユーザーとして入る。
 *
 * 開発中は既定で開いている。本番ビルドで開けたい場合（デモ環境など）は
 * ALLOW_DEMO_LOGIN=1 を明示的に設定する。設定しなければ 404。
 */
export const demoLoginEnabled = (): boolean =>
  process.env.ALLOW_DEMO_LOGIN === "1" || process.env.NODE_ENV !== "production";

export async function POST(request: Request) {
  if (!demoLoginEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  const db = await readDb();
  const demo = db.users[0];
  if (!demo) return NextResponse.json({ error: "初期データがありません" }, { status: 500 });

  await setSession(demo.id);
  return NextResponse.redirect(new URL("/", request.url), 303);
}
