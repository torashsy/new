import { promises as fs } from "node:fs";
import path from "node:path";
import type { Database } from "./types";
import { emptyDatabase } from "./types";
import { seedDatabase } from "./seed";

/**
 * 開発用のファイルストア。
 *
 * 依存を足さずに `npm run dev` だけで動かせることを優先している。
 * 本番は supabase/migrations/ の Postgres に置き換える前提で、
 * 呼び出し側はこのモジュールの関数しか触らないようにしてある。
 *
 * 【メモリにキャッシュしない理由】
 * 以前は読み込んだ Database をモジュール変数に持っていたが、
 * ページの描画とルートハンドラが別プロセスで動くと、それぞれが自分の
 * 古いコピーを保持したまま同じファイルに書き戻し、片方の更新が消えた。
 * 新規登録したユーザーが次の書き込みで丸ごと消える、という形で表面化した。
 * 毎回ファイルから読むのは遅いが、開発用のストアとしては正しさを取る。
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

/** 書き込みを直列化するためのチェーン。プロセス内でのみ有効。 */
let writing: Promise<void> = Promise.resolve();

export async function readDb(): Promise<Database> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return { ...emptyDatabase(), ...(JSON.parse(raw) as Database) };
  } catch {
    const seeded = seedDatabase();
    await persist(seeded);
    return seeded;
  }
}

/** 一時ファイルに書いてから差し替える。読み手が途中の状態を見ないように。 */
async function persist(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

/**
 * 読み書きを直列化する。
 *
 *  - readDb は直列化の内側で呼ぶ。外で呼ぶと、待っている間に別の書き込みが
 *    走って、こちらが古い内容を掴んだままになる。
 *  - 失敗を次に伝播させない。伝播させると、一度どこかで例外が出た時点で
 *    writing が rejected のまま固定され、以降の書き込みが全部落ちる。
 */
export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = writing.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  writing = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** テスト用。キャッシュを持たなくなったので、書き込み待ちを流すだけ。 */
export async function resetCache(): Promise<void> {
  await writing.catch(() => undefined);
  writing = Promise.resolve();
}

export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
