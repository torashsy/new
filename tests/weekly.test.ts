import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { pairForWeek, weekStartOf, previousWeekStart, introductionState } from "../lib/weekly";
import type { Axes, Gender, Introduction, User } from "../lib/types";
import { DEFAULT_PREFERENCE } from "../lib/types";

const NOW = new Date("2026-08-05T00:00:00Z"); // 水曜
const WEEK = "2026-08-03"; // その週の月曜

const axes = (v: Partial<Axes> = {}): Axes => ({
  pace: 50, plan: 50, depth: 50, logic: 50, novelty: 50, expression: 50, ...v,
});

function user(id: string, gender: Gender, opts: Partial<User> = {}): User {
  return {
    id,
    handle: id,
    bio: "",
    axes: axes(),
    tags: [],
    birthYear: NOW.getFullYear() - 28,
    gender,
    region: "東京都",
    preference: { ...DEFAULT_PREFERENCE, genders: gender === "female" ? ["male"] : ["female"] },
    createdAt: "",
    ...opts,
  };
}

const base = {
  answers: [],
  blocks: [],
  history: [],
  connections: [],
  weekStart: WEEK,
  now: NOW,
};

describe("週の区切り", () => {
  test("月曜が週の頭になる", () => {
    assert.equal(weekStartOf("2026-08-03"), "2026-08-03"); // 月曜
    assert.equal(weekStartOf("2026-08-05"), "2026-08-03"); // 水曜
    assert.equal(weekStartOf("2026-08-09"), "2026-08-03"); // 日曜は前の月曜に寄る
    assert.equal(weekStartOf("2026-08-10"), "2026-08-10"); // 次の月曜
  });

  test("1週前が求まる", () => {
    assert.equal(previousWeekStart("2026-08-03"), "2026-07-27");
  });
});

describe("おまかせマッチのペアリング", () => {
  test("条件の合う二人が組になる", () => {
    const users = [user("a", "female"), user("b", "male")];
    const pairs = pairForWeek({ ...base, users });
    assert.deepEqual(pairs, [["a", "b"]]);
  });

  test("誰も同じ週に2組には入らない", () => {
    const users = [
      user("a", "female"), user("b", "male"),
      user("c", "female"), user("d", "male"),
      user("e", "female"),
    ];
    const pairs = pairForWeek({ ...base, users });
    const seen = new Set<string>();
    for (const [x, y] of pairs) {
      assert.ok(!seen.has(x), `${x} が2組に入っている`);
      assert.ok(!seen.has(y), `${y} が2組に入っている`);
      seen.add(x);
      seen.add(y);
    }
    // 5人なら最大2組。あぶれる人が出るのは仕様。
    assert.equal(pairs.length, 2);
  });

  test("同じ入力からは必ず同じペアが出る", () => {
    const users = [
      user("a", "female"), user("b", "male"),
      user("c", "female"), user("d", "male"),
    ];
    const first = pairForWeek({ ...base, users });
    const second = pairForWeek({ ...base, users });
    assert.deepEqual(first, second);
  });

  test("条件が合わない相手とは組まない", () => {
    // 二人とも女性を希望 = 互いに条件を満たさない
    const users = [
      user("a", "female", { preference: { ...DEFAULT_PREFERENCE, genders: ["female"] } }),
      user("b", "male", { preference: { ...DEFAULT_PREFERENCE, genders: ["female"] } }),
    ];
    assert.deepEqual(pairForWeek({ ...base, users }), []);
  });

  test("ブロックしている相手とは組まない", () => {
    const users = [user("a", "female"), user("b", "male")];
    const pairs = pairForWeek({
      ...base,
      users,
      blocks: [{ fromUserId: "a", toUserId: "b" }],
    });
    assert.deepEqual(pairs, []);
  });

  test("すでにつながっている相手とは組まない", () => {
    const users = [user("a", "female"), user("b", "male")];
    const pairs = pairForWeek({
      ...base,
      users,
      connections: [{ userIds: ["a", "b"] as [string, string] }],
    });
    assert.deepEqual(pairs, []);
  });

  test("最近紹介した相手は当面もう出さない", () => {
    const users = [user("a", "female"), user("b", "male")];
    const recent: Introduction = {
      id: "i1",
      weekStart: previousWeekStart(WEEK),
      userIds: ["a", "b"],
      responses: [],
      createdAt: "",
    };
    assert.deepEqual(pairForWeek({ ...base, users, history: [recent] }), []);
  });

  test("十分に時間が経った相手は、また出るようになる", () => {
    const users = [user("a", "female"), user("b", "male")];
    let old = WEEK;
    for (let i = 0; i < 10; i++) old = previousWeekStart(old);
    const past: Introduction = {
      id: "i1", weekStart: old, userIds: ["a", "b"], responses: [], createdAt: "",
    };
    assert.deepEqual(pairForWeek({ ...base, users, history: [past] }), [["a", "b"]]);
  });

  test("診断が済んでいない人は紹介に出ない", () => {
    const users = [user("a", "female"), user("b", "male", { axes: null })];
    assert.deepEqual(pairForWeek({ ...base, users }), []);
  });

  test("相性の高い組が優先される", () => {
    // b は a と軸が完全一致、d は a と正反対。a には b が割り当たるはず。
    const users = [
      user("a", "female", { axes: axes({ pace: 20, depth: 80 }) }),
      user("b", "male", { axes: axes({ pace: 20, depth: 80 }) }),
      user("c", "female", { axes: axes({ pace: 90, depth: 10 }) }),
      user("d", "male", { axes: axes({ pace: 90, depth: 10 }) }),
    ];
    const pairs = pairForWeek({ ...base, users });
    const partnerOf = (id: string) =>
      pairs.find((p) => p.includes(id))?.find((x) => x !== id);
    assert.equal(partnerOf("a"), "b");
    assert.equal(partnerOf("c"), "d");
  });
});

describe("紹介の状態", () => {
  const intro = (responses: Introduction["responses"]): Introduction => ({
    id: "i", weekStart: WEEK, userIds: ["me", "you"], responses, createdAt: "",
  });
  const at = "2026-08-05T00:00:00.000Z";

  test("まだ答えていなければ pending", () => {
    assert.equal(introductionState(intro([]), "me"), "pending");
  });

  test("自分だけ会いたいなら waiting", () => {
    assert.equal(
      introductionState(intro([{ userId: "me", answer: "yes", createdAt: at }]), "me"),
      "waiting",
    );
  });

  test("両方が会いたいなら matched", () => {
    const i = intro([
      { userId: "me", answer: "yes", createdAt: at },
      { userId: "you", answer: "yes", createdAt: at },
    ]);
    assert.equal(introductionState(i, "me"), "matched");
    assert.equal(introductionState(i, "you"), "matched");
  });

  test("相手が見送ったときは closed（誰が断ったかは状態に出さない）", () => {
    const i = intro([
      { userId: "me", answer: "yes", createdAt: at },
      { userId: "you", answer: "no", createdAt: at },
    ]);
    assert.equal(introductionState(i, "me"), "closed");
  });

  test("自分が見送ったときは declined", () => {
    assert.equal(
      introductionState(intro([{ userId: "me", answer: "no", createdAt: at }]), "me"),
      "declined",
    );
  });

  test("相手はこちらが見送ったことを知れない（相手側の状態は pending のまま）", () => {
    // 自分が no を出しただけの段階では、相手にはまだ何も起きていない
    const i = intro([{ userId: "me", answer: "no", createdAt: at }]);
    assert.equal(introductionState(i, "you"), "pending");
  });
});
