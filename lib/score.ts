import type { Answer, Axes, User } from "./types";
import { AXES } from "./axes";
import { AXIS_IDS } from "./types";

/**
 * 相性の内訳。
 * 「なぜこの人が出てきたか」を必ず本人に説明できるようにするため、
 * 合計値だけでなく内訳を返す。ブラックボックスにしない。
 */
export type MatchBreakdown = {
  total: number; // 0-100
  axis: number; // 0-100
  tags: number; // 0-100
  answers: number; // 0-100
  sharedTags: string[];
  /** 特に近い軸（説明文に使う） */
  closestAxes: { id: string; label: string; diff: number }[];
  sharedQuestionCount: number;
};

const WEIGHTS = { axis: 0.55, tags: 0.3, answers: 0.15 };

/** 軸の近さ。similar は差をそのまま、tolerant は差の影響を半分にする。 */
export function axisAffinity(a: Axes, b: Axes): number {
  let sum = 0;
  let weightSum = 0;
  for (const id of AXIS_IDS) {
    const def = AXES[id];
    const diff = Math.abs(a[id] - b[id]) / 100;
    const penalty = def.mode === "similar" ? diff : diff * 0.5;
    sum += (1 - penalty) * def.weight;
    weightSum += def.weight;
  }
  return (sum / weightSum) * 100;
}

/**
 * タグの重なり。よくあるタグより珍しいタグの一致を重く見る。
 * corpus は全ユーザーのタグ配列（出現回数を数えるため）。
 */
export function tagAffinity(a: string[], b: string[], corpus: string[][]): { score: number; shared: string[] } {
  const shared = a.filter((t) => b.includes(t));
  if (!a.length || !b.length) return { score: 0, shared: [] };

  const docCount = Math.max(corpus.length, 1);
  const freq = new Map<string, number>();
  for (const tags of corpus) {
    for (const t of new Set(tags)) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  // 珍しいタグほど重い（idf）
  const idf = (t: string) => Math.log((docCount + 1) / ((freq.get(t) ?? 0) + 1)) + 1;

  const sharedWeight = shared.reduce((s, t) => s + idf(t), 0);
  const unionWeight = [...new Set([...a, ...b])].reduce((s, t) => s + idf(t), 0);
  const score = unionWeight ? (sharedWeight / unionWeight) * 100 : 0;
  // 重なりが1つでもあれば下限を持たせる（0 と 1 の差を効かせる）
  return { score: shared.length ? Math.max(score, 12) : 0, shared };
}

/** 日本語を形態素解析なしで比べるため、文字バイグラムの重なりを使う。 */
function bigrams(text: string): Set<string> {
  const s = text.replace(/[\s、。！？!?，．,.]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * 同じ問いに答えた回数と、その答えの言葉の重なり。
 * 意味を理解しているわけではないので、重みは意図的に小さくしてある。
 */
export function answerAffinity(
  mine: Answer[],
  theirs: Answer[],
): { score: number; sharedQuestionCount: number } {
  const byQuestion = new Map<string, Answer>();
  for (const a of theirs) byQuestion.set(a.questionId, a);

  const pairs: number[] = [];
  for (const a of mine) {
    const b = byQuestion.get(a.questionId);
    if (b) pairs.push(jaccard(bigrams(a.body), bigrams(b.body)));
  }
  if (!pairs.length) return { score: 0, sharedQuestionCount: 0 };

  const lexical = pairs.reduce((s, v) => s + v, 0) / pairs.length;
  // 同じ問いに向き合った回数そのものも、continuity の signal として効かせる
  const continuity = Math.min(pairs.length / 5, 1);
  return { score: (lexical * 0.6 + continuity * 0.4) * 100, sharedQuestionCount: pairs.length };
}

export function matchScore(
  me: User,
  other: User,
  myAnswers: Answer[],
  theirAnswers: Answer[],
  tagCorpus: string[][],
): MatchBreakdown | null {
  if (!me.axes || !other.axes) return null;

  const axis = axisAffinity(me.axes, other.axes);
  const { score: tags, shared: sharedTags } = tagAffinity(me.tags, other.tags, tagCorpus);
  const { score: answers, sharedQuestionCount } = answerAffinity(myAnswers, theirAnswers);

  const total = axis * WEIGHTS.axis + tags * WEIGHTS.tags + answers * WEIGHTS.answers;

  const closestAxes = AXIS_IDS.map((id) => ({
    id,
    label: `${AXES[id].low}⇔${AXES[id].high}`,
    diff: Math.abs(me.axes![id] - other.axes![id]),
  }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 2);

  return {
    total: Math.round(total),
    axis: Math.round(axis),
    tags: Math.round(tags),
    answers: Math.round(answers),
    sharedTags,
    closestAxes,
    sharedQuestionCount,
  };
}

/** 相性の理由を日本語一文にする。UI で必ず出す。 */
export function explain(b: MatchBreakdown): string {
  const parts: string[] = [];
  if (b.sharedTags.length) parts.push(`${b.sharedTags.slice(0, 2).map((t) => `#${t}`).join("・")}が同じ`);
  if (b.closestAxes[0] && b.closestAxes[0].diff <= 20) parts.push(`「${b.closestAxes[0].label}」の感覚が近い`);
  if (b.sharedQuestionCount >= 2) parts.push(`同じ問いに${b.sharedQuestionCount}回答えている`);
  return parts.length ? parts.join("、") : "まだ手がかりが少ない";
}
