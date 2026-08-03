import type { Answer, Introduction, User } from "./types";
import { matchScore } from "./score";
import { isMutuallyEligible } from "./eligibility";

/**
 * おまかせマッチのペアリング。
 *
 * 「もっと知りたい」を自分から送るのが、このアプリでいちばん勇気の要る行為。
 * それを肩代わりして、週に1人だけシステムが引き合わせる。
 */

/** その日が属する週の月曜日 (YYYY-MM-DD)。週の区切りは月曜。 */
export function weekStartOf(date: Date | string = new Date()): string {
  const d = new Date(typeof date === "string" ? `${date}T00:00:00Z` : date.toISOString().slice(0, 10) + "T00:00:00Z");
  // getUTCDay: 0=日曜。月曜を週の頭にしたいので日曜だけ6日戻す。
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function previousWeekStart(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** 何週ぶん遡って「最近すでに紹介した相手」を避けるか。 */
export const REINTRODUCE_AFTER_WEEKS = 8;

export type PairingInput = {
  users: User[];
  answers: Answer[];
  /** 双方向のブロック関係。 */
  blocks: { fromUserId: string; toUserId: string }[];
  /** 既存の紹介履歴（今週より前のもの）。 */
  history: Introduction[];
  /** すでに繋がっている相手同士は紹介しない。 */
  connections: { userIds: [string, string] }[];
  weekStart: string;
  now?: Date;
};

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/**
 * 週のペアを決める。
 *
 * 安定マッチングまではやらず、相性の高いペアから順に確定する貪欲法。
 * 理由は2つ。
 *  - 決定的で、結果を本人に説明できる（「相性がいちばん高い相手だった」で済む）
 *  - 全体最適より、一人ひとりが納得できることのほうが、この用途では重い
 *
 * 同点は id 順で割るので、同じ入力からは必ず同じペアが出る。
 */
export function pairForWeek(input: PairingInput): [string, string][] {
  const { users, answers, blocks, history, connections, weekStart, now = new Date() } = input;

  const hidden = new Set<string>();
  for (const b of blocks) hidden.add(pairKey(b.fromUserId, b.toUserId));
  for (const c of connections) hidden.add(pairKey(c.userIds[0], c.userIds[1]));

  // 直近で紹介済みの組は避ける。何度も同じ相手が出ると「またこの人か」になる。
  const cutoff = (() => {
    let w = weekStart;
    for (let i = 0; i < REINTRODUCE_AFTER_WEEKS; i++) w = previousWeekStart(w);
    return w;
  })();
  for (const intro of history) {
    if (intro.weekStart >= cutoff) hidden.add(pairKey(intro.userIds[0], intro.userIds[1]));
  }

  const candidates = users.filter((u) => u.axes);
  const answersOf = new Map<string, Answer[]>();
  for (const a of answers) {
    const list = answersOf.get(a.userId) ?? [];
    list.push(a);
    answersOf.set(a.userId, list);
  }
  const corpus = candidates.map((u) => u.tags);

  type Pair = { a: string; b: string; score: number };
  const pairs: Pair[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (hidden.has(pairKey(a.id, b.id))) continue;
      if (!isMutuallyEligible(a, b, now)) continue;

      const breakdown = matchScore(a, b, answersOf.get(a.id) ?? [], answersOf.get(b.id) ?? [], corpus);
      if (!breakdown) continue;
      const [x, y] = [a.id, b.id].sort();
      pairs.push({ a: x, b: y, score: breakdown.total });
    }
  }

  // 相性の高い順。同点は id 順で割って、結果を決定的にする。
  pairs.sort((p, q) => q.score - p.score || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));

  const taken = new Set<string>();
  const result: [string, string][] = [];
  for (const p of pairs) {
    if (taken.has(p.a) || taken.has(p.b)) continue;
    taken.add(p.a);
    taken.add(p.b);
    result.push([p.a, p.b]);
  }
  return result;
}

/**
 * 紹介の状態。
 *
 * 「相手が断った」は決して出さない。どちらが断っても同じ文言にする。
 * 断られたことが分かる作りは、このアプリが対象にしている人をいちばん傷つける。
 */
export type IntroductionState =
  | "pending" // まだ自分が答えていない
  | "waiting" // 自分は会いたい、相手の返事待ち
  | "matched" // 両方が会いたい
  | "closed" // どちらかが見送った（誰が、は出さない）
  | "declined"; // 自分が見送った

export function introductionState(intro: Introduction, userId: string): IntroductionState {
  const mine = intro.responses.find((r) => r.userId === userId);
  const theirs = intro.responses.find((r) => r.userId !== userId);

  if (mine?.answer === "no") return "declined";
  if (!mine) return "pending";
  if (theirs?.answer === "no") return "closed";
  if (theirs?.answer === "yes") return "matched";
  return "waiting";
}
