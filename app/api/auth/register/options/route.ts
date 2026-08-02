import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { RP_NAME, relyingParty, storeChallenge, handleTaken } from "@/lib/webauthn";

export async function POST(request: Request) {
  const { handle } = (await request.json()) as { handle?: string };
  const trimmed = (handle ?? "").trim();

  if (!trimmed || trimmed.length > 20) {
    return NextResponse.json({ error: "名前は1〜20文字で入れてください" }, { status: 400 });
  }
  if (await handleTaken(trimmed)) {
    return NextResponse.json({ error: "その名前はもう使われています" }, { status: 409 });
  }

  const { rpID } = await relyingParty();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: trimmed,
    userDisplayName: trimmed,
    attestationType: "none",
    authenticatorSelection: {
      // 端末に鍵を残す。次回から名前の入力すら要らなくなる。
      residentKey: "required",
      userVerification: "preferred",
    },
  });

  const challengeId = await storeChallenge(options.challenge, { pendingHandle: trimmed });
  return NextResponse.json({ options, challengeId });
}
