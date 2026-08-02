import Link from "next/link";
import { connectionsOf, getMe } from "@/lib/queries";
import { EXCHANGE_PROMPTS } from "@/lib/questions";
import { openExchange } from "../actions";
import { Shape } from "@/components/Shape";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";


export default async function ConnectionsPage() {
  const me = await getMe();
  const connections = await connectionsOf(me.id);

  if (connections.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-ink-soft)]">まだつながりがありません。</p>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          <Link href="/discover" className="underline">さがす</Link> から「もっと知りたい」を送って、
          相手からも返ってくるとここに出ます。
        </p>
      </div>
    );
  }

  // 提案する札は毎回変える。全部見せると選ぶこと自体が負担になる。
  const deck = (seed: string) => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return [0, 1, 2].map((k) => EXCHANGE_PROMPTS[(h + k * 7) % EXCHANGE_PROMPTS.length]);
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-sm text-[var(--color-ink-soft)]">つながり（{connections.length}）</h1>
        <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
          自由に文章を送り合う機能はありません。お題を選んで、二人とも答えると開きます。
        </p>
      </header>

      <ul className="space-y-4">
        {connections.map(({ connection, other, exchanges }) => (
          <li key={connection.id} className="space-y-4 rounded-xl border border-[var(--color-line)] p-5">
            <div className="flex items-center gap-4">
              <Shape axes={other.axes} seedKey={other.id} size={48} />
              <div className="min-w-0">
                <Link href={`/u/${encodeURIComponent(other.handle)}`} className="text-[15px] hover:underline">
                  {other.handle}
                </Link>
                <p className="text-xs text-[var(--color-ink-soft)]">{other.bio}</p>
              </div>
            </div>

            {exchanges.length > 0 && (
              <ul className="space-y-1.5">
                {exchanges.map((e) => {
                  const answered = e.answers.length;
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/exchange/${e.id}`}
                        className="flex items-baseline justify-between gap-3 rounded-lg p-2.5 hover:bg-[var(--color-line)]/40"
                      >
                        <span className="question min-w-0 flex-1 truncate text-sm">{e.promptText}</span>
                        <span className="shrink-0 text-xs text-[var(--color-ink-soft)]">
                          {answered === 2 ? "開いた" : answered === 1 ? "片方" : "未回答"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
              <p className="text-xs text-[var(--color-ink-soft)]">お題を送る</p>
              {deck(connection.id + exchanges.length).map((p) => (
                <form key={p.id} action={openExchange}>
                  <input type="hidden" name="connectionId" value={connection.id} />
                  <input type="hidden" name="promptId" value={p.id} />
                  <button
                    type="submit"
                    className="question w-full rounded-lg border border-[var(--color-line)] p-3 text-left text-sm hover:border-[var(--color-accent)]"
                  >
                    {p.text}
                  </button>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
