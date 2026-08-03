import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { introductionFor, recentAnswersOf } from "@/lib/queries";
import { ensureIntroductions } from "@/lib/introductions";
import { weekStartOf, introductionState } from "@/lib/weekly";
import { isProfileComplete } from "@/lib/types";
import { respondIntroduction, simulateIntroductionAnswer } from "../actions";
import { Shape } from "@/components/Shape";

export const dynamic = "force-dynamic";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

function formatWeek(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  const f = (x: Date) => `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
  return `${f(d)}〜${f(end)}`;
}

export default async function WeeklyPage() {
  const me = await requireViewer();

  if (!isProfileComplete(me)) {
    return (
      <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
        診断とプロフィールが済むと、毎週ひとりだけ紹介が届きます。
        <br />
        <Link href="/diagnostic" className="underline">診断</Link> から始めてください。
      </p>
    );
  }

  const weekStart = weekStartOf();
  await ensureIntroductions(weekStart);
  const found = await introductionFor(me.id, weekStart);

  if (!found) {
    return (
      <div className="space-y-3">
        <h1 className="text-sm text-[var(--color-ink-soft)]">今週の人</h1>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          今週は紹介できる相手が見つかりませんでした。
          <br />
          条件が厳しすぎるか、まだ人が少ないためです。来週またお届けします。
        </p>
        <Link href="/profile" className="text-xs underline text-[var(--color-ink-soft)]">
          条件を見直す
        </Link>
      </div>
    );
  }

  const { intro, other } = found;
  const state = introductionState(intro, me.id);
  const theirAnswers = await recentAnswersOf(other.id, 3);
  const otherResponded = intro.responses.some((r) => r.userId === other.id);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs tracking-widest text-[var(--color-ink-soft)]">
          {formatWeek(weekStart)} ／ 今週の人
        </p>
        <h1 className="question text-xl leading-relaxed">
          {state === "pending" ? "ひとりだけ、お引き合わせします。" : "今週のお相手"}
        </h1>
        {state === "pending" && (
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            こちらから選ぶ必要はありません。相手にも同じ画面が出ています。
            <br />
            見送っても、そのことは相手に伝わりません。
          </p>
        )}
      </header>

      <section className="space-y-5 rounded-xl border border-[var(--color-line)] p-5">
        <div className="flex items-start gap-4">
          <Shape axes={other.axes} seedKey={other.id} size={64} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[15px]">{other.handle}</p>
            <p className="text-xs text-[var(--color-ink-soft)]">
              {other.birthYear && `${new Date().getFullYear() - other.birthYear}歳`}
              {other.region && ` ・ ${other.region}`}
            </p>
            <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">{other.bio}</p>
          </div>
        </div>

        {other.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {other.tags.map((t) => (
              <li key={t} className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-xs text-[var(--color-ink-soft)]">
                #{t}
              </li>
            ))}
          </ul>
        )}

        {/* 話の糸口を先に渡す。ゼロから話しかけるのがいちばん難しいので。 */}
        {theirAnswers.length > 0 && (
          <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
            <p className="text-xs text-[var(--color-ink-soft)]">この人が答えた問い</p>
            {theirAnswers.map((a, i) => (
              <div key={i} className="space-y-1 border-l-2 border-[var(--color-line)] pl-3.5">
                <p className="question text-xs text-[var(--color-ink-soft)]">{a.question}</p>
                <p className="text-[15px] leading-relaxed">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 返事 ───────────────────────────────── */}
      {state === "pending" && (
        <section className="space-y-3">
          <div className="flex gap-2">
            <form action={respondIntroduction} className="flex-1">
              <input type="hidden" name="introductionId" value={intro.id} />
              <input type="hidden" name="answer" value="yes" />
              <button
                type="submit"
                className="w-full rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm text-[var(--color-paper)]"
              >
                話してみたい
              </button>
            </form>
            <form action={respondIntroduction}>
              <input type="hidden" name="introductionId" value={intro.id} />
              <input type="hidden" name="answer" value="no" />
              <button
                type="submit"
                className="rounded-full border border-[var(--color-line)] px-5 py-3 text-sm text-[var(--color-ink-soft)]"
              >
                今回は見送る
              </button>
            </form>
          </div>
          <p className="text-xs text-[var(--color-ink-soft)]">
            返事は今週いっぱい待てます。急がなくてかまいません。
          </p>
        </section>
      )}

      {state === "waiting" && (
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          返事をお預かりしました。相手が答えるまで、こちらからは何も起きません。
          <br />
          結果は今週のうちにこの画面に出ます。
        </p>
      )}

      {state === "matched" && (
        <section className="space-y-3 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-5">
          <p className="text-sm">つながりました。</p>
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            自由に文章を送り合う機能はありません。お題を選んで、二人とも答えると開きます。
          </p>
          <Link
            href="/connections"
            className="inline-block rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)]"
          >
            お題を送る
          </Link>
        </section>
      )}

      {/* どちらが断ったかは、絶対に出さない。 */}
      {(state === "closed" || state === "declined") && (
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          今回はご縁がありませんでした。
          <br />
          来週また、ひとりお届けします。
        </p>
      )}

      {!otherResponded && state !== "declined" && (
        <form action={simulateIntroductionAnswer} className="flex gap-2 border-t border-[var(--color-line)] pt-5">
          <input type="hidden" name="introductionId" value={intro.id} />
          <input type="hidden" name="userId" value={other.id} />
          <button name="answer" value="yes" className="text-xs text-[var(--color-ink-soft)] underline">
            （デモ）相手が「話してみたい」を選んだ状態にする
          </button>
          <button name="answer" value="no" className="text-xs text-[var(--color-ink-soft)] underline">
            （デモ）見送られた状態にする
          </button>
        </form>
      )}
    </div>
  );
}
