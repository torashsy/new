import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { relyingParty, storeChallenge } from "@/lib/webauthn";

export async function POST() {
  const { rpID } = await relyingParty();

  // allowCredentials を空にして、端末に保存された鍵から選ばせる。
  // 名前もメールアドレスも入力させずにログインできる。
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  const challengeId = await storeChallenge(options.challenge);
  return NextResponse.json({ options, challengeId });
}
