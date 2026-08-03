import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

import * as store from "../lib/store";
import { canHandoff, openedCount, handoffFor, offerContact } from "../lib/handoff";
import type { Database, Exchange } from "../lib/types";
import { HANDOFF_REQUIRED_EXCHANGES } from "../lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");

const exchange = (id: string, answerCount: number): Exchange => ({
  id,
  connectionId: "con_1",
  promptId: "x001",
  promptText: "",
  openedBy: "usr_01",
  answers: Array.from({ length: answerCount }, (_, i) => ({
    userId: i === 0 ? "usr_01" : "usr_02",
    body: "…",
    createdAt: "2026-08-01T00:00:00.000Z",
  })),
  createdAt: "2026-08-01T00:00:00.000Z",
});

describe("出口が開く条件", () => {
  test("両方が答えた交換だけを数える", () => {
    assert.equal(openedCount([exchange("a", 2), exchange("b", 1), exchange("c", 0)]), 1);
  });

  test(`開いた交換が${HANDOFF_REQUIRED_EXCHANGES}回で解放される`, () => {
    const opened = (n: number) => Array.from({ length: n }, (_, i) => exchange(`e${i}`, 2));
    assert.equal(canHandoff(opened(HANDOFF_REQUIRED_EXCHANGES - 1)), false);
    assert.equal(canHandoff(opened(HANDOFF_REQUIRED_EXCHANGES)), true);
  });

  test("片方しか答えていない交換をいくら積んでも開かない", () => {
    const half = Array.from({ length: 10 }, (_, i) => exchange(`e${i}`, 1));
    assert.equal(canHandoff(half), false);
  });
});

describe("連絡先の受け渡し", () => {
  const opened = Array.from({ length: HANDOFF_REQUIRED_EXCHANGES }, (_, i) => exchange(`e${i}`, 2));

  beforeEach(async () => {
    await fs.rm(DATA_DIR, { recursive: true, force: true });
    await store.resetCache();
    await store.mutate((db: Database) => {
      db.connections.push({
        id: "con_1",
        userIds: ["usr_01", "usr_02"],
        createdAt: "2026-08-01T00:00:00.000Z",
      });
      db.exchanges.push(...opened);
    });
  });

  test("自分が預けるまで、相手のものは見えない", async () => {
    await offerContact("con_1", "usr_02", "line: partner");

    const before = await handoffFor("con_1", "usr_01", opened);
    assert.equal(before.mine, null);
    assert.equal(before.theirs, null, "自分が預ける前に相手のものが見えている");

    await offerContact("con_1", "usr_01", "line: me");
    const after = await handoffFor("con_1", "usr_01", opened);
    assert.equal(after.mine, "line: me");
    assert.equal(after.theirs, "line: partner");
  });

  test("相手から見ても、同じタイミングで開く", async () => {
    await offerContact("con_1", "usr_01", "line: me");
    const theirView = await handoffFor("con_1", "usr_02", opened);
    assert.equal(theirView.theirs, null, "預けていない側に相手のものが見えている");

    await offerContact("con_1", "usr_02", "line: partner");
    const opened2 = await handoffFor("con_1", "usr_02", opened);
    assert.equal(opened2.theirs, "line: me");
  });

  test("一度預けたら上書きできない", async () => {
    await offerContact("con_1", "usr_01", "line: first");
    await offerContact("con_1", "usr_01", "line: second");
    const view = await handoffFor("con_1", "usr_01", opened);
    assert.equal(view.mine, "line: first");
  });

  test("条件を満たしていなければ、サーバ側でも預けられない", async () => {
    await store.mutate((db: Database) => {
      db.exchanges = [exchange("only", 2)]; // 1回しか開いていない
    });
    await offerContact("con_1", "usr_01", "line: me");
    const db = await store.readDb();
    assert.equal(db.handoffs.length, 0, "条件未達なのに預かってしまっている");
  });

  test("当事者以外は預けられない", async () => {
    await offerContact("con_1", "usr_09", "line: stranger");
    const db = await store.readDb();
    assert.equal(db.handoffs.length, 0);
  });

  test("空白だけの連絡先は受け付けない", async () => {
    await offerContact("con_1", "usr_01", "   ");
    const db = await store.readDb();
    assert.equal(db.handoffs.length, 0);
  });

  test("解放前は、あと何回開けばいいかが分かる", async () => {
    const view = await handoffFor("con_1", "usr_01", [exchange("a", 2)]);
    assert.equal(view.remaining, HANDOFF_REQUIRED_EXCHANGES - 1);
  });
});
