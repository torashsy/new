import { mutate, newId } from "./store";
import { pairForWeek, weekStartOf } from "./weekly";
import type { Connection, Introduction } from "./types";

/**
 * その週の紹介を用意する。冪等。
 *
 * 本来は週の頭に走らせるジョブだが、いまは誰かが画面を開いたときに
 * 「まだ無ければ作る」形にしてある。ジョブ基盤を持たずに済むのと、
 * ペアリングが決定的なので何度呼んでも同じ結果になるため。
 */
export async function ensureIntroductions(weekStart = weekStartOf()): Promise<void> {
  await mutate((db) => {
    if (db.introductions.some((i) => i.weekStart === weekStart)) return;

    const pairs = pairForWeek({
      users: db.users,
      answers: db.answers,
      blocks: db.blocks,
      history: db.introductions.filter((i) => i.weekStart < weekStart),
      connections: db.connections,
      weekStart,
    });

    for (const [a, b] of pairs) {
      db.introductions.push({
        id: newId("int"),
        weekStart,
        userIds: [a, b] as [string, string],
        responses: [],
        createdAt: new Date().toISOString(),
      });
    }
  });
}

/**
 * 紹介への返事。両方が「会ってみたい」ならつながりが成立する。
 * 見送った場合、そのことは相手に伝わらない。
 */
export async function respondToIntroduction(
  introductionId: string,
  userId: string,
  answer: "yes" | "no",
): Promise<{ matched: boolean }> {
  return mutate((db) => {
    const intro = db.introductions.find((i) => i.id === introductionId);
    if (!intro || !intro.userIds.includes(userId)) return { matched: false };

    const existing = intro.responses.find((r) => r.userId === userId);
    if (existing) {
      // 見送りは取り消せない。取り消せると「やっぱり」が起きて、相手を待たせる。
      if (existing.answer === "no") return { matched: false };
      existing.answer = answer;
      existing.createdAt = new Date().toISOString();
    } else {
      intro.responses.push({ userId, answer, createdAt: new Date().toISOString() });
    }

    const bothYes =
      intro.responses.length === 2 && intro.responses.every((r) => r.answer === "yes");
    if (!bothYes) return { matched: false };

    const pair = [...intro.userIds].sort() as [string, string];
    const already = db.connections.some(
      (c) => c.userIds[0] === pair[0] && c.userIds[1] === pair[1],
    );
    if (!already) {
      const connection: Connection = {
        id: newId("con"),
        userIds: pair,
        createdAt: new Date().toISOString(),
      };
      db.connections.push(connection);
    }
    return { matched: true };
  });
}

/** デモ用: 相手の返事を手元で再現する。 */
export async function simulateIntroductionReply(
  introductionId: string,
  otherUserId: string,
  answer: "yes" | "no",
): Promise<void> {
  await respondToIntroduction(introductionId, otherUserId, answer);
}

export type { Introduction };
