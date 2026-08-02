import { promises as fs } from "node:fs";
import path from "node:path";
import type { Database } from "./types";
import { emptyDatabase } from "./types";
import { seedDatabase } from "./seed";

/**
 * 開発用のファイルストア。
 *
 * 依存を足さずに `npm run dev` だけで動かせることを優先している。
 * 本番は supabase/migrations/0001_init.sql の Postgres に置き換える前提で、
 * 呼び出し側はこのモジュールの関数しか触らないようにしてある。
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

let cache: Database | null = null;
let writing: Promise<void> = Promise.resolve();

export async function readDb(): Promise<Database> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    cache = { ...emptyDatabase(), ...(JSON.parse(raw) as Database) };
  } catch {
    cache = seedDatabase();
    await persist(cache);
  }
  return cache;
}

async function persist(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

/** 読み書きを直列化する。開発用なので楽観ロックはしない。 */
export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const db = await readDb();
  let result!: T;
  writing = writing.then(async () => {
    result = await fn(db);
    cache = db;
    await persist(db);
  });
  await writing;
  return result;
}

export function resetCache(): void {
  cache = null;
}

export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
