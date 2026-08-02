import { notFound } from "next/navigation";
import Link from "next/link";
import { getExchange } from "@/lib/queries";
import { answerExchange, simulateExchangeReply } from "../../actions";
import { ANSWER_LIMIT } from "@/lib/limits";
import { Shape } from "@/components/Shape";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";


export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getExchange(id);
  if (!data) notFound();

  const { exchange, other, me } = data;
  const mine = exchange.answers.find((a) => a.userId === me.id);
  const theirs = exchange.answers.find((a) => a.userId === other.id);
  const open = Boolean(mine && theirs);

  return (
    <div className="space-y-8">
      <Link href="/connections" className="text-xs text-[var(--color-ink-soft)] hover:underline">
        ← つながり
      </Link>

      <header className="space-y-2">
        <p className="text-xs text-[var(--color-ink-soft)]">{other.handle} との交換</p>
        <h1 className="question text-xl leading-relaxed">{exchange.promptText}</h1>
      </header>

      <section className="space-y-3">
        <form action={answerExchange} className="space-y-3">
          <input type="hidden" name="exchangeId" value={exchange.id} />
          <textarea
            name="body"
            rows={3}
            required
            maxLength={ANSWER_LIMIT}
            defaultValue={mine?.body ?? ""}
            placeholder="相手の答えは、あなたが答えるまで見えません。"
            className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-transparent p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)]"
          >
            {mine ? "書き直す" : "答える"}
          </button>
        </form>
      </section>

      <section className="space-y-4 border-t border-[var(--color-line)] pt-7">
        {open ? (
          <ul className="space-y-5">
            {[
              { user: me, answer: mine! },
              { user: other, answer: theirs! },
            ].map(({ user, answer }) => (
              <li key={user.id} className="flex gap-4">
                <Shape axes={user.axes} seedKey={user.id} size={40} />
                <div className="space-y-1">
                  <p className="text-xs text-[var(--color-ink-soft)]">{user.handle}</p>
                  <p className="text-[15px] leading-relaxed">{answer.body}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
            {!mine && !theirs && "どちらもまだ答えていません。"}
            {mine && !theirs && "あなたは答えました。相手が答えると、二つ同時に開きます。"}
            {!mine && theirs && "相手はもう答えています。あなたが答えると開きます。"}
          </p>
        )}

        {!theirs && (
          <form action={simulateExchangeReply} className="flex gap-2 pt-2">
            <input type="hidden" name="exchangeId" value={exchange.id} />
            <input type="hidden" name="userId" value={other.id} />
            <input
              name="body"
              required
              placeholder="（デモ）相手の答えを入れて動きを見る"
              className="flex-1 rounded-lg border border-dashed border-[var(--color-line)] bg-transparent p-2.5 text-xs outline-none"
            />
            <button type="submit" className="text-xs text-[var(--color-ink-soft)] underline">
              入れる
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
