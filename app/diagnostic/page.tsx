import { DIAGNOSTIC, SCALE } from "@/lib/axes";
import { saveDiagnostic } from "../actions";

export default function DiagnosticPage() {
  return (
    <form action={saveDiagnostic} className="space-y-8">
      <header className="space-y-2">
        <h1 className="question text-xl">12問</h1>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          正解はありません。迷ったら真ん中でかまいません。
          <br />
          結果はあなたの「かたち」になります。数値は誰にも見せません。
        </p>
      </header>

      <ol className="space-y-7">
        {DIAGNOSTIC.map((q, i) => (
          <li key={q.id} className="space-y-3">
            <p className="text-[15px] leading-relaxed">
              <span className="mr-2 text-xs text-[var(--color-ink-soft)]">{i + 1}</span>
              {q.text}
            </p>
            <div className="flex gap-1.5">
              {SCALE.map((s) => (
                <label
                  key={s.value}
                  className="flex-1 cursor-pointer rounded-md border border-[var(--color-line)] px-1 py-2 text-center text-[11px] leading-tight text-[var(--color-ink-soft)] transition-colors has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent)]/10 has-[:checked]:text-[var(--color-ink)]"
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={s.value}
                    defaultChecked={s.value === 3}
                    className="sr-only"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <button
        type="submit"
        className="rounded-full bg-[var(--color-ink)] px-6 py-2.5 text-sm text-[var(--color-paper)]"
      >
        かたちを作る
      </button>
    </form>
  );
}
