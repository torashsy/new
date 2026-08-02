import { readDb } from "./store";
import { DAILY_QUESTIONS, questionForDate, today } from "./questions";
import { matchScore, type MatchBreakdown } from "./score";
import type { Answer, Connection, Exchange, User } from "./types";
import { MAX_INTERESTS_PER_DAY } from "./limits";
import { DEMO_USER_ID } from "./seed";

export type Candidate = { user: User; breakdown: MatchBreakdown; latestAnswer: Answer | null; latestQuestionText: string | null };

export async function getMe(): Promise<User> {
  const db = await readDb();
  const me = db.users.find((u) => u.id === DEMO_USER_ID);
  if (!me) throw new Error("デモユーザーが見つからない。.data/db.json を消して作り直してください。");
  return me;
}

export async function getUserByHandle(handle: string): Promise<User | null> {
  const db = await readDb();
  return db.users.find((u) => u.handle === handle) ?? null;
}

export async function answersOf(userId: string): Promise<Answer[]> {
  const db = await readDb();
  return db.answers
    .filter((a) => a.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 今日の問いに対する自分の回答。まだなら null。 */
export async function myAnswerToday(userId: string): Promise<Answer | null> {
  const db = await readDb();
  const q = questionForDate(today());
  return db.answers.find((a) => a.userId === userId && a.questionId === q.id) ?? null;
}

/**
 * 今日の問いへの他人の回答。
 * 自分が答えるまでは見られない（先に人の答えを読んでから書けてしまうと、
 * 上手い答えを真似る競争になってしまうため）。
 */
export async function todayFeed(userId: string): Promise<Answer[] | null> {
  const db = await readDb();
  const q = questionForDate(today());
  const mine = db.answers.find((a) => a.userId === userId && a.questionId === q.id);
  if (!mine) return null;
  const hidden = await hiddenUserIds(userId);
  return db.answers
    .filter((a) => a.questionId === q.id && a.userId !== userId && !hidden.has(a.userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 自分がブロックした相手と、自分をブロックした相手。どちらも互いに見えなくする。 */
export async function hiddenUserIds(userId: string): Promise<Set<string>> {
  const db = await readDb();
  const hidden = new Set<string>();
  for (const b of db.blocks) {
    if (b.fromUserId === userId) hidden.add(b.toUserId);
    if (b.toUserId === userId) hidden.add(b.fromUserId);
  }
  return hidden;
}

export async function isBlockedByMe(userId: string, otherId: string): Promise<boolean> {
  const db = await readDb();
  return db.blocks.some((b) => b.fromUserId === userId && b.toUserId === otherId);
}

/** 今日すでに送った「もっと知りたい」の数と残り。 */
export async function interestBudget(userId: string): Promise<{ used: number; left: number }> {
  const db = await readDb();
  const day = new Date().toISOString().slice(0, 10);
  const used = db.interests.filter((i) => i.fromUserId === userId && i.createdAt.slice(0, 10) === day).length;
  return { used, left: Math.max(0, MAX_INTERESTS_PER_DAY - used) };
}

export async function userMap(): Promise<Map<string, User>> {
  const db = await readDb();
  return new Map(db.users.map((u) => [u.id, u]));
}

const questionTextById = (id: string): string | null =>
  DAILY_QUESTIONS.find((q) => q.id === id)?.text ?? null;

/** 相性順の候補。すでに接続済みの相手と、興味を送った相手は除く。 */
export async function discover(userId: string, limit = 8): Promise<Candidate[]> {
  const db = await readDb();
  const me = db.users.find((u) => u.id === userId);
  if (!me?.axes) return [];

  const connectedIds = new Set(
    db.connections.filter((c) => c.userIds.includes(userId)).flatMap((c) => c.userIds),
  );
  const sentIds = new Set(db.interests.filter((i) => i.fromUserId === userId).map((i) => i.toUserId));
  const hidden = await hiddenUserIds(userId);

  const corpus = db.users.filter((u) => u.axes).map((u) => u.tags);
  const myAnswers = db.answers.filter((a) => a.userId === userId);

  const candidates: Candidate[] = [];
  for (const other of db.users) {
    if (other.id === userId || !other.axes) continue;
    if (connectedIds.has(other.id) || sentIds.has(other.id)) continue;
    if (hidden.has(other.id)) continue;

    const theirAnswers = db.answers
      .filter((a) => a.userId === other.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const breakdown = matchScore(me, other, myAnswers, theirAnswers, corpus);
    if (!breakdown) continue;

    const latestAnswer = theirAnswers[0] ?? null;
    candidates.push({
      user: other,
      breakdown,
      latestAnswer,
      latestQuestionText: latestAnswer ? questionTextById(latestAnswer.questionId) : null,
    });
  }

  return candidates.sort((a, b) => b.breakdown.total - a.breakdown.total).slice(0, limit);
}

export async function connectionsOf(userId: string): Promise<{ connection: Connection; other: User; exchanges: Exchange[] }[]> {
  const db = await readDb();
  const users = new Map(db.users.map((u) => [u.id, u]));
  const hidden = await hiddenUserIds(userId);
  return db.connections
    .filter((c) => c.userIds.includes(userId))
    .map((connection) => {
      const otherId = connection.userIds.find((id) => id !== userId)!;
      return {
        connection,
        other: users.get(otherId)!,
        exchanges: db.exchanges
          .filter((e) => e.connectionId === connection.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    })
    .filter((c) => c.other && !hidden.has(c.other.id));
}

export async function getExchange(id: string): Promise<{ exchange: Exchange; other: User; me: User } | null> {
  const db = await readDb();
  const exchange = db.exchanges.find((e) => e.id === id);
  if (!exchange) return null;
  const connection = db.connections.find((c) => c.id === exchange.connectionId);
  if (!connection || !connection.userIds.includes(DEMO_USER_ID)) return null;
  const otherId = connection.userIds.find((u) => u !== DEMO_USER_ID)!;
  const users = new Map(db.users.map((u) => [u.id, u]));
  return { exchange, other: users.get(otherId)!, me: users.get(DEMO_USER_ID)! };
}

/** 自分に興味を送ってきている人（まだ相互ではない）。 */
export async function incomingInterest(userId: string): Promise<User[]> {
  const db = await readDb();
  const sent = new Set(db.interests.filter((i) => i.fromUserId === userId).map((i) => i.toUserId));
  const hidden = await hiddenUserIds(userId);
  const users = new Map(db.users.map((u) => [u.id, u]));
  return db.interests
    .filter((i) => i.toUserId === userId && !sent.has(i.fromUserId) && !hidden.has(i.fromUserId))
    .map((i) => users.get(i.fromUserId))
    .filter((u): u is User => Boolean(u));
}
