import { REPORT_REASONS, REPORT_REASON_LABELS } from "@/lib/types";
import { blockUser, unblockUser, reportUser } from "@/app/actions";

/**
 * 通報とブロック。
 * 目立たせすぎず、探さなくても見つかる位置に置く。
 * 「ブロックしたことは相手に伝わらない」を明記するのは、押すのをためらわせないため。
 */
export function SafetyControls({
  targetUserId,
  targetHandle,
  blocked,
  contextId,
}: {
  targetUserId: string;
  targetHandle: string;
  blocked: boolean;
  contextId?: string;
}) {
  if (blocked) {
    return (
      <section className="space-y-2 rounded-xl border border-[var(--color-line)] p-4">
        <p className="text-xs text-[var(--color-ink-soft)]">
          {targetHandle} をブロックしています。相手にはあなたが見えません。
        </p>
        <form action={unblockUser}>
          <input type="hidden" name="toUserId" value={targetUserId} />
          <button type="submit" className="text-xs underline text-[var(--color-ink-soft)]">
            ブロックを解除する
          </button>
        </form>
      </section>
    );
  }

  return (
    <details className="rounded-xl border border-[var(--color-line)]">
      <summary className="cursor-pointer list-none p-4 text-xs text-[var(--color-ink-soft)]">
        この人を通報・ブロックする
      </summary>

      <div className="space-y-6 border-t border-[var(--color-line)] p-4">
        <form action={reportUser} className="space-y-3">
          {contextId && <input type="hidden" name="contextId" value={contextId} />}
          <input type="hidden" name="toUserId" value={targetUserId} />

          <fieldset className="space-y-2">
            <legend className="text-xs text-[var(--color-ink-soft)]">通報の理由</legend>
            {REPORT_REASONS.map((r, i) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="radio" name="reason" value={r} defaultChecked={i === 0} required />
                {REPORT_REASON_LABELS[r]}
              </label>
            ))}
          </fieldset>

          <textarea
            name="note"
            rows={2}
            maxLength={500}
            placeholder="補足（任意）"
            className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-transparent p-2.5 text-sm outline-none placeholder:text-[var(--color-ink-soft)]/60"
          />

          <label className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
            <input type="checkbox" name="alsoBlock" defaultChecked />
            あわせてブロックする
          </label>

          <button type="submit" className="rounded-full border border-[var(--color-ink)] px-4 py-1.5 text-xs">
            通報する
          </button>
        </form>

        <form action={blockUser} className="space-y-2 border-t border-[var(--color-line)] pt-4">
          <input type="hidden" name="toUserId" value={targetUserId} />
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            通報せずにブロックだけもできます。ブロックしたことは相手に伝わりません。
          </p>
          <button type="submit" className="text-xs underline text-[var(--color-ink-soft)]">
            ブロックだけする
          </button>
        </form>
      </div>
    </details>
  );
}
