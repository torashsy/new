import { requireViewer } from "@/lib/viewer";
import Link from "next/link";
import {myAnswerToday, todayFeed, userMap} from "@/lib/queries";
import { questionForDate, today } from "@/lib/questions";
import { submitAnswer } from "./actions";
import { ANSWER_LIMIT } from "@/lib/limits";
import { Shape } from "@/components/Shape";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";


export default async function HomePage() {
  const me = await requireViewer();
  const question = questionForDate(today());
  const mine = await myAnswerToday(me.id);
  const feed = await todayFeed(me.id);
  const users = await userMap();

  if (!me.axes) {
    return (
      <section className="space-y-5">
        <p className="text-sm text-[var(--color-ink-soft)]">はじめに、12問だけ答えてください。</p>
        <p className="question text-2xl">
          あなたの「かたち」を決めます。
        </p>
        <Link
          href="/diagnostic"
          className="inline-block rounded-full bg-[var(--color-ink)] px-6 py-2.5 text-sm text-[var(--color-paper)]"
        >
          診断をはじめる
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <p className="text-xs tracking-widest text-[var(--color-ink-soft)]">
          {question.date.replace(/-/g, ".")} ／ 全員に同じ問い
        </p>
        <h1 className="question text-2xl">{question.text}</h1>

        <form action={submitAnswer} className="space-y-3">
          <textarea
            name="body"
            defaultValue={mine?.body ?? ""}
            maxLength={ANSWER_LIMIT}
            rows={3}
            required
            placeholder="思いついたまま。うまく書かなくていい。"
            className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-transparent p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-accent)]"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)]"
            >
              {mine ? "書き直す" : "答える"}
            </button>
            <span className="text-xs text-[var(--color-ink-soft)]">{ANSWER_LIMIT}字まで</span>
          </div>
        </form>
      </section>

      <section className="space-y-4 border-t border-[var(--color-line)] pt-8">
        {feed === null ? (
          <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
            自分が答えると、同じ問いに答えた人の言葉が読めます。
            <br />
            先に読めてしまうと、うまい答えを真似る場所になってしまうので。
          </p>
        ) : feed.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">今日はまだ、ほかに答えた人がいません。</p>
        ) : (
          <>
            <h2 className="text-sm text-[var(--color-ink-soft)]">同じ問いに答えた人（{feed.length}）</h2>
            <ul className="space-y-1">
              {feed.map((answer) => {
                const user = users.get(answer.userId);
                if (!user) return null;
                return (
                  <li key={answer.id}>
                    <Link
                      href={`/u/${encodeURIComponent(user.handle)}`}
                      className="flex gap-3.5 rounded-lg p-3 transition-colors hover:bg-[var(--color-line)]/40"
                    >
                      <Shape axes={user.axes} seedKey={user.id} size={38} />
                      <div className="min-w-0 space-y-1">
                        <p className="text-[15px] leading-relaxed">{answer.body}</p>
                        <p className="text-xs text-[var(--color-ink-soft)]">{user.handle}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
