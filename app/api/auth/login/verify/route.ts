import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { relyingParty, consumeChallenge, findCredential } from "@/lib/webauthn";
import { mutate, readDb } from "@/lib/store";
import { setSession } from "@/lib/session";
import { isProfileComplete } from "@/lib/types";

export async function POST(request: Request) {
  const { response, challengeId } = await request.json();

  const challenge = await consumeChallenge(String(challengeId ?? ""));
  if (!challenge) {
    return NextResponse.json({ error: "時間切れです。もう一度お試しください" }, { status: 400 });
  }

  const stored = await findCredential(String(response?.id ?? ""));
  if (!stored) {
    return NextResponse.json({ error: "このパスキーは登録されていません" }, { status: 404 });
  }

  const { rpID, origin } = await relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.value,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: stored.id,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
        counter: stored.counter,
        transports: stored.transports as never,
      },
    });
  } catch {
    return NextResponse.json({ error: "パスキーを確認できませんでした" }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "パスキーを確認できませんでした" }, { status: 400 });
  }

  // カウンタを進めておく（複製された認証器の検出に使われる）
  await mutate((db) => {
    const credential = db.credentials.find((c) => c.id === stored.id);
    if (!credential) return;
    credential.counter = verification.authenticationInfo.newCounter;
    credential.lastUsedAt = new Date().toISOString();
  });

  await setSession(stored.userId);

  const db = await readDb();
  const user = db.users.find((u) => u.id === stored.userId);
  const next = !user?.axes ? "/diagnostic" : !isProfileComplete(user) ? "/profile" : "/";
  return NextResponse.json({ ok: true, next });
}
