import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DIAGNOSTIC, scoreDiagnostic, describeAxis } from "../lib/axes";
import { axisAffinity, tagAffinity, answerAffinity, matchScore } from "../lib/score";
import { shapePath, radii, seedFrom, shapeColors } from "../lib/shape";
import { questionForDate, DAILY_QUESTIONS, EXCHANGE_PROMPTS } from "../lib/questions";
import { seedDatabase } from "../lib/seed";
import type { Answer, Axes, User } from "../lib/types";
import { AXIS_IDS } from "../lib/types";

const axes = (v: Partial<Axes> = {}): Axes => ({
  pace: 50, plan: 50, depth: 50, logic: 50, novelty: 50, expression: 50, ...v,
});

describe("診断", () => {
  test("全問「どちらでもない」なら全軸が50になる", () => {
    const responses = Object.fromEntries(DIAGNOSTIC.map((q) => [q.id, 3]));
    const result = scoreDiagnostic(responses);
    for (const id of AXIS_IDS) assert.equal(result[id], 50);
  });

  test("dir を考慮して両極に振れる", () => {
    // pace は q1(dir=-1) と q7(dir=+1)。両方「そう」なら打ち消して中庸。
    assert.equal(scoreDiagnostic({ q1: 5, q7: 5 }).pace, 50);
    // q1に「違う」= 人といる時間寄り、q7に「そう」= 同じ向き → 100 に振り切る
    assert.equal(scoreDiagnostic({ q1: 1, q7: 5 }).pace, 100);
    assert.equal(scoreDiagnostic({ q1: 5, q7: 1 }).pace, 0);
  });

  test("未回答の軸は50に倒れる", () => {
    assert.equal(scoreDiagnostic({ q1: 1 }).depth, 50);
  });

  test("範囲外の入力を丸める", () => {
    assert.equal(scoreDiagnostic({ q1: 99, q7: -5 }).pace, 0);
  });

  test("全12問がちょうど2問ずつ6軸を覆っている", () => {
    const counts = new Map<string, number>();
    for (const q of DIAGNOSTIC) counts.set(q.axis, (counts.get(q.axis) ?? 0) + 1);
    assert.equal(counts.size, AXIS_IDS.length);
    for (const [, n] of counts) assert.equal(n, 2);
  });

  test("describeAxis が両極と中庸を出し分ける", () => {
    assert.equal(describeAxis("pace", 90), "人といる時間寄り");
    assert.equal(describeAxis("pace", 10), "ひとりの時間寄り");
    assert.equal(describeAxis("pace", 50), "どちらも");
  });
});

describe("相性", () => {
  test("同一の軸なら100", () => {
    assert.equal(Math.round(axisAffinity(axes(), axes())), 100);
  });

  test("正反対なら大きく下がる", () => {
    const a = axes({ pace: 0, plan: 0, depth: 0, logic: 0, novelty: 0, expression: 0 });
    const b = axes({ pace: 100, plan: 100, depth: 100, logic: 100, novelty: 100, expression: 100 });
    assert.ok(axisAffinity(a, b) < 30);
  });

  test("tolerant な軸の差は similar な軸の差より軽い", () => {
    const base = axes();
    const similarDiff = axisAffinity(base, axes({ pace: 100 })); // similar
    const tolerantDiff = axisAffinity(base, axes({ logic: 100 })); // tolerant
    assert.ok(tolerantDiff > similarDiff, "tolerant のほうが減点が小さいはず");
  });

  test("珍しいタグの一致は、ありふれたタグの一致より高く出る", () => {
    const corpus = [
      ["珈琲", "散歩"], ["珈琲", "映画"], ["珈琲", "自炊"],
      ["珈琲", "銭湯"], ["珈琲", "山"], ["短歌", "山"],
    ];
    // 一致以外のタグを揃えた上で、一致したタグの珍しさだけを変えて比べる
    const common = tagAffinity(["珈琲", "散歩"], ["珈琲", "山"], corpus).score;
    const rare = tagAffinity(["短歌", "散歩"], ["短歌", "山"], corpus).score;
    assert.ok(rare > common, `珍しいタグ(${rare})がありふれたタグ(${common})を上回るはず`);
  });

  test("持っているタグが完全に同じなら、珍しさに関係なく満点", () => {
    const corpus = [["珈琲"], ["珈琲"], ["短歌"]];
    assert.equal(tagAffinity(["珈琲"], ["珈琲"], corpus).score, 100);
    assert.equal(tagAffinity(["短歌"], ["短歌"], corpus).score, 100);
  });

  test("重なりがなければ0", () => {
    assert.equal(tagAffinity(["a"], ["b"], [["a"], ["b"]]).score, 0);
  });

  test("タグが空でも落ちない", () => {
    assert.equal(tagAffinity([], [], []).score, 0);
  });

  const answer = (userId: string, questionId: string, body: string): Answer => ({
    id: `${userId}-${questionId}`, userId, questionId, body, createdAt: "2026-01-01T00:00:00.000Z",
  });

  test("同じ問いに答えていなければ0", () => {
    const score = answerAffinity([answer("a", "d001", "x")], [answer("b", "d002", "x")]);
    assert.equal(score.score, 0);
    assert.equal(score.sharedQuestionCount, 0);
  });

  test("同じ問いに似た言葉で答えると上がる", () => {
    const same = answerAffinity(
      [answer("a", "d001", "夜に散歩するのが好きです")],
      [answer("b", "d001", "夜に散歩するのが好きです")],
    );
    const different = answerAffinity(
      [answer("a", "d001", "夜に散歩するのが好きです")],
      [answer("b", "d001", "朝ごはんは必ず食べます")],
    );
    assert.ok(same.score > different.score);
    assert.equal(same.sharedQuestionCount, 1);
  });

  test("診断が済んでいない相手とは相性を出さない", () => {
    const me: User = { id: "a", handle: "a", bio: "", axes: axes(), tags: [], createdAt: "" };
    const other: User = { id: "b", handle: "b", bio: "", axes: null, tags: [], createdAt: "" };
    assert.equal(matchScore(me, other, [], [], []), null);
  });

  test("内訳の合計が0-100に収まる", () => {
    const me: User = { id: "a", handle: "a", bio: "", axes: axes({ pace: 20 }), tags: ["銭湯"], createdAt: "" };
    const other: User = { id: "b", handle: "b", bio: "", axes: axes({ pace: 80 }), tags: ["銭湯"], createdAt: "" };
    const b = matchScore(me, other, [], [], [["銭湯"], ["山"]])!;
    assert.ok(b.total >= 0 && b.total <= 100);
    assert.deepEqual(b.sharedTags, ["銭湯"]);
    assert.equal(b.closestAxes.length, 2);
  });
});

describe("かたち", () => {
  test("同じ軸なら必ず同じパスになる", () => {
    assert.equal(shapePath(axes({ pace: 70 }), 0.3), shapePath(axes({ pace: 70 }), 0.3));
  });

  test("軸が変われば形が変わる", () => {
    assert.notEqual(shapePath(axes({ pace: 10 })), shapePath(axes({ pace: 90 })));
  });

  test("半径が想定の範囲に収まる（極端な診断でも破綻しない）", () => {
    for (const v of [0, 50, 100]) {
      for (const r of radii(axes({ pace: v, plan: v, depth: v, logic: v, novelty: v, expression: v }))) {
        assert.ok(r >= 22 && r <= 54, `半径 ${r} が範囲外`);
      }
    }
  });

  test("閉じたパスになっている", () => {
    const d = shapePath(axes());
    assert.ok(d.startsWith("M "));
    assert.ok(d.endsWith(" Z"));
    assert.equal((d.match(/Q /g) ?? []).length, 6);
  });

  test("seed は文字列ごとに安定して 0..1 を返す", () => {
    assert.equal(seedFrom("usr_01"), seedFrom("usr_01"));
    assert.notEqual(seedFrom("usr_01"), seedFrom("usr_02"));
    const s = seedFrom("usr_03");
    assert.ok(s >= 0 && s < 1);
  });

  test("色相が0-360に収まる", () => {
    const { from, to } = shapeColors(axes({ novelty: 100, pace: 100, expression: 100 }));
    for (const c of [from, to]) {
      const hue = Number(c.match(/ ([\d.]+)\)$/)![1]);
      assert.ok(hue >= 0 && hue < 360, `色相 ${hue} が範囲外`);
    }
  });
});

describe("問い", () => {
  test("同じ日付なら必ず同じ問いになる", () => {
    assert.equal(questionForDate("2026-08-03").id, questionForDate("2026-08-03").id);
  });

  test("全ユーザーが同じ日に同じ問いを受け取る（日付だけで決まる）", () => {
    const ids = new Set([0, 1, 2].map(() => questionForDate("2026-08-03").id));
    assert.equal(ids.size, 1);
  });

  test("連続する日で問いが替わる", () => {
    assert.notEqual(questionForDate("2026-08-03").id, questionForDate("2026-08-04").id);
  });

  test("30日で一周する", () => {
    assert.equal(questionForDate("2026-08-03").id, questionForDate("2026-09-02").id);
  });

  test("問いのidに重複がない", () => {
    assert.equal(new Set(DAILY_QUESTIONS.map((q) => q.id)).size, DAILY_QUESTIONS.length);
    assert.equal(new Set(EXCHANGE_PROMPTS.map((q) => q.id)).size, EXCHANGE_PROMPTS.length);
  });

  test("問いに全角英数や未翻訳の語が混ざっていない", () => {
    for (const q of [...DAILY_QUESTIONS, ...EXCHANGE_PROMPTS]) {
      assert.ok(!/[A-Za-zА-Яа-я]/.test(q.text), `${q.id} に英字/キリル文字が混ざっている: ${q.text}`);
    }
  });
});

describe("初期データ", () => {
  const db = seedDatabase();

  test("全員が診断済みで、タグを持っている", () => {
    for (const u of db.users) {
      assert.ok(u.axes, `${u.handle} に軸がない`);
      assert.ok(u.tags.length > 0, `${u.handle} にタグがない`);
    }
  });

  test("回答が実在のユーザーと問いに紐づいている", () => {
    const userIds = new Set(db.users.map((u) => u.id));
    const questionIds = new Set(DAILY_QUESTIONS.map((q) => q.id));
    for (const a of db.answers) {
      assert.ok(userIds.has(a.userId), `不明なユーザー ${a.userId}`);
      assert.ok(questionIds.has(a.questionId), `不明な問い ${a.questionId}`);
    }
  });

  test("同じ人が同じ問いに二重に答えていない", () => {
    const seen = new Set<string>();
    for (const a of db.answers) {
      const key = `${a.userId}:${a.questionId}`;
      assert.ok(!seen.has(key), `重複: ${key}`);
      seen.add(key);
    }
  });

  test("今日の問いに答えている人がいる（デモが空にならない）", () => {
    const todayId = questionForDate(new Date().toISOString().slice(0, 10)).id;
    const answered = db.answers.filter((a) => a.questionId === todayId);
    assert.ok(answered.length >= 2, `今日の問い(${todayId})の回答が ${answered.length} 件しかない`);
  });

  test("回答の日付が未来になっていない", () => {
    const now = Date.now();
    for (const a of db.answers) {
      assert.ok(Date.parse(a.createdAt) <= now + 86400000, `未来の回答: ${a.createdAt}`);
    }
  });
});
