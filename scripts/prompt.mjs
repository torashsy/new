#!/usr/bin/env node
// data/ の設定から画像生成プロンプトを組み立てる。依存ゼロ。
//   node scripts/prompt.mjs post_001
//
// 設定に書いてあることしかプロンプトに入らないので、data/ を直せば出力も直る。
// 逆に data/ にない要素をプロンプトに手で足すと、そこから整合性が壊れる。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (n) => JSON.parse(readFileSync(join(root, "data", n), "utf8"));

const persona = load("persona.json");
const { locations } = load("locations.json");
const { items } = load("wardrobe.json");
const { devices, shooting_defaults } = load("gear.json");
const { posts } = load("posts.json");

const id = process.argv[2];
if (!id) {
  console.error("使い方: node scripts/prompt.mjs <post_id>");
  console.error("利用可能: " + posts.map((p) => p.id).join(", "));
  process.exit(1);
}
const post = posts.find((p) => p.id === id);
if (!post) {
  console.error(`${id} が posts.json にない。利用可能: ${posts.map((p) => p.id).join(", ")}`);
  process.exit(1);
}

const loc = locations.find((l) => l.id === post.location_id);
const gear = devices.find((d) => d.id === post.gear_id);
const outfit = post.outfit.map((i) => items.find((x) => x.id === i)).filter(Boolean);
const missingEn = [];

const en = (obj, label) => {
  if (obj?.en) return obj.en;
  missingEn.push(label);
  return null;
};

// --- 年齢と髪型を投稿日で解決 --------------------------------------------
const ageAt = (() => {
  const b = new Date(persona.birthday);
  const d = new Date(post.date);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
})();

const hair = [...(persona.physical.hair_history ?? [])]
  .filter((h) => post.date >= h.from)
  .sort((a, b) => a.from.localeCompare(b.from))
  .pop();

// --- 光を時刻とロケーションから決める ------------------------------------
function lighting() {
  const t = Number(post.time.slice(0, 2)) * 60 + Number(post.time.slice(3, 5));
  if (loc?.type === "home") {
    if (t >= 420 && t < 540)
      return "early morning direct sunlight through an east-facing window, long hard shadows, warm";
    if (t >= 540 && t < 960)
      return "flat soft indirect daylight, no direct sun (east-facing window, afternoon), neutral white balance";
    if (t >= 960 && t < 1140)
      return "weak indirect daylight fading, slightly warm, low contrast";
    return "ceiling fluorescent light only, around 4000K, hard top-down shadows under the eyes and chin, no daylight at all, mildly green-tinted cast";
  }
  if (t < 600) return "morning daylight, soft";
  if (t < 900) return "midday daylight, fairly hard shadows";
  return "late afternoon daylight, warm and low-angled";
}

// --- 構図 -----------------------------------------------------------------
const compositions = {
  "鏡越しの全身":
    "full-body mirror selfie shot into a white-framed full-length mirror, the phone held at chest height partially covering the lower face, the phone and its yellowed clear case clearly visible",
  "足元・手元のクロップ":
    "tightly cropped shot of the feet and lower legs from above, the ground filling most of the frame, no face visible",
  "日の丸構図の物撮り":
    "object placed dead center in the frame, shot straight down from just above, deliberately unartistic centered framing",
  "窓際の朝の逆光": "backlit against a window, subject partly in silhouette, blown-out highlights around the edges",
  "部屋の引き（超広角）":
    "wide interior shot of a cramped studio apartment, visible barrel distortion and stretching at the frame edges",
  "屋外の全身（セルフタイマー）":
    "full-body outdoor shot taken with a self-timer from a mini tripod placed on the ground, camera positioned low near knee height looking slightly upward",
  "何でもない空・建物": "an unremarkable snapshot of the sky and a building edge, no subject, no intent",
  "ブレ・ピンボケ": "slightly motion-blurred handheld snapshot, focus missed",
};

const completions = {
  polished: "carefully framed using the rule of thirds, level horizon, everything in its place",
  normal: "subject centered with no particular framing intent, level horizon, unremarkable but competent",
  rough: "horizon tilted a few degrees, focus slightly soft, careless framing, the kind of photo someone posts without checking",
};

// --- プロンプト組み立て ---------------------------------------------------
const subject = [
  `a ${ageAt}-year-old Japanese woman`,
  `${persona.physical.height_cm}cm, average build`,
  hair ? en(hair, "persona.hair_history") ?? hair.length : null,
  "front fringe falling into the eyes",
  "no makeup or very light makeup, slightly tired",
].filter(Boolean);

const clothing = outfit.map((i) => en(i, `wardrobe:${i.id}`) ?? `${i.brand} ${i.product ?? ""}`.trim());

const camera = [
  `shot on an ${gear.brand} ${gear.model}`,
  `${post.exif.focal_length_mm}mm equivalent`,
  post.exif.aperture,
  `ISO ${post.exif.iso}`,
  `${post.exif.aspect} aspect ratio`,
  post.exif.iso >= 800 ? "visible sensor noise and smeared shadow detail" : null,
  "smartphone camera look, not a professional camera",
].filter(Boolean);

const positive = [
  `Amateur smartphone photo. ${subject.join(", ")}.`,
  `Wearing: ${clothing.join("; ")}.`,
  `Location: ${en(loc, `location:${loc.id}`) ?? loc.name}.`,
  `Lighting: ${lighting()}.`,
  `Composition: ${compositions[post.composition] ?? post.composition}.`,
  `Execution: ${completions[post.completion] ?? "normal"}.`,
  `Camera: ${camera.join(", ")}.`,
  `Casual snapshot, unedited, no retouching, natural skin texture with visible pores and slight blemishes.`,
].join("\n");

const negative = [
  "professional photography, studio lighting, softbox, beauty retouching, airbrushed skin, glamour",
  "golden hour, sunset light, warm window light" + (loc?.type === "home" && Number(post.time.slice(0, 2)) >= 18 ? " (impossible at night)" : ""),
  "85mm portrait compression, heavy background bokeh, telephoto look",
  "high angle, drone shot, overhead view of a person, third-person view",
  "brand new pristine clothing, crisp unworn fabric, spotless white sneakers",
  "other people's faces, recognizable strangers, readable shop signage, logos, brand names",
  "text, watermark, caption overlay",
  "extra fingers, malformed hands, distorted jewelry",
  "oversaturated, HDR, film grain filter, Lightroom preset look",
].join(", ");

// --- 出力 -----------------------------------------------------------------
const line = "─".repeat(72);
console.log(`\n${line}\n${post.id}  ${post.date}(${post.weekday ?? ""}) ${post.time}  @${loc?.name}\n${line}`);
console.log("\n■ PROMPT\n");
console.log(positive);
console.log("\n■ NEGATIVE PROMPT\n");
console.log(negative);
console.log("\n■ 生成後の目視チェック\n");
for (const c of [
  `${gear.model} で撮れる画か（${gear.lenses.map((l) => l.focal_length_mm).join("/")}mm 以外の画角になっていないか）`,
  loc?.type === "home" && Number(post.time.slice(0, 2)) >= 18
    ? "夜なのに窓から自然光が入っていないか（自宅は東向き＝夕方以降は光源が天井のみ）"
    : "光の向きと時刻が合っているか",
  "服が新品の状態になっていないか（wear_notes の劣化が出ているか）",
  outfit.some((i) => i.category === "accessory" && i.id === "itm_watch")
    ? `腕時計の文字盤が ${post.time} を指しているか`
    : "腕時計が写り込んでいないか（写るなら時刻を合わせる）",
  "他人の顔・店名・ロゴが写っていないか",
  `完成度が「${post.completion}」の水準に収まっているか（作り込みすぎていないか）`,
  "背景の小物が過去の投稿と一致しているか: " + (loc?.recurring_props?.join(" / ") ?? "—"),
].filter(Boolean))
  console.log(`  □ ${c}`);

console.log("\n■ キャプション\n");
console.log(post.caption.split("\n").map((l) => "  " + l).join("\n"));
console.log(`\n  ハッシュタグ: ${post.hashtags?.length ? post.hashtags.join(" ") : "なし"}`);
console.log(`  AI表示: ${post.ai_label ? "あり" : "なし"}`);

if (missingEn.length) {
  console.log(`\n■ 英語表記(en)が未設定 — 日本語で代用した。精度を上げるなら追加すること\n`);
  for (const m of [...new Set(missingEn)]) console.log(`  - ${m}`);
}
console.log("");
