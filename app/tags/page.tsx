import { getMe } from "@/lib/queries";
import { readDb } from "@/lib/store";
import { saveProfile } from "../actions";
import { BIO_LIMIT, MAX_TAGS } from "@/lib/limits";
import { Shape } from "@/components/Shape";
import { AXES, describeAxis } from "@/lib/axes";
import { AXIS_IDS } from "@/lib/types";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";


export default async function TagsPage() {
  const me = await getMe();
  const db = await readDb();

  // よく使われているタグを候補として出す（新しく作ることもできる）
  const counts = new Map<string, number>();
  for (const u of db.users) for (const t of u.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const popular = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 18);

  return (
    <div className="space-y-8">
      {me.axes && (
        <section className="flex items-center gap-5 rounded-xl border border-[var(--color-line)] p-5">
          <Shape axes={me.axes} seedKey={me.id} size={84} />
          <div className="space-y-1.5">
            <p className="text-sm">これがあなたのかたちです。</p>
            <ul className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
              {AXIS_IDS.map((id) => (
                <li key={id}>
                  {AXES[id].low}⇔{AXES[id].high}：{describeAxis(id, me.axes![id])}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <form action={saveProfile} className="space-y-7">
        <div className="space-y-2">
          <label htmlFor="bio" className="block text-sm">
            ひとこと
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={2}
            maxLength={BIO_LIMIT}
            defaultValue={me.bio}
            placeholder="何をしている人か、ではなく、どんな時間を過ごしているか。"
            className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-transparent p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-accent)]"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="tags" className="block text-sm">
            タグ（{MAX_TAGS}個まで）
          </label>
          <input
            id="tags"
            name="tags"
            defaultValue={me.tags.join(" ")}
            placeholder="銭湯 積読 散歩"
            className="w-full rounded-lg border border-[var(--color-line)] bg-transparent p-3.5 text-[15px] outline-none placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-accent)]"
          />
          <p className="text-xs text-[var(--color-ink-soft)]">
            スペース区切り。珍しいタグほど、一致したときに強く効きます。
          </p>
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {popular.map((t) => (
              <li key={t} className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs text-[var(--color-ink-soft)]">
                #{t}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="submit"
          className="rounded-full bg-[var(--color-ink)] px-6 py-2.5 text-sm text-[var(--color-paper)]"
        >
          保存する
        </button>
      </form>
    </div>
  );
}
