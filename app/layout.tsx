import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getMe } from "@/lib/queries";
import { Shape } from "@/components/Shape";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";


export const metadata: Metadata = {
  title: "かたち",
  description: "顔写真もチャットもない。同じ問いに答えることで人と出会う。",
};

const NAV = [
  { href: "/", label: "今日の問い" },
  { href: "/discover", label: "さがす" },
  { href: "/connections", label: "つながり" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();

  return (
    <html lang="ja">
      <body className="min-h-dvh">
        <header className="border-b border-[var(--color-line)]">
          <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-4">
            <Link href="/" className="font-serif text-lg tracking-wide">
              かたち
            </Link>
            <nav className="flex flex-1 gap-4 text-sm text-[var(--color-ink-soft)]">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-[var(--color-ink)]">
                  {n.label}
                </Link>
              ))}
            </nav>
            <Link href={`/u/${encodeURIComponent(me.handle)}`} className="flex items-center gap-2 text-sm">
              <Shape axes={me.axes} seedKey={me.id} size={28} />
              <span className="text-[var(--color-ink-soft)]">{me.handle}</span>
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 py-8">{children}</main>

        <footer className="mx-auto max-w-2xl px-5 pb-12 pt-4 text-xs leading-relaxed text-[var(--color-ink-soft)]">
          このアプリには写真をアップロードする機能がありません。アイコンは診断結果から自動生成された図形です。
        </footer>
      </body>
    </html>
  );
}
