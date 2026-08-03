import { mutate, readDb, newId } from "./store";
import { HANDOFF_REQUIRED_EXCHANGES, CONTACT_LIMIT } from "./types";
import type { Exchange, Handoff } from "./types";

/**
 * 連絡先の受け渡し。このアプリの出口。
 *
 * 出口を作る理由:
 *  - 恋愛前提である以上、どこかで実際に会う必要がある。アプリの中だけでは終われない
 *  - 出口を作らないと、ユーザーは勝手に外部で連絡先を交換する。それなら
 *    「安全に一度だけ渡す」道をこちらで用意したほうがいい
 *  - 「顔をいつ見るか」もここで解ける。アプリの中は最後まで写真ゼロのまま、
 *    外に出た後は当人同士の自由。例外を1つ作ると原則が全部崩れるので作らない
 */

/** 両方が答えて開いた交換だけを数える。片方だけのものは進んだうちに入らない。 */
export const openedCount = (exchanges: Exchange[]): number =>
  exchanges.filter((e) => e.answers.length === 2).length;

export const canHandoff = (exchanges: Exchange[]): boolean =>
  openedCount(exchanges) >= HANDOFF_REQUIRED_EXCHANGES;

export type HandoffView = {
  /** まだ渡せる段階にない場合、あと何回開けばいいか。 */
  remaining: number;
  handoff: Handoff | null;
  mine: string | null;
  /** 自分が入れるまで相手のものは見えない。 */
  theirs: string | null;
};

export async function handoffFor(
  connectionId: string,
  userId: string,
  exchanges: Exchange[],
): Promise<HandoffView> {
  const db = await readDb();
  const handoff = db.handoffs.find((h) => h.connectionId === connectionId) ?? null;
  const mine = handoff?.entries.find((e) => e.userId === userId)?.contact ?? null;
  const theirsEntry = handoff?.entries.find((e) => e.userId !== userId) ?? null;

  return {
    remaining: Math.max(0, HANDOFF_REQUIRED_EXCHANGES - openedCount(exchanges)),
    handoff,
    mine,
    // 自分が渡すまで、相手のものは見えない。日々の問いと同じ構造。
    theirs: mine && theirsEntry ? theirsEntry.contact : null,
  };
}

/**
 * 連絡先を預ける。一度預けたら取り消せない。
 * 取り消せる作りにすると「渡したのに消えた」が起きて、相手を宙ぶらりんにする。
 */
export async function offerContact(
  connectionId: string,
  userId: string,
  contact: string,
): Promise<void> {
  const trimmed = contact.trim().slice(0, CONTACT_LIMIT);
  if (!trimmed) return;

  await mutate((db) => {
    const connection = db.connections.find((c) => c.id === connectionId);
    if (!connection || !connection.userIds.includes(userId)) return;

    // 渡せる段階に達しているかは、サーバ側でも確かめる
    const exchanges = db.exchanges.filter((e) => e.connectionId === connectionId);
    if (!canHandoff(exchanges)) return;

    let handoff = db.handoffs.find((h) => h.connectionId === connectionId);
    if (!handoff) {
      handoff = {
        id: newId("hof"),
        connectionId,
        entries: [],
        createdAt: new Date().toISOString(),
      };
      db.handoffs.push(handoff);
    }
    if (handoff.entries.some((e) => e.userId === userId)) return; // 上書きさせない
    handoff.entries.push({ userId, contact: trimmed, createdAt: new Date().toISOString() });
  });
}

/** デモ用: 相手が連絡先を預けた状態にする。 */
export async function simulateContactOffer(
  connectionId: string,
  userId: string,
  contact: string,
): Promise<void> {
  await offerContact(connectionId, userId, contact);
}
