import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { relyingParty, consumeChallenge, handleTaken } from "@/lib/webauthn";
import { mutate, newId } from "@/lib/store";
import { setSession } from "@/lib/session";
import { DEFAULT_PREFERENCE } from "@/lib/types";

export async function POST(request: Request) {
  const { response, challengeId, label } = await request.json();

  const challenge = await consumeChallenge(String(challengeId ?? ""));
  if (!challenge?.pendingHandle) {
    return NextResponse.json({ error: "時間切れです。もう一度お試しください" }, { status: 400 });
  }
  // チャレンジ発行から確定までの間に取られている可能性がある
  if (await handleTaken(challenge.pendingHandle)) {
    return NextResponse.json({ error: "その名前はもう使われています" }, { status: 409 });
  }

  const { rpID, origin } = await relyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.value,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    return NextResponse.json({ error: "パスキーを確認できませんでした" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "パスキーを確認できませんでした" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  const userId = newId("usr");

  await mutate((db) => {
    db.users.push({
      id: userId,
      handle: challenge.pendingHandle!,
      bio: "",
      axes: null,
      tags: [],
      birthYear: null,
      gender: null,
      region: null,
      preference: { ...DEFAULT_PREFERENCE },
      createdAt: new Date().toISOString(),
    });
    db.credentials.push({
      id: credential.id,
      userId,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? [],
      label: String(label ?? "この端末").slice(0, 40),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
  });

  await setSession(userId);
  return NextResponse.json({ ok: true, next: "/diagnostic" });
}
