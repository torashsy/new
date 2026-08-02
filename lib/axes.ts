import type { AxisId, Axes } from "./types";
import { AXIS_IDS } from "./types";

export type AxisDef = {
  id: AxisId;
  /** 0 側の極 */
  low: string;
  /** 100 側の極 */
  high: string;
  /**
   * 相性計算での扱い。
   * "similar"    近いほど良い（生活のリズムが噛み合う軸）
   * "tolerant"   違っても成立しうる（差の影響を弱く見る軸）
   */
  mode: "similar" | "tolerant";
  weight: number;
};

export const AXES: Record<AxisId, AxisDef> = {
  pace: { id: "pace", low: "ひとりの時間", high: "人といる時間", mode: "similar", weight: 1.2 },
  plan: { id: "plan", low: "即興", high: "計画", mode: "tolerant", weight: 0.8 },
  depth: { id: "depth", low: "広く浅く", high: "狭く深く", mode: "similar", weight: 1.2 },
  logic: { id: "logic", low: "感情", high: "論理", mode: "tolerant", weight: 0.8 },
  novelty: { id: "novelty", low: "定番", high: "新奇", mode: "similar", weight: 1.0 },
  expression: { id: "expression", low: "察し", high: "率直", mode: "tolerant", weight: 1.0 },
};

export type DiagnosticQuestion = {
  id: string;
  axis: AxisId;
  /** +1 なら「そう思う」が high 側、-1 なら low 側 */
  dir: 1 | -1;
  text: string;
};

/** 12問。1軸あたり2問で、方向を揃えずに配置して単調な回答を防ぐ。 */
export const DIAGNOSTIC: DiagnosticQuestion[] = [
  { id: "q1", axis: "pace", dir: -1, text: "予定のない休日は、誰かに会うより家にいたい" },
  { id: "q2", axis: "plan", dir: 1, text: "旅行の前に、行き先と時間をだいたい決めておきたい" },
  { id: "q3", axis: "depth", dir: 1, text: "友達は少なくていいから、深く付き合いたい" },
  { id: "q4", axis: "logic", dir: 1, text: "相談されたとき、まず解決策を考えてしまう" },
  { id: "q5", axis: "novelty", dir: -1, text: "初めての店より、いつもの店を選びがち" },
  { id: "q6", axis: "expression", dir: 1, text: "思っていることは、はっきり言うほうだ" },
  { id: "q7", axis: "pace", dir: 1, text: "人と話していると、だんだん元気になってくる" },
  { id: "q8", axis: "plan", dir: -1, text: "その日の気分で予定を変えるのは楽しい" },
  { id: "q9", axis: "depth", dir: -1, text: "いろんな人と広く関わっているほうが心地いい" },
  { id: "q10", axis: "logic", dir: -1, text: "決めるときは、条件より最後は気持ちで選ぶ" },
  { id: "q11", axis: "novelty", dir: 1, text: "やったことのないことを試すのが好きだ" },
  { id: "q12", axis: "expression", dir: -1, text: "言わずに察してもらえると、ほっとする" },
];

/** 5件法。1=まったく違う 〜 5=とてもそう */
export const SCALE = [
  { value: 1, label: "違う" },
  { value: 2, label: "どちらかといえば違う" },
  { value: 3, label: "どちらでもない" },
  { value: 4, label: "どちらかといえばそう" },
  { value: 5, label: "そう" },
] as const;

/**
 * 12問の回答（questionId -> 1..5）を 6軸 0-100 に変換する。
 * 未回答の軸は 50（中庸）に倒す。
 */
export function scoreDiagnostic(responses: Record<string, number>): Axes {
  const buckets: Record<AxisId, number[]> = {
    pace: [], plan: [], depth: [], logic: [], novelty: [], expression: [],
  };

  for (const q of DIAGNOSTIC) {
    const raw = responses[q.id];
    if (typeof raw !== "number") continue;
    const clamped = Math.min(5, Math.max(1, raw));
    // 1..5 -> -1..1、方向を掛ける
    buckets[q.axis].push(((clamped - 3) / 2) * q.dir);
  }

  const axes = {} as Axes;
  for (const id of AXIS_IDS) {
    const vals = buckets[id];
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    axes[id] = Math.round(((mean + 1) / 2) * 100);
  }
  return axes;
}

/** 軸の値を「ひとりの時間 寄り」のような読める文にする。 */
export function describeAxis(id: AxisId, value: number): string {
  const def = AXES[id];
  if (value >= 65) return `${def.high}寄り`;
  if (value <= 35) return `${def.low}寄り`;
  return "どちらも";
}
