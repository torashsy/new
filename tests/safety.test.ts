import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * ブロックと送信上限は、ストアを実際に読み書きして確かめる。
 *
 * モジュールを import し直すとストアのインスタンスが分裂して
 * 同じファイルを別々のキャッシュから書き合ってしまうので、
 * import は一度きりにして resetCache() で作り直す。
 */

import * as store from "../lib/store";
import * as queries from "../lib/queries";
import type { Database } from "../lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");

async function fresh() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  store.resetCache();
  return { store, queries };
}

describe("ブロック", () => {
  beforeEach(async () => {
    await fresh();
  });

  test("ブロックした相手は候補から消える", async () => {
    const { store, queries } = await fresh();
    const before = await queries.discover("usr_01");
    assert.ok(before.length > 0);
    const target = before[0].user.id;

    await store.mutate((db: Database) => {
      db.blocks.push({
        id: "blk_test",
        fromUserId: "usr_01",
        toUserId: target,
        createdAt: new Date().toISOString(),
      });
    });

    const after = await queries.discover("usr_01");
    assert.ok(!after.some((c: { user: { id: string } }) => c.user.id === target), "ブロックした相手が候補に残っている");
  });

  test("自分をブロックした相手も候補から消える（双方向）", async () => {
    const { store, queries } = await fresh();
    const before = await queries.discover("usr_01");
    const target = before[0].user.id;

    await store.mutate((db: Database) => {
      db.blocks.push({
        id: "blk_test2",
        fromUserId: target, // 相手がこちらをブロック
        toUserId: "usr_01",
        createdAt: new Date().toISOString(),
      });
    });

    const after = await queries.discover("usr_01");
    assert.ok(!after.some((c: { user: { id: string } }) => c.user.id === target), "自分をブロックした相手が候補に残っている");
  });

  test("ブロックすると今日のフィードからも消える", async () => {
    const { store, queries } = await fresh();
    const feed = await queries.todayFeed("usr_01");
    assert.ok(feed && feed.length > 0, "前提: 今日のフィードに回答がある");
    const target = feed[0].userId;

    await store.mutate((db: Database) => {
      db.blocks.push({
        id: "blk_test3",
        fromUserId: "usr_01",
        toUserId: target,
        createdAt: new Date().toISOString(),
      });
    });

    const after = await queries.todayFeed("usr_01");
    assert.ok(!after!.some((a: { userId: string }) => a.userId === target), "ブロックした相手の回答が残っている");
  });
});

describe("送信上限", () => {
  beforeEach(async () => {
    await fresh();
  });

  test("初期状態では上限いっぱい送れる", async () => {
    const { queries } = await fresh();
    const budget = await queries.interestBudget("usr_01");
    assert.equal(budget.used, 0);
    assert.equal(budget.left, 5);
  });

  test("送るたびに残りが減り、0で止まる", async () => {
    const { store, queries } = await fresh();
    const day = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < 7; i++) {
      await store.mutate((db: Database) => {
        db.interests.push({
          id: `int_${i}`,
          fromUserId: "usr_01",
          toUserId: `usr_${String(i + 2).padStart(2, "0")}`,
          createdAt: `${day}T10:00:00.000Z`,
        });
      });
    }

    const budget = await queries.interestBudget("usr_01");
    assert.equal(budget.used, 7);
    assert.equal(budget.left, 0, "残りが負にならない");
  });

  test("前日ぶんは今日の上限に数えない", async () => {
    const { store, queries } = await fresh();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    await store.mutate((db: Database) => {
      db.interests.push({
        id: "int_old",
        fromUserId: "usr_01",
        toUserId: "usr_05",
        createdAt: `${yesterday}T10:00:00.000Z`,
      });
    });

    const budget = await queries.interestBudget("usr_01");
    assert.equal(budget.used, 0);
    assert.equal(budget.left, 5);
  });
});
