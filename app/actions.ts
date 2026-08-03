"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mutate, newId } from "@/lib/store";
import { questionForDate, today, EXCHANGE_PROMPTS } from "@/lib/questions";
import { scoreDiagnostic } from "@/lib/axes";
import { currentUserId, clearSession } from "@/lib/session";
import { respondToIntroduction, simulateIntroductionReply } from "@/lib/introductions";
import { offerContact, simulateContactOffer } from "@/lib/handoff";

/** ログインしていなければ操作させない。 */
async function viewerId(): Promise<string> {
  const id = await currentUserId();
  if (!id) redirect("/signin");
  return id;
}
import type { Connection, Gender, ReportReason } from "@/lib/types";
import { REPORT_REASONS, GENDERS } from "@/lib/types";
import { isRegion } from "@/lib/regions";
import { ANSWER_LIMIT, BIO_LIMIT, MAX_TAGS, MAX_INTERESTS_PER_DAY } from "@/lib/limits";
import { DEFAULT_PREFERENCE } from "@/lib/types";

export async function submitAnswer(formData: FormData) {
  const viewer = await viewerId();
  const body = String(formData.get("body") ?? "").trim().slice(0, ANSWER_LIMIT);
  if (!body) return;
  const q = questionForDate(today());

  await mutate((db) => {
    const existing = db.answers.find((a) => a.userId === viewer && a.questionId === q.id);
    if (existing) {
      existing.body = body;
      return;
    }
    db.answers.push({
      id: newId("ans"),
      userId: viewer,
      questionId: q.id,
      body,
      createdAt: new Date().toISOString(),
    });
  });

  revalidatePath("/");
  revalidatePath("/discover");
}

export async function saveDiagnostic(formData: FormData) {
  const viewer = await viewerId();
  const responses: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("q")) responses[key] = Number(value);
  }
  const axes = scoreDiagnostic(responses);

  await mutate((db) => {
    const me = db.users.find((u) => u.id === viewer);
    if (me) me.axes = axes;
  });

  revalidatePath("/", "layout");
  redirect("/profile");
}

export async function saveProfile(formData: FormData) {
  const viewer = await viewerId();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, BIO_LIMIT);
  const tags = String(formData.get("tags") ?? "")
    .split(/[\s,、]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS);

  const rawYear = Number(formData.get("birthYear"));
  const thisYear = new Date().getFullYear();
  // 18歳未満は登録できない
  const birthYear =
    Number.isFinite(rawYear) && thisYear - rawYear >= 18 && thisYear - rawYear <= 80 ? rawYear : null;

  const rawGender = String(formData.get("gender") ?? "");
  const gender = GENDERS.includes(rawGender as Gender) ? (rawGender as Gender) : null;

  const rawRegion = String(formData.get("region") ?? "");
  const region = isRegion(rawRegion) ? rawRegion : null;

  const prefGenders = formData
    .getAll("prefGenders")
    .map(String)
    .filter((g): g is Gender => GENDERS.includes(g as Gender));

  // 下限と上限が逆に入っていても壊れないよう並べ替える
  const bounds = [Number(formData.get("ageMin")), Number(formData.get("ageMax"))]
    .map((n) => (Number.isFinite(n) ? Math.min(80, Math.max(18, n)) : null));
  const [ageMin, ageMax] = bounds.every((n) => n !== null)
    ? [Math.min(bounds[0]!, bounds[1]!), Math.max(bounds[0]!, bounds[1]!)]
    : [DEFAULT_PREFERENCE.ageMin, DEFAULT_PREFERENCE.ageMax];

  const regionScope = formData.get("regionScope") === "same" ? "same" : "any";

  await mutate((db) => {
    const me = db.users.find((u) => u.id === viewer);
    if (!me) return;
    me.bio = bio;
    me.tags = [...new Set(tags)];
    if (birthYear) me.birthYear = birthYear;
    if (gender) me.gender = gender;
    if (region) me.region = region;
    me.preference = {
      // 空で保存されると誰も出てこなくなるので、その場合は既定に戻す
      genders: prefGenders.length ? prefGenders : DEFAULT_PREFERENCE.genders,
      ageMin,
      ageMax,
      regionScope,
    };
  });

  revalidatePath("/", "layout");
  redirect("/discover");
}

/**
 * 「もっと知りたい」を送る。相互になった時点で接続が成立する。
 * 送った事実は相手に通知されない（送り返されるまで relationship は始まらない）。
 */
export async function sendInterest(formData: FormData) {
  const viewer = await viewerId();
  const toUserId = String(formData.get("toUserId") ?? "");
  if (!toUserId || toUserId === viewer) return;

  const connectionId = await mutate((db): string | null => {
    // ブロックしている / されている相手には送れない
    const blocked = db.blocks.some(
      (b) =>
        (b.fromUserId === viewer && b.toUserId === toUserId) ||
        (b.fromUserId === toUserId && b.toUserId === viewer),
    );
    if (blocked) return null;

    const already = db.interests.find((i) => i.fromUserId === viewer && i.toUserId === toUserId);
    if (!already) {
      const day = new Date().toISOString().slice(0, 10);
      const sentToday = db.interests.filter(
        (i) => i.fromUserId === viewer && i.createdAt.slice(0, 10) === day,
      ).length;
      if (sentToday >= MAX_INTERESTS_PER_DAY) return null;

      db.interests.push({
        id: newId("int"),
        fromUserId: viewer,
        toUserId,
        createdAt: new Date().toISOString(),
      });
    }

    const reciprocal = db.interests.find((i) => i.fromUserId === toUserId && i.toUserId === viewer);
    if (!reciprocal) return null;

    const pair = [viewer, toUserId].sort() as [string, string];
    const existing = db.connections.find((c) => c.userIds[0] === pair[0] && c.userIds[1] === pair[1]);
    if (existing) return existing.id;

    const connection: Connection = {
      id: newId("con"),
      userIds: pair,
      createdAt: new Date().toISOString(),
    };
    db.connections.push(connection);
    return connection.id;
  });

  revalidatePath("/discover");
  revalidatePath("/connections");
  if (connectionId) redirect("/connections");
}

/** デモ用: 相手からの「もっと知りたい」を発生させて相互成立を試せるようにする。 */
export async function simulateInterestFrom(formData: FormData) {
  const viewer = await viewerId();
  const fromUserId = String(formData.get("fromUserId") ?? "");
  if (!fromUserId) return;
  await mutate((db) => {
    const already = db.interests.find((i) => i.fromUserId === fromUserId && i.toUserId === viewer);
    if (already) return;
    db.interests.push({
      id: newId("int"),
      fromUserId,
      toUserId: viewer,
      createdAt: new Date().toISOString(),
    });
  });
  revalidatePath("/discover");
}

export async function openExchange(formData: FormData) {
  const viewer = await viewerId();
  const connectionId = String(formData.get("connectionId") ?? "");
  const promptId = String(formData.get("promptId") ?? "");
  const prompt = EXCHANGE_PROMPTS.find((p) => p.id === promptId);
  if (!connectionId || !prompt) return;

  const id = await mutate((db) => {
    const exchangeId = newId("exc");
    db.exchanges.push({
      id: exchangeId,
      connectionId,
      promptId: prompt.id,
      promptText: prompt.text,
      openedBy: viewer,
      answers: [],
      createdAt: new Date().toISOString(),
    });
    return exchangeId;
  });

  revalidatePath("/connections");
  redirect(`/exchange/${id}`);
}

export async function answerExchange(formData: FormData) {
  const viewer = await viewerId();
  const exchangeId = String(formData.get("exchangeId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, ANSWER_LIMIT);
  if (!exchangeId || !body) return;

  await mutate((db) => {
    const exchange = db.exchanges.find((e) => e.id === exchangeId);
    if (!exchange) return;
    const mine = exchange.answers.find((a) => a.userId === viewer);
    if (mine) {
      mine.body = body;
      return;
    }
    exchange.answers.push({ userId: viewer, body, createdAt: new Date().toISOString() });
  });

  revalidatePath(`/exchange/${exchangeId}`);
}

/** デモ用: 相手が答えた状態にする。 */
export async function simulateExchangeReply(formData: FormData) {
  const viewer = await viewerId();
  const exchangeId = String(formData.get("exchangeId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!exchangeId || !userId || !body) return;

  await mutate((db) => {
    const exchange = db.exchanges.find((e) => e.id === exchangeId);
    if (!exchange || exchange.answers.some((a) => a.userId === userId)) return;
    exchange.answers.push({ userId, body, createdAt: new Date().toISOString() });
  });

  revalidatePath(`/exchange/${exchangeId}`);
}

/**
 * ブロック。相手からも自分からも、あらゆる画面で見えなくなる。
 * ブロックしたことは相手に知らされない。既存のつながりも隠れる。
 */
export async function blockUser(formData: FormData) {
  const viewer = await viewerId();
  const toUserId = String(formData.get("toUserId") ?? "");
  if (!toUserId || toUserId === viewer) return;

  await mutate((db) => {
    if (db.blocks.some((b) => b.fromUserId === viewer && b.toUserId === toUserId)) return;
    db.blocks.push({
      id: newId("blk"),
      fromUserId: viewer,
      toUserId,
      createdAt: new Date().toISOString(),
    });
  });

  revalidatePath("/", "layout");
  redirect("/discover");
}

export async function unblockUser(formData: FormData) {
  const viewer = await viewerId();
  const toUserId = String(formData.get("toUserId") ?? "");
  if (!toUserId) return;
  await mutate((db) => {
    db.blocks = db.blocks.filter((b) => !(b.fromUserId === viewer && b.toUserId === toUserId));
  });
  revalidatePath("/", "layout");
}

/** 通報。ブロックとは独立して行える（通報だけして関係は続けたい場合がある）。 */
export async function reportUser(formData: FormData) {
  const viewer = await viewerId();
  const toUserId = String(formData.get("toUserId") ?? "");
  const reason = String(formData.get("reason") ?? "") as ReportReason;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const contextId = String(formData.get("contextId") ?? "") || null;
  const alsoBlock = formData.get("alsoBlock") === "on";
  if (!toUserId || !REPORT_REASONS.includes(reason)) return;

  await mutate((db) => {
    db.reports.push({
      id: newId("rep"),
      fromUserId: viewer,
      toUserId,
      reason,
      contextId,
      note,
      createdAt: new Date().toISOString(),
    });
    if (alsoBlock && !db.blocks.some((b) => b.fromUserId === viewer && b.toUserId === toUserId)) {
      db.blocks.push({
        id: newId("blk"),
        fromUserId: viewer,
        toUserId,
        createdAt: new Date().toISOString(),
      });
    }
  });

  revalidatePath("/", "layout");
  redirect("/discover");
}

export async function signOut() {
  await clearSession();
  revalidatePath("/", "layout");
  redirect("/signin");
}

// ── おまかせマッチ ──────────────────────────────────────────

export async function respondIntroduction(formData: FormData) {
  const viewer = await viewerId();
  const introductionId = String(formData.get("introductionId") ?? "");
  const answer = String(formData.get("answer") ?? "");
  if (!introductionId || (answer !== "yes" && answer !== "no")) return;

  await respondToIntroduction(introductionId, viewer, answer);
  revalidatePath("/weekly");
  revalidatePath("/connections");
}

/** デモ用: 相手の返事を手元で再現する。 */
export async function simulateIntroductionAnswer(formData: FormData) {
  await viewerId();
  const introductionId = String(formData.get("introductionId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const answer = String(formData.get("answer") ?? "");
  if (!introductionId || !userId || (answer !== "yes" && answer !== "no")) return;

  await simulateIntroductionReply(introductionId, userId, answer);
  revalidatePath("/weekly");
  revalidatePath("/connections");
}

// ── 連絡先の受け渡し（アプリの出口） ────────────────────────

export async function offerContactAction(formData: FormData) {
  const viewer = await viewerId();
  const connectionId = String(formData.get("connectionId") ?? "");
  const contact = String(formData.get("contact") ?? "");
  if (!connectionId || !contact.trim()) return;

  await offerContact(connectionId, viewer, contact);
  revalidatePath("/connections");
}

/** デモ用: 相手が先に預けた状態にする。 */
export async function simulateContactOfferAction(formData: FormData) {
  await viewerId();
  const connectionId = String(formData.get("connectionId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const contact = String(formData.get("contact") ?? "");
  if (!connectionId || !userId || !contact.trim()) return;

  await simulateContactOffer(connectionId, userId, contact);
  revalidatePath("/connections");
}
