import type { User } from "./types";
import { ageOf, isProfileComplete } from "./types";

/**
 * 条件が「双方向で」合っているか。
 *
 * 片側だけ合っていれば出す作りにすると、望まない相手からの接触が止まらない。
 * 自分が相手を候補に入れていて、かつ相手も自分を候補に入れているときだけ、
 * お互いの画面に出る。
 */
export type Ineligibility = "incomplete" | "gender" | "age" | "region" | null;

export function ineligibilityReason(me: User, other: User, now = new Date()): Ineligibility {
  if (!isProfileComplete(me) || !isProfileComplete(other)) return "incomplete";

  if (!me.preference.genders.includes(other.gender!)) return "gender";
  if (!other.preference.genders.includes(me.gender!)) return "gender";

  const myAge = ageOf(me.birthYear, now)!;
  const theirAge = ageOf(other.birthYear, now)!;
  if (theirAge < me.preference.ageMin || theirAge > me.preference.ageMax) return "age";
  if (myAge < other.preference.ageMin || myAge > other.preference.ageMax) return "age";

  const sameRegion = me.region === other.region;
  if (me.preference.regionScope === "same" && !sameRegion) return "region";
  if (other.preference.regionScope === "same" && !sameRegion) return "region";

  return null;
}

export const isMutuallyEligible = (me: User, other: User, now = new Date()): boolean =>
  ineligibilityReason(me, other, now) === null;

/** 候補が0件のときに、何が効きすぎているのかを本人に伝えるための集計。 */
export function narrowingSummary(me: User, others: User[], now = new Date()) {
  const counts: Record<Exclude<Ineligibility, null>, number> = {
    incomplete: 0, gender: 0, age: 0, region: 0,
  };
  for (const other of others) {
    if (other.id === me.id) continue;
    const reason = ineligibilityReason(me, other, now);
    if (reason) counts[reason]++;
  }
  return counts;
}
