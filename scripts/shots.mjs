// 画面を撮る。 node scripts/shots.mjs
// 事前に npm run build && npm run start を上げておくこと。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "shots";
mkdirSync(OUT, { recursive: true });

// このコンテナには Chromium が入っているが、playwright が期待するビルド番号と
// ずれているので実行ファイルを直接指す。
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});

const shot = async (name, url, prepare) => {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  if (prepare) await prepare();
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`${name}  ${url}`);
};

// パスキーなしでは中に入れないので、まず開発用の入口でログインする
await shot("0-signin", "/signin");
await page.getByRole("button", { name: /みずいろとして入る/ }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/signin"), { timeout: 15000 });

await shot("1-today", "/");
await shot("2-diagnostic", "/diagnostic");
await shot("3-discover", "/discover");
await shot("4-profile", "/profile");
await shot("4b-user", "/u/%E3%81%97%E3%81%9A%E3%81%8F");

// 通報・ブロックを開いた状態
await shot("5-safety", "/u/%E3%81%97%E3%81%9A%E3%81%8F", async () => {
  await page.locator("summary").click();
  await page.waitForTimeout(150);
});

// つながりを1件作ってから、交換の画面まで進む
await page.goto(`${BASE}/discover`, { waitUntil: "networkidle" });
await page.locator('button:has-text("（デモ）相手からも送られた状態にする")').first().click();
await page.waitForLoadState("networkidle");
await page.locator('button:has-text("もっと知りたい")').first().click();
await page.waitForLoadState("networkidle");
await shot("6-connections", "/connections");

await page.goto(`${BASE}/connections`, { waitUntil: "networkidle" });
await page.locator("form button.question").first().click();
await page.waitForLoadState("networkidle");
await page.locator('textarea[name="body"]').fill("見返りを期待していないことが伝わったとき");
await page.locator('button:has-text("答える")').click();
await page.waitForLoadState("networkidle");
await page.locator('input[name="body"]').fill("困っているときに、理由を聞かずに動いてくれた人");
await page.locator('button:has-text("入れる")').click();
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/7-exchange.png`, fullPage: true });
console.log("7-exchange  （二人とも答えて開いた状態）");

await browser.close();
