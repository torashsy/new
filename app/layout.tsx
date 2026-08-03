import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { optionalViewer } from "@/lib/viewer";
import { Shape } from "@/components/Shape";
import { signOut } from "./actions";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "かたち",
  description: "顔写真もチャットもない。同じ問いに答えることで人と出会う。",
};

const NAV = [
  { href: "/", label: "今日の問い" },
  { href: "/weekly", label: "今週の人" },
  { href: "/discover", label: "さがす" },
  { href: "/connections", label: "つながり" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await optionalViewer();

  return (
    <html lang="ja">
      <body className="min-h-dvh">
        <header className="border-b border-[var(--color-line)]">
          <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-4">
            <Link href={me ? "/" : "/signin"} className="shrink-0 font-serif text-lg tracking-wide">
              かたち
            </Link>

            {me && (
              <>
                {/* 項目が増えたので、狭い画面では折り返さず横に流す */}
                <nav className="flex min-w-0 flex-1 gap-3.5 overflow-x-auto text-sm whitespace-nowrap text-[var(--color-ink-soft)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {NAV.map((n) => (
                    <Link key={n.href} href={n.href} className="shrink-0 hover:text-[var(--color-ink)]">
                      {n.label}
                    </Link>
                  ))}
                </nav>
                <Link
                  href={`/u/${encodeURIComponent(me.handle)}`}
                  className="flex shrink-0 items-center gap-2 text-sm"
                >
                  <Shape axes={me.axes} seedKey={me.id} size={28} />
                  <span className="whitespace-nowrap text-[var(--color-ink-soft)]">{me.handle}</span>
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 py-8">{children}</main>

        <footer className="mx-auto flex max-w-2xl items-baseline justify-between gap-4 px-5 pb-12 pt-4 text-xs leading-relaxed text-[var(--color-ink-soft)]">
          <p>
            このアプリには写真をアップロードする機能がありません。アイコンは診断結果から自動生成された図形です。
          </p>
          {me && (
            <form action={signOut}>
              <button type="submit" className="shrink-0 whitespace-nowrap underline">
                出る
              </button>
            </form>
          )}
        </footer>
      </body>
    </html>
  );
}
