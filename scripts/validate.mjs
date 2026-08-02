#!/usr/bin/env node
// 設定の整合性チェッカ。依存ゼロ。
//   node scripts/validate.mjs        エラー / 警告を表示
//   node scripts/validate.mjs -v     未検証 (verified:false) の事実も一覧表示

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "data", name), "utf8"));

const persona = load("persona.json");
const { locations } = load("locations.json");
const { items } = load("wardrobe.json");
const { devices, shooting_defaults } = load("gear.json");
const { posts } = load("posts.json");

const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
const locMap = byId(locations);
const itemMap = byId(items);
const gearMap = byId(devices);

const problems = [];
const err = (scope, msg) => problems.push({ level: "ERROR", scope, msg });
const warn = (scope, msg) => problems.push({ level: "WARN", scope, msg });

const seasonOf = (dateStr) => {
  const m = Number(dateStr.slice(5, 7));
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
};
const seasonJa = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const daysBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

// 営業時間は "24h" か "HH:MM-HH:MM"。曜日別キーがあれば最初に見つかったものを使う。
function withinOpenHours(open, time) {
  if (!open || !time) return true;
  const spec = Object.values(open)[0];
  if (!spec || spec === "24h") return true;
  const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(spec);
  if (!m) return true;
  const [, from, to] = m;
  const t = toMin(time);
  return toMin(from) <= toMin(to)
    ? t >= toMin(from) && t <= toMin(to)
    : t >= toMin(from) || t <= toMin(to); // 日をまたぐ営業
}

// ---- 投稿ごとのチェック -------------------------------------------------

const isLive = (p) => p.status === "ready" || p.status === "published";

for (const p of posts) {
  const at = `${p.id} (${p.date})`;

  const loc = locMap.get(p.location_id);
  if (!loc) {
    err(at, `存在しないロケーション: ${p.location_id}`);
  } else {
    if (!loc.photo_allowed) err(at, `撮影不可のロケーション「${loc.name}」を使っている`);
    if (!withinOpenHours(loc.open_hours, p.time))
      err(at, `「${loc.name}」の営業時間外 (${p.time})`);
    if (!loc.verified && isLive(p))
      err(at, `ロケーション「${loc.name}」が未検証 (verified:false) のまま公開されようとしている`);
  }

  const gear = gearMap.get(p.gear_id);
  if (!gear) {
    err(at, `存在しない機材: ${p.gear_id}`);
  } else {
    if (gear.acquired_date && p.date < gear.acquired_date)
      err(at, `${gear.model} の入手 (${gear.acquired_date}) より前の日付で使われている`);
    if (p.exif) {
      const focals = gear.lenses.map((l) => l.focal_length_mm);
      if (p.exif.focal_length_mm != null && !focals.includes(p.exif.focal_length_mm))
        err(at, `${gear.model} に ${p.exif.focal_length_mm}mm は存在しない (利用可能: ${focals.join("/")}mm)`);
      if (p.exif.aspect && !gear.aspect_ratios.includes(p.exif.aspect))
        err(at, `${gear.model} は ${p.exif.aspect} で撮れない (利用可能: ${gear.aspect_ratios.join(", ")})`);
      if (gear.iso_range && p.exif.iso != null) {
        const [lo, hi] = gear.iso_range;
        if (p.exif.iso < lo || p.exif.iso > hi)
          err(at, `ISO ${p.exif.iso} は ${gear.model} の範囲外 (${lo}-${hi})`);
      }
    }
  }

  const season = seasonOf(p.date);
  for (const id of p.outfit) {
    const item = itemMap.get(id);
    if (!item) {
      err(at, `存在しないアイテム: ${id}`);
      continue;
    }
    const label = `${item.brand} ${item.product ?? ""}`.trim();
    if (item.release_date && p.date < item.release_date)
      err(at, `${label} は発売前 (発売 ${item.release_date})`);
    if (item.acquired_date && p.date < item.acquired_date)
      err(at, `${label} は入手前 (入手 ${item.acquired_date})`);
    if (item.retire_date && p.date > item.retire_date)
      err(at, `${label} は手放した後 (手放し ${item.retire_date})`);
    if (item.seasons?.length && !item.seasons.includes(season))
      err(at, `${label} は${seasonJa[season]}に着るものではない (対応: ${item.seasons.map((s) => seasonJa[s]).join("/")})`);
    if (!item.verified && isLive(p))
      err(at, `${label} が未検証 (verified:false) のまま公開されようとしている`);
  }

  // カテゴリの抜け（自宅では靴を履いていないのが自然なので除外）
  const atHome = loc?.type === "home";
  const cats = new Set(p.outfit.map((id) => itemMap.get(id)?.category));
  for (const need of atHome ? ["tops", "bottoms"] : ["tops", "bottoms", "shoes"]) {
    if (!cats.has(need)) warn(at, `コーデに ${need} がない`);
  }

  // 平日 / 休日と服のモード（自宅は部屋着なので対象外）
  const dow = new Date(`${p.date}T00:00:00Z`).getUTCDay(); // 0=日
  const isWeekend = dow === 0 || dow === 6;
  if (!atHome) {
    for (const id of p.outfit) {
      const item = itemMap.get(id);
      if (!item?.mode || item.mode === "both") continue;
      if (item.mode === "weekday" && isWeekend)
        warn(at, `${item.brand} ${item.product ?? ""} は通勤服だが休日に着ている`);
      if (item.mode === "weekend" && !isWeekend)
        warn(at, `${item.brand} ${item.product ?? ""} は休日服だが平日に外で着ている`);
    }
  }

  // 平日の勤務時間中に外にいないか
  const work = persona.occupation?.schedule?.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
  if (work && !isWeekend && p.time && !atHome) {
    const [, from, to] = work;
    const t = toMin(p.time.padStart(5, "0"));
    if (t >= toMin(from.padStart(5, "0")) && t <= toMin(to.padStart(5, "0")))
      err(at, `平日の勤務時間中 (${from}-${to}) に社外にいる`);
  }

  if (p.hashtags && p.hashtags.length > 5)
    err(at, `ハッシュタグが${p.hashtags.length}個。Instagram の上限は5個（2025-12〜）`);

  if (!p.ai_label) {
    if (isLive(p)) err(at, "AI生成の表示 (ai_label) がないまま公開されようとしている");
    else warn(at, "ai_label が false");
  }
  if (p.pr && !/#PR|＃PR|広告|タイアップ|プロモーション/i.test(p.caption ?? ""))
    err(at, "PR投稿だが caption に広告表記がない（景表法ステマ規制）");
}

// ---- 投稿をまたぐチェック ------------------------------------------------

// 同日に離れた場所にいないか
const byDate = new Map();
for (const p of posts) {
  if (!byDate.has(p.date)) byDate.set(p.date, []);
  byDate.get(p.date).push(p);
}
for (const [date, ps] of byDate) {
  const cities = new Set(ps.map((p) => locMap.get(p.location_id)?.city).filter(Boolean));
  if (cities.size > 1) err(date, `同じ日に複数の都市にいる: ${[...cities].join(" / ")}`);

  const timed = ps.filter((p) => p.time).sort((a, b) => a.time.localeCompare(b.time));
  for (let i = 1; i < timed.length; i++) {
    const [prev, cur] = [timed[i - 1], timed[i]];
    if (prev.location_id === cur.location_id) continue;
    const gap = toMin(cur.time) - toMin(prev.time);
    const need =
      (locMap.get(prev.location_id)?.access_from_home_min ?? 0) +
      (locMap.get(cur.location_id)?.access_from_home_min ?? 0);
    if (need > gap)
      err(date, `${prev.id} → ${cur.id} の移動が時間的に不可能 (${gap}分しかないが約${need}分かかる)`);
  }
}

// 着回しの自然さ
const wearCount = new Map(items.map((i) => [i.id, 0]));
const outfitSeen = new Map();
for (const p of [...posts].sort((a, b) => a.date.localeCompare(b.date))) {
  for (const id of p.outfit) wearCount.set(id, (wearCount.get(id) ?? 0) + 1);
  // 自宅の部屋着は繰り返すのが自然なので対象外
  if (locMap.get(p.location_id)?.type === "home") continue;
  const key = [...p.outfit].sort().join("+");
  const prev = outfitSeen.get(key);
  if (prev && daysBetween(prev.date, p.date) < 90)
    warn(p.id, `${prev.id} と完全に同じコーデ (${Math.round(daysBetween(prev.date, p.date))}日差)`);
  outfitSeen.set(key, p);
}
if (posts.length >= 10) {
  const once = items.filter((i) => wearCount.get(i.id) === 1);
  if (once.length > items.length / 2)
    warn("wardrobe", `${once.length}/${items.length} 点が1回しか着られていない。着回しがないのは不自然。`);
}

// 完成度の分布（docs/shooting-guide.md）——全部が決まっているのが一番不自然
const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
if (recent.length >= 5) {
  const n = (v) => recent.filter((p) => p.completion === v).length;
  if (n("rough") === 0)
    warn("completion", `直近${recent.length}投稿に「雑」な枚が1枚もない。全部が決まっているのが一番不自然。`);
  if (n("polished") > Math.ceil(recent.length * 0.4))
    warn("completion", `直近${recent.length}投稿のうち「決まっている」が${n("polished")}枚。多すぎる（目安は3割）。`);
  const unset = recent.filter((p) => !p.completion).length;
  if (unset) warn("completion", `completion が未設定の投稿が${unset}件`);
}

// 投稿間隔
const dates = [...new Set(posts.map((p) => p.date))].sort();
for (let i = 1; i < dates.length; i++) {
  const gap = daysBetween(dates[i - 1], dates[i]);
  if (gap > 21) warn("cadence", `${dates[i - 1]} → ${dates[i]} で${Math.round(gap)}日空いている`);
}

// ---- 出力 ---------------------------------------------------------------

const verbose = process.argv.includes("-v") || process.argv.includes("--verbose");

if (verbose) {
  const unverified = [
    ...locations.filter((l) => l.real && !l.verified).map((l) => `location  ${l.id}  ${l.name}`),
    ...items.filter((i) => !i.verified).map((i) => `wardrobe  ${i.id}  ${i.brand} ${i.product ?? ""}`),
    ...devices.filter((d) => !d.verified).map((d) => `gear      ${d.id}  ${d.brand} ${d.model}`),
  ];
  console.log(`\n未検証の事実 (${unverified.length}件) — 使う前に一次情報で裏を取ること`);
  for (const u of unverified) console.log(`  ${u}`);
}

if (persona._draft) {
  console.log("\nペルソナは _draft:true。確定したら data/persona.json の _draft を false にする。");
}

const errors = problems.filter((p) => p.level === "ERROR");
const warns = problems.filter((p) => p.level === "WARN");

console.log("");
for (const p of [...errors, ...warns]) {
  console.log(`  ${p.level === "ERROR" ? "ERROR" : "WARN "}  ${p.scope}  ${p.msg}`);
}
console.log(
  `\n${posts.length}投稿 / ${items.length}アイテム / ${locations.length}ロケーション を検査 → ` +
    `エラー ${errors.length}件, 警告 ${warns.length}件\n`
);

process.exit(errors.length > 0 ? 1 : 0);
