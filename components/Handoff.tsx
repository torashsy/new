import { CONTACT_LIMIT, HANDOFF_REQUIRED_EXCHANGES } from "@/lib/types";
import type { HandoffView } from "@/lib/handoff";
import { offerContactAction, simulateContactOfferAction } from "@/app/actions";

/**
 * アプリの出口。
 * 「相手が渡すまで自分のものは見えない」ではなく
 * 「自分が渡すまで相手のものは見えない」。日々の問いと同じ構造にしてある。
 */
export function Handoff({
  connectionId,
  otherHandle,
  otherUserId,
  view,
}: {
  connectionId: string;
  otherHandle: string;
  otherUserId: string;
  view: HandoffView;
}) {
  if (view.remaining > 0) {
    return (
      <p className="border-t border-[var(--color-line)] pt-4 text-xs leading-relaxed text-[var(--color-ink-soft)]">
        あと{view.remaining}回お題が開くと、連絡先を渡し合えるようになります
        （{HANDOFF_REQUIRED_EXCHANGES}回で解放）。
      </p>
    );
  }

  // 両方が預けた
  if (view.mine && view.theirs) {
    return (
      <section className="space-y-2 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-4">
        <p className="text-xs text-[var(--color-ink-soft)]">{otherHandle} の連絡先</p>
        <p className="text-[15px] break-all">{view.theirs}</p>
        <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
          ここから先は、このアプリの外です。写真をやりとりするかどうかも、会うかどうかも、
          おふたりで決めてください。
        </p>
      </section>
    );
  }

  // 自分だけ預けた
  if (view.mine) {
    return (
      <section className="space-y-2 border-t border-[var(--color-line)] pt-4">
        <p className="text-sm">連絡先をお預かりしました。</p>
        <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
          {otherHandle} が同じように預けたら、そのときに相手のものが見えます。
          それまで、こちらの連絡先が相手に渡ることはありません。
        </p>
      </section>
    );
  }

  return (
    <details className="border-t border-[var(--color-line)] pt-4">
      <summary className="cursor-pointer list-none text-sm">連絡先を渡す</summary>

      <div className="space-y-3 pt-3">
        <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
          お互いが預けたときだけ、同時に開きます。あなたが預けても、相手が預けなければ
          相手には何も渡りません。
          <br />
          <span className="text-[var(--color-ink)]">一度預けると取り消せません。</span>
        </p>

        <form action={offerContactAction} className="space-y-2">
          <input type="hidden" name="connectionId" value={connectionId} />
          <input
            name="contact"
            required
            maxLength={CONTACT_LIMIT}
            placeholder="LINE ID、メールアドレスなど"
            className="w-full rounded-lg border border-[var(--color-line)] bg-transparent p-3 text-[15px] outline-none placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)]"
          >
            預ける
          </button>
        </form>

        <form action={simulateContactOfferAction} className="pt-1">
          <input type="hidden" name="connectionId" value={connectionId} />
          <input type="hidden" name="userId" value={otherUserId} />
          <input type="hidden" name="contact" value="line: demo_user" />
          <button type="submit" className="text-xs text-[var(--color-ink-soft)] underline">
            （デモ）相手が先に預けた状態にする
          </button>
        </form>
      </div>
    </details>
  );
}
