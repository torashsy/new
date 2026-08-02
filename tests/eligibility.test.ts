import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ineligibilityReason, isMutuallyEligible, narrowingSummary } from "../lib/eligibility";
import type { Axes, Gender, User } from "../lib/types";
import { DEFAULT_PREFERENCE } from "../lib/types";

const NOW = new Date("2026-08-02T00:00:00Z");
const axes: Axes = { pace: 50, plan: 50, depth: 50, logic: 50, novelty: 50, expression: 50 };

function user(
  id: string,
  age: number,
  gender: Gender,
  region: string,
  preference: Partial<User["preference"]> = {},
): User {
  return {
    id,
    handle: id,
    bio: "",
    axes,
    tags: [],
    birthYear: NOW.getFullYear() - age,
    gender,
    region,
    preference: { ...DEFAULT_PREFERENCE, ...preference },
    createdAt: "",
  };
}

describe("条件の突き合わせ", () => {
  test("双方の条件を満たせば通る", () => {
    const a = user("a", 27, "female", "東京都", { genders: ["male"], ageMin: 25, ageMax: 35 });
    const b = user("b", 30, "male", "東京都", { genders: ["female"], ageMin: 24, ageMax: 32 });
    assert.equal(ineligibilityReason(a, b, NOW), null);
    assert.ok(isMutuallyEligible(a, b, NOW));
  });

  test("相手が自分を候補にしていなければ通らない（片側だけでは不十分）", () => {
    const a = user("a", 27, "female", "東京都", { genders: ["male"], ageMin: 25, ageMax: 40 });
    // b は年下しか見ていない
    const b = user("b", 30, "male", "東京都", { genders: ["female"], ageMin: 20, ageMax: 25 });
    assert.equal(ineligibilityReason(a, b, NOW), "age");
    assert.ok(!isMutuallyEligible(a, b, NOW));
  });

  test("性別が合わなければ通らない", () => {
    const a = user("a", 27, "female", "東京都", { genders: ["female"] });
    const b = user("b", 30, "male", "東京都", { genders: ["female"] });
    assert.equal(ineligibilityReason(a, b, NOW), "gender");
  });

  test("自分の年齢が相手の範囲外でも通らない", () => {
    const a = user("a", 45, "female", "東京都", { genders: ["male"], ageMin: 25, ageMax: 50 });
    const b = user("b", 30, "male", "東京都", { genders: ["female"], ageMin: 24, ageMax: 32 });
    assert.equal(ineligibilityReason(a, b, NOW), "age");
  });

  test("どちらかが同一都道府県のみなら、違う県とは通らない", () => {
    const a = user("a", 27, "female", "大阪府", { genders: ["male"], regionScope: "same" });
    const b = user("b", 30, "male", "東京都", { genders: ["female"] });
    assert.equal(ineligibilityReason(a, b, NOW), "region");

    const c = user("c", 30, "male", "大阪府", { genders: ["female"] });
    assert.equal(ineligibilityReason(a, c, NOW), null);
  });

  test("境界の年齢は含む", () => {
    const a = user("a", 27, "female", "東京都", { genders: ["male"], ageMin: 30, ageMax: 30 });
    const b = user("b", 30, "male", "東京都", { genders: ["female"], ageMin: 27, ageMax: 27 });
    assert.equal(ineligibilityReason(a, b, NOW), null);
  });

  test("属性が埋まっていなければ incomplete", () => {
    const a = user("a", 27, "female", "東京都");
    const b = { ...user("b", 30, "male", "東京都"), region: null };
    assert.equal(ineligibilityReason(a, b, NOW), "incomplete");
  });

  test("診断が済んでいなければ incomplete", () => {
    const a = user("a", 27, "female", "東京都");
    const b = { ...user("b", 30, "male", "東京都"), axes: null };
    assert.equal(ineligibilityReason(a, b, NOW), "incomplete");
  });

  test("落ちた理由を数えられる", () => {
    const me = user("me", 27, "female", "東京都", { genders: ["male"], ageMin: 25, ageMax: 32 });
    const others = [
      user("ok", 30, "male", "東京都", { genders: ["female"], ageMin: 20, ageMax: 40 }),
      user("g", 28, "female", "東京都", { genders: ["male"], ageMin: 20, ageMax: 40 }),
      user("a1", 50, "male", "東京都", { genders: ["female"], ageMin: 20, ageMax: 60 }),
      user("r", 29, "male", "大阪府", { genders: ["female"], ageMin: 20, ageMax: 40, regionScope: "same" }),
    ];
    const counts = narrowingSummary(me, others, NOW);
    assert.equal(counts.gender, 1);
    assert.equal(counts.age, 1);
    assert.equal(counts.region, 1);
  });
});
