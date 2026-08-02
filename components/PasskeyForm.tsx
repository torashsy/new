"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

/**
 * パスキーの登録とログイン。
 * パスワードは扱わないので、入力欄は新規登録の「名前」だけ。
 */
export function PasskeyForm({ demoAvailable }: { demoAvailable: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "うまくいきませんでした");
    return data;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      // ユーザーがダイアログを閉じただけのときは、エラーとして騒がない
      const message = e instanceof Error ? e.message : "うまくいきませんでした";
      setError(/NotAllowed|abort/i.test(message) ? null : message);
    } finally {
      setBusy(false);
    }
  };

  const login = () =>
    run(async () => {
      const { options, challengeId } = await post("/api/auth/login/options", {});
      const response = await startAuthentication({ optionsJSON: options });
      const { next } = await post("/api/auth/login/verify", { response, challengeId });
      router.push(next);
      router.refresh();
    });

  const register = () =>
    run(async () => {
      const { options, challengeId } = await post("/api/auth/register/options", { handle });
      const response = await startRegistration({ optionsJSON: options });
      const { next } = await post("/api/auth/register/verify", {
        response,
        challengeId,
        label: navigator.platform || "この端末",
      });
      router.push(next);
      router.refresh();
    });

  if (typeof window !== "undefined" && !browserSupportsWebAuthn()) {
    return (
      <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
        このブラウザはパスキーに対応していません。
        Safari、Chrome、Edge の新しい版でお試しください。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {mode === "register" && (
        <div className="space-y-2">
          <label htmlFor="handle" className="block text-xs text-[var(--color-ink-soft)]">
            名前（あとから変えられます。本名でなくてかまいません）
          </label>
          <input
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={20}
            placeholder="みずいろ"
            className="w-full rounded-lg border border-[var(--color-line)] bg-transparent p-3 text-[15px] outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={mode === "login" ? login : register}
          disabled={busy || (mode === "register" && !handle.trim())}
          className="w-full rounded-full bg-[var(--color-ink)] px-6 py-3 text-sm text-[var(--color-paper)] disabled:opacity-40"
        >
          {busy ? "確認しています…" : mode === "login" ? "パスキーで入る" : "パスキーを作る"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="w-full text-xs text-[var(--color-ink-soft)] underline"
        >
          {mode === "login" ? "はじめての方はこちら" : "すでに登録している方はこちら"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
        パスワードはありません。端末の顔認証・指紋・画面ロックでそのまま入れます。
        こちらが預かるのは公開鍵だけで、秘密の情報は端末から出ません。
      </p>

      {demoAvailable && (
        <form action="/api/auth/demo" method="post" className="border-t border-[var(--color-line)] pt-5">
          <button type="submit" className="text-xs text-[var(--color-ink-soft)] underline">
            （開発用）パスキーなしで、みずいろとして入る
          </button>
        </form>
      )}
    </div>
  );
}
