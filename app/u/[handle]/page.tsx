import { notFound } from "next/navigation";
import Link from "next/link";
import { answersOf, getMe, getUserByHandle, isBlockedByMe } from "@/lib/queries";
import { SafetyControls } from "@/components/SafetyControls";
import { DAILY_QUESTIONS } from "@/lib/questions";
import { AXES, describeAxis } from "@/lib/axes";
import { AXIS_IDS } from "@/lib/types";
import { Shape } from "@/components/Shape";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";


const questionText = (id: string) => DAILY_QUESTIONS.find((q) => q.id === id)?.text ?? "";

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = await getUserByHandle(decodeURIComponent(handle));
  if (!user) notFound();

  const me = await getMe();
  const isMe = user.id === me.id;
  const answers = (await answersOf(user.id)).slice(0, 12);
  const blocked = isMe ? false : await isBlockedByMe(me.id, user.id);

  return (
    <div className="space-y-9">
      <header className="flex items-start gap-5">
        <Shape axes={user.axes} seedKey={user.id} size={96} />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-lg">{user.handle}</h1>
          <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">{user.bio}</p>
          {user.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {user.tags.map((t) => (
                <li key={t} className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-xs text-[var(--color-ink-soft)]">
                  #{t}
                </li>
              ))}
            </ul>
          )}
          {isMe && (
            <div className="flex gap-3 pt-2 text-xs">
              <Link href="/tags" className="underline text-[var(--color-ink-soft)]">
                ひとこととタグを直す
              </Link>
              <Link href="/diagnostic" className="underline text-[var(--color-ink-soft)]">
                診断をやり直す
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* 自分の軸だけ数値の内訳を見せる。他人のは形と言葉だけ。 */}
      {isMe && user.axes && (
        <section className="space-y-2 rounded-xl border border-[var(--color-line)] p-5">
          <p className="text-xs text-[var(--color-ink-soft)]">あなたの軸（他の人には見えません）</p>
          <ul className="space-y-1 text-xs text-[var(--color-ink-soft)]">
            {AXIS_IDS.map((id) => (
              <li key={id} className="flex items-center gap-3">
                <span className="w-40 shrink-0">
                  {AXES[id].low}⇔{AXES[id].high}
                </span>
                <span className="h-1 flex-1 rounded-full bg-[var(--color-line)]">
                  <span
                    className="block h-1 rounded-full bg-[var(--color-accent)]"
                    style={{ width: `${user.axes![id]}%` }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right">{describeAxis(id, user.axes![id])}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm text-[var(--color-ink-soft)]">これまでの答え</h2>
        {answers.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">まだありません。</p>
        ) : (
          <ul className="space-y-5">
            {answers.map((a) => (
              <li key={a.id} className="space-y-1 border-l-2 border-[var(--color-line)] pl-4">
                <p className="question text-xs text-[var(--color-ink-soft)]">{questionText(a.questionId)}</p>
                <p className="text-[15px] leading-relaxed">{a.body}</p>
                <p className="text-[11px] text-[var(--color-ink-soft)]">{a.createdAt.slice(0, 10).replace(/-/g, ".")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isMe && (
        <SafetyControls targetUserId={user.id} targetHandle={user.handle} blocked={blocked} />
      )}
    </div>
  );
}
