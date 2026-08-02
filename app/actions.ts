"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mutate, newId } from "@/lib/store";
import { questionForDate, today, EXCHANGE_PROMPTS } from "@/lib/questions";
import { scoreDiagnostic } from "@/lib/axes";
import { DEMO_USER_ID } from "@/lib/seed";
import type { Connection } from "@/lib/types";
import { ANSWER_LIMIT, BIO_LIMIT, MAX_TAGS } from "@/lib/limits";

export async function submitAnswer(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim().slice(0, ANSWER_LIMIT);
  if (!body) return;
  const q = questionForDate(today());

  await mutate((db) => {
    const existing = db.answers.find((a) => a.userId === DEMO_USER_ID && a.questionId === q.id);
    if (existing) {
      existing.body = body;
      return;
    }
    db.answers.push({
      id: newId("ans"),
      userId: DEMO_USER_ID,
      questionId: q.id,
      body,
      createdAt: new Date().toISOString(),
    });
  });

  revalidatePath("/");
  revalidatePath("/discover");
}

export async function saveDiagnostic(formData: FormData) {
  const responses: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("q")) responses[key] = Number(value);
  }
  const axes = scoreDiagnostic(responses);

  await mutate((db) => {
    const me = db.users.find((u) => u.id === DEMO_USER_ID);
    if (me) me.axes = axes;
  });

  revalidatePath("/", "layout");
  redirect("/tags");
}

export async function saveProfile(formData: FormData) {
  const bio = String(formData.get("bio") ?? "").trim().slice(0, BIO_LIMIT);
  const tags = String(formData.get("tags") ?? "")
    .split(/[\s,、]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS);

  await mutate((db) => {
    const me = db.users.find((u) => u.id === DEMO_USER_ID);
    if (!me) return;
    me.bio = bio;
    me.tags = [...new Set(tags)];
  });

  revalidatePath("/", "layout");
  redirect("/discover");
}

/**
 * 「もっと知りたい」を送る。相互になった時点で接続が成立する。
 * 送った事実は相手に通知されない（送り返されるまで relationship は始まらない）。
 */
export async function sendInterest(formData: FormData) {
  const toUserId = String(formData.get("toUserId") ?? "");
  if (!toUserId || toUserId === DEMO_USER_ID) return;

  const connectionId = await mutate((db): string | null => {
    const already = db.interests.find((i) => i.fromUserId === DEMO_USER_ID && i.toUserId === toUserId);
    if (!already) {
      db.interests.push({
        id: newId("int"),
        fromUserId: DEMO_USER_ID,
        toUserId,
        createdAt: new Date().toISOString(),
      });
    }

    const reciprocal = db.interests.find((i) => i.fromUserId === toUserId && i.toUserId === DEMO_USER_ID);
    if (!reciprocal) return null;

    const pair = [DEMO_USER_ID, toUserId].sort() as [string, string];
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
  const fromUserId = String(formData.get("fromUserId") ?? "");
  if (!fromUserId) return;
  await mutate((db) => {
    const already = db.interests.find((i) => i.fromUserId === fromUserId && i.toUserId === DEMO_USER_ID);
    if (already) return;
    db.interests.push({
      id: newId("int"),
      fromUserId,
      toUserId: DEMO_USER_ID,
      createdAt: new Date().toISOString(),
    });
  });
  revalidatePath("/discover");
}

export async function openExchange(formData: FormData) {
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
      openedBy: DEMO_USER_ID,
      answers: [],
      createdAt: new Date().toISOString(),
    });
    return exchangeId;
  });

  revalidatePath("/connections");
  redirect(`/exchange/${id}`);
}

export async function answerExchange(formData: FormData) {
  const exchangeId = String(formData.get("exchangeId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, ANSWER_LIMIT);
  if (!exchangeId || !body) return;

  await mutate((db) => {
    const exchange = db.exchanges.find((e) => e.id === exchangeId);
    if (!exchange) return;
    const mine = exchange.answers.find((a) => a.userId === DEMO_USER_ID);
    if (mine) {
      mine.body = body;
      return;
    }
    exchange.answers.push({ userId: DEMO_USER_ID, body, createdAt: new Date().toISOString() });
  });

  revalidatePath(`/exchange/${exchangeId}`);
}

/** デモ用: 相手が答えた状態にする。 */
export async function simulateExchangeReply(formData: FormData) {
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
