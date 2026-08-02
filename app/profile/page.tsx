import { requireViewer } from "@/lib/viewer";
import { readDb } from "@/lib/store";
import { saveProfile } from "../actions";
import { BIO_LIMIT, MAX_TAGS } from "@/lib/limits";
import { Shape } from "@/components/Shape";
import { AXES, describeAxis } from "@/lib/axes";
import { AXIS_IDS, GENDERS, GENDER_LABELS, ageOf } from "@/lib/types";
import { REGIONS } from "@/lib/regions";

// ファイルストアを直接読むため、Next からは変化が見えない。明示的に動的にする。
export const dynamic = "force-dynamic";

const THIS_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 63 }, (_, i) => THIS_YEAR - 18 - i);
const AGES = Array.from({ length: 63 }, (_, i) => 18 + i);

const field = "w-full rounded-lg border border-[var(--color-line)] bg-transparent p-3 text-[15px] outline-none focus:border-[var(--color-accent)]";

export default async function ProfilePage() {
  const me = await requireViewer();
  const db = await readDb();

  const counts = new Map<string, number>();
  for (const u of db.users) for (const t of u.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const popular = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 18);

  return (
    <div className="space-y-9">
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

      <form action={saveProfile} className="space-y-9">
        {/* ── 自分のこと ─────────────────────────── */}
        <section className="space-y-5">
          <h2 className="text-sm">あなたのこと</h2>

          <div className="space-y-2">
            <label htmlFor="bio" className="block text-xs text-[var(--color-ink-soft)]">
              ひとこと
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={2}
              maxLength={BIO_LIMIT}
              defaultValue={me.bio}
              placeholder="何をしている人か、ではなく、どんな時間を過ごしているか。"
              className={`${field} resize-none leading-relaxed placeholder:text-[var(--color-ink-soft)]/60`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="birthYear" className="block text-xs text-[var(--color-ink-soft)]">
                生まれた年
              </label>
              <select id="birthYear" name="birthYear" defaultValue={me.birthYear ?? ""} required className={field}>
                <option value="" disabled>選択</option>
                {BIRTH_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}年（{THIS_YEAR - y}歳）
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="region" className="block text-xs text-[var(--color-ink-soft)]">
                住んでいる場所
              </label>
              <select id="region" name="region" defaultValue={me.region ?? ""} required className={field}>
                <option value="" disabled>選択</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-[var(--color-ink-soft)]">
            生年月日ではなく年だけ、市区町村ではなく都道府県だけを持ちます。特定に繋がる情報は集めません。
          </p>

          <fieldset className="space-y-2">
            <legend className="text-xs text-[var(--color-ink-soft)]">性別</legend>
            <div className="flex gap-1.5">
              {GENDERS.map((g) => (
                <label
                  key={g}
                  className="flex-1 cursor-pointer rounded-md border border-[var(--color-line)] px-2 py-2.5 text-center text-xs text-[var(--color-ink-soft)] has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent)]/10 has-[:checked]:text-[var(--color-ink)]"
                >
                  <input type="radio" name="gender" value={g} defaultChecked={me.gender === g} required className="sr-only" />
                  {GENDER_LABELS[g]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="tags" className="block text-xs text-[var(--color-ink-soft)]">
              タグ（{MAX_TAGS}個まで）
            </label>
            <input id="tags" name="tags" defaultValue={me.tags.join(" ")} placeholder="銭湯 積読 散歩" className={field} />
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
        </section>

        {/* ── 相手に求めること ───────────────────── */}
        <section className="space-y-5 border-t border-[var(--color-line)] pt-8">
          <div className="space-y-1">
            <h2 className="text-sm">出会いたい相手</h2>
            <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
              条件が合うのは、お互いが相手を候補に入れているときだけです。
              絞り込みはここまでで、これ以外の条件検索はありません。
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs text-[var(--color-ink-soft)]">性別（複数可）</legend>
            <div className="flex gap-1.5">
              {GENDERS.map((g) => (
                <label
                  key={g}
                  className="flex-1 cursor-pointer rounded-md border border-[var(--color-line)] px-2 py-2.5 text-center text-xs text-[var(--color-ink-soft)] has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent)]/10 has-[:checked]:text-[var(--color-ink)]"
                >
                  <input
                    type="checkbox"
                    name="prefGenders"
                    value={g}
                    defaultChecked={me.preference.genders.includes(g)}
                    className="sr-only"
                  />
                  {GENDER_LABELS[g]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <span className="block text-xs text-[var(--color-ink-soft)]">年齢</span>
            <div className="flex items-center gap-2">
              <select name="ageMin" defaultValue={me.preference.ageMin} className={field}>
                {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <span className="text-sm text-[var(--color-ink-soft)]">〜</span>
              <select name="ageMax" defaultValue={me.preference.ageMax} className={field}>
                {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <span className="shrink-0 text-sm text-[var(--color-ink-soft)]">歳</span>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs text-[var(--color-ink-soft)]">場所</legend>
            <div className="flex gap-1.5">
              {[
                { value: "any", label: "どこでも" },
                { value: "same", label: `${me.region ?? "同じ都道府県"}のみ` },
              ].map((o) => (
                <label
                  key={o.value}
                  className="flex-1 cursor-pointer rounded-md border border-[var(--color-line)] px-2 py-2.5 text-center text-xs text-[var(--color-ink-soft)] has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent)]/10 has-[:checked]:text-[var(--color-ink)]"
                >
                  <input
                    type="radio"
                    name="regionScope"
                    value={o.value}
                    defaultChecked={me.preference.regionScope === o.value}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <button type="submit" className="rounded-full bg-[var(--color-ink)] px-6 py-2.5 text-sm text-[var(--color-paper)]">
          保存する
        </button>
      </form>

      <p className="text-xs text-[var(--color-ink-soft)]">
        いまの登録: {ageOf(me.birthYear) ?? "—"}歳 ／ {me.region ?? "—"} ／{" "}
        {me.gender ? GENDER_LABELS[me.gender] : "—"}
      </p>
    </div>
  );
}
