/**
 * ドメインの型。
 *
 * 【この設計の絶対条件】
 * このファイルに画像を表す型は存在しない。存在させない。
 * 顔写真どころか、あらゆる画像アップロードの経路を作らない。
 * アバターは診断結果から決定的に生成される図形（lib/shape.ts）で、
 * ユーザーが差し替えることはできない。
 */

export const AXIS_IDS = ["pace", "plan", "depth", "logic", "novelty", "expression"] as const;
export type AxisId = (typeof AXIS_IDS)[number];

/** 各軸 0-100。50 が中庸。 */
export type Axes = Record<AxisId, number>;

export type User = {
  id: string;
  /** 表示名。本名を求めない。 */
  handle: string;
  /** 一行の自己紹介。140字まで。 */
  bio: string;
  /** 診断が済んでいなければ null。済むまで他人に表示されない。 */
  axes: Axes | null;
  /** ハッシュタグ（# は含めない）。 */
  tags: string[];
  createdAt: string;
};

/** 全員に同じ問いを出す。1日1問。 */
export type DailyQuestion = {
  /** YYYY-MM-DD。この日付の問いは全ユーザー共通。 */
  date: string;
  id: string;
  text: string;
};

export type Answer = {
  id: string;
  userId: string;
  questionId: string;
  /** 140字まで。 */
  body: string;
  createdAt: string;
};

/** 一方向の「もっと知りたい」。相互になると connection が成立する。 */
export type Interest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
};

export type Connection = {
  id: string;
  /** 常に userId の昇順で保持する。 */
  userIds: [string, string];
  createdAt: string;
};

/**
 * お題交換。チャットではない。
 * 片方がデッキから札を選ぶ → 二人とも同じ問いに答える → 両方が答えたら開示。
 * 相手の答えを見てから自分の答えを書くことはできない。
 */
export type Exchange = {
  id: string;
  connectionId: string;
  promptId: string;
  promptText: string;
  openedBy: string;
  answers: { userId: string; body: string; createdAt: string }[];
  createdAt: string;
};

/**
 * ブロック。相手からは自分が、自分からは相手が、あらゆる画面で見えなくなる。
 * ブロックしたことは相手に知らされない。
 */
export type Block = {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
};

export const REPORT_REASONS = [
  "attack", // 攻撃的・侮辱的
  "sexual", // 性的な内容
  "commercial", // 勧誘・宣伝
  "impersonation", // なりすまし
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  attack: "攻撃的・侮辱的な内容",
  sexual: "性的な内容",
  commercial: "勧誘・宣伝",
  impersonation: "なりすまし",
  other: "その他",
};

export type Report = {
  id: string;
  fromUserId: string;
  toUserId: string;
  reason: ReportReason;
  /** 対象の回答や交換があれば記録する。 */
  contextId: string | null;
  note: string;
  createdAt: string;
};

export type Database = {
  users: User[];
  answers: Answer[];
  interests: Interest[];
  connections: Connection[];
  exchanges: Exchange[];
  blocks: Block[];
  reports: Report[];
};

export const emptyDatabase = (): Database => ({
  users: [],
  answers: [],
  interests: [],
  connections: [],
  exchanges: [],
  blocks: [],
  reports: [],
});
