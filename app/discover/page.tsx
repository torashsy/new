import { requireViewer } from "@/lib/viewer";
import Link from "next/link";
import {discover, incomingInterest, interestBudget, whyNoCandidates} from "@/lib/queries";
import { ageOf, isProfileComplete, GENDER_LABELS } from "@/lib/types";
import { MAX_INTERESTS_PER_DAY } from "@/lib/limits";
import { explain } from "@/lib/score";
import { sendInterest, simulateInterestFrom } from "../actions";
import { Shape } from "@/components/Shape";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";


export default async function DiscoverPage() {
  const me = await requireViewer();

  if (!me.axes) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        先に <Link href="/diagnostic" className="underline">診断</Link> を済ませてください。
      </p>
    );
  }

  if (!isProfileComplete(me)) {
    return (
      <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
        年齢・性別・場所が未登録です。条件が合う相手を出せないので、
        先に <Link href="/profile" className="underline">プロフィール</Link> を埋めてください。
      </p>
    );
  }

  const candidates = await discover(me.id);
  const incoming = await incomingInterest(me.id);
  const budget = await interestBudget(me.id);
  const narrowing = candidates.length === 0 ? await whyNoCandidates(me.id) : null;

  return (
    <div className="space-y-9">
      <header className="space-y-1.5">
        <h1 className="text-sm text-[var(--color-ink-soft)]">近いかもしれない人</h1>
        <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
          出てくる理由は必ず添えています。理由の言えない推薦はしません。
        </p>
        <p className="text-xs text-[var(--color-ink-soft)]">
          今日あと{budget.left}人に「もっと知りたい」を送れます（1日{MAX_INTERESTS_PER_DAY}人まで）。
          {budget.left === 0 && " 全員に送れてしまうと、選ぶことの意味がなくなるので。"}
        </p>
      </header>

      {incoming.length > 0 && (
        <section className="space-y-2 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-4">
          <p className="text-sm">あなたに「もっと知りたい」を送っている人がいます（{incoming.length}）</p>
          <p className="text-xs text-[var(--color-ink-soft)]">
            誰かは、あなたが同じものを送り返したときに分かります。
          </p>
        </section>
      )}

      {candidates.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-ink-soft)]">いまは候補がありません。</p>
          {narrowing && (
            <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
              条件で外れた人: 性別 {narrowing.gender}人 ／ 年齢 {narrowing.age}人 ／ 場所{" "}
              {narrowing.region}人 ／ 登録が途中の人 {narrowing.incomplete}人。
              <br />
              <Link href="/profile" className="underline">条件をゆるめる</Link>
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {candidates.map(({ user, breakdown, latestAnswer, latestQuestionText }) => (
            <li key={user.id} className="space-y-3 rounded-xl border border-[var(--color-line)] p-5">
              <div className="flex items-start gap-4">
                <Shape axes={user.axes} seedKey={user.id} size={52} />
                <div className="min-w-0 flex-1 space-y-1">
                  <Link href={`/u/${encodeURIComponent(user.handle)}`} className="text-[15px] hover:underline">
                    {user.handle}
                  </Link>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {ageOf(user.birthYear)}歳 ・ {user.region}
                    {user.gender && ` ・ ${GENDER_LABELS[user.gender]}`}
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">{user.bio}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-soft)]">
                  {breakdown.total}
                </span>
              </div>

              <p className="text-xs text-[var(--color-ink-soft)]">{explain(breakdown)}</p>

              {user.tags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {user.tags.map((t) => (
                    <li
                      key={t}
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        breakdown.sharedTags.includes(t)
                          ? "bg-[var(--color-accent)]/15 text-[var(--color-ink)]"
                          : "text-[var(--color-ink-soft)]"
                      }`}
                    >
                      #{t}
                    </li>
                  ))}
                </ul>
              )}

              {latestAnswer && latestQuestionText && (
                <div className="space-y-1 border-l-2 border-[var(--color-line)] pl-3.5">
                  <p className="question text-xs text-[var(--color-ink-soft)]">{latestQuestionText}</p>
                  <p className="text-[15px] leading-relaxed">{latestAnswer.body}</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <form action={sendInterest}>
                  <input type="hidden" name="toUserId" value={user.id} />
                  <button
                    type="submit"
                    disabled={budget.left === 0}
                    className="rounded-full border border-[var(--color-ink)] px-4 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    もっと知りたい
                  </button>
                </form>
                <form action={simulateInterestFrom}>
                  <input type="hidden" name="fromUserId" value={user.id} />
                  <button type="submit" className="text-xs text-[var(--color-ink-soft)] underline">
                    （デモ）相手からも送られた状態にする
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
