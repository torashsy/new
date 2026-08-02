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

export const GENDERS = ["female", "male", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  female: "女性",
  male: "男性",
  other: "その他・答えない",
};

/**
 * 相手に求める条件。
 *
 * 恋愛前提のアプリなので、性別・年齢・地域は絞り込みに使う。
 * ただし絞れるのはここまでで、これ以外の条件検索は作らない。
 * 「条件で人を絞る」ことと「顔とトークで人を選ぶ」ことは別の問題なので、
 * 前者は認めて、後者だけを潰す。
 */
export type Preference = {
  genders: Gender[];
  ageMin: number;
  ageMax: number;
  /** "same" = 同じ都道府県のみ / "any" = どこでも */
  regionScope: "same" | "any";
};

export const DEFAULT_PREFERENCE: Preference = {
  genders: ["female", "male", "other"],
  ageMin: 20,
  ageMax: 45,
  regionScope: "any",
};

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

  /** 生年月日は持たず、生年だけ。日付まで要る場面がない。 */
  birthYear: number | null;
  gender: Gender | null;
  /** 都道府県。市区町村までは持たない（特定に繋がるため）。 */
  region: string | null;
  preference: Preference;

  createdAt: string;
};

/** 誕生日を持たないので、年齢は「その年に迎える歳」で近似する。 */
export function ageOf(birthYear: number | null, now = new Date()): number | null {
  if (!birthYear) return null;
  return now.getFullYear() - birthYear;
}

/** 属性が埋まっていて、相手に表示できる状態か。 */
export function isProfileComplete(user: User): boolean {
  return Boolean(user.axes && user.birthYear && user.gender && user.region);
}

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

/**
 * パスキー（WebAuthn）の公開鍵。
 * パスワードは持たない。ハッシュも含めて、秘密を預からない。
 */
export type Credential = {
  /** base64url のクレデンシャルID */
  id: string;
  userId: string;
  /** base64url の公開鍵 */
  publicKey: string;
  counter: number;
  transports: string[];
  /** 端末の見分けがつくように、登録時のラベルを持つ */
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

/** 登録・認証の途中で使う一時的な値。使ったら消す。 */
export type Challenge = {
  id: string;
  value: string;
  /** 新規登録の途中なら、まだ確定していないハンドル */
  pendingHandle: string | null;
  userId: string | null;
  expiresAt: string;
};

export type Database = {
  users: User[];
  credentials: Credential[];
  challenges: Challenge[];
  answers: Answer[];
  interests: Interest[];
  connections: Connection[];
  exchanges: Exchange[];
  blocks: Block[];
  reports: Report[];
};

export const emptyDatabase = (): Database => ({
  users: [],
  credentials: [],
  challenges: [],
  answers: [],
  interests: [],
  connections: [],
  exchanges: [],
  blocks: [],
  reports: [],
});
