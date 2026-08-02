// パスキーの登録とログインを、仮想認証器を使って通しで確かめる。
//   npm run build && npm run start してから node scripts/e2e-passkey.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await context.newPage();

// Chrome の仮想認証器。実際の指紋や顔認証の代わりになる。
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

const handle = `テスト${Date.now().toString(36).slice(-4)}`;
const step = (name) => console.log(`  ✓ ${name}`);

// ── 新規登録 ────────────────────────────────────────────────
await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
assert.ok(await page.getByText("顔写真もチャットもありません").isVisible());
step("未ログインだと /signin が出る");

await page.getByText("はじめての方はこちら").click();
await page.locator("#handle").fill(handle);
await page.getByRole("button", { name: "パスキーを作る" }).click();
await page.waitForURL("**/diagnostic", { timeout: 15000 });
step("パスキーを作ると診断に進む");

const credentials = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
assert.equal(credentials.credentials.length, 1, "認証器に鍵が1つ保存されている");
step("端末側に鍵が残っている（次回は名前の入力が要らない）");

// ── 診断 ────────────────────────────────────────────────────
for (let i = 1; i <= 12; i++) {
  await page.locator(`input[name="q${i}"][value="${(i % 5) + 1}"]`).check({ force: true });
}
await page.getByRole("button", { name: "かたちを作る" }).click();
await page.waitForURL("**/profile", { timeout: 15000 });
step("診断を終えるとプロフィールに進む");

// ── 属性 ────────────────────────────────────────────────────
if (!(await page.locator("#birthYear").count())) {
  console.error("=== /profile が期待通りに描画されていない ===");
  console.error("URL:", page.url());
  console.error((await page.content()).slice(0, 1500));
  process.exit(1);
}
await page.locator("#birthYear").selectOption(String(new Date().getFullYear() - 28));
await page.locator("#region").selectOption("東京都");
await page.locator('input[name="gender"][value="female"]').check({ force: true });
await page.locator('input[name="prefGenders"][value="male"]').check({ force: true });
await page.locator("#tags").fill("銭湯 積読");
await page.getByRole("button", { name: "保存する" }).click();
await page.waitForURL("**/discover", { timeout: 15000 });
step("属性を保存すると、さがすに進む");

const cards = await page.locator("li:has-text('もっと知りたい')").count();
assert.ok(cards > 0, "条件に合う候補が出る");
step(`条件の合う候補が ${cards} 件出た`);

// ── ログアウトして、名前を打たずに入り直す ──────────────────
await page.getByRole("button", { name: "出る" }).click();
await page.waitForURL("**/signin", { timeout: 15000 });
step("出るとログアウトされる");

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
assert.ok(page.url().includes("/signin"), "未ログインで / を開くと /signin に飛ぶ");
step("ログインしていないとアプリの中に入れない");

await page.getByRole("button", { name: "パスキーで入る" }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/signin"), { timeout: 15000 });
step("名前を入力せずにパスキーだけで入り直せた");

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
assert.ok(await page.getByText(handle).first().isVisible(), "同じアカウントに戻っている");
step(`${handle} として戻れている`);

await browser.close();
console.log("\nパスキーの通し確認: すべて成功\n");
