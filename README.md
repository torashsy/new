# new — AI インフルエンサー設定リポジトリ

架空のインフルエンサー1人分の設定を、**破綻しないレベルまで作り込む**ためのリポジトリ。

## 何を解決するのか

AI インフルエンサーが「作り物っぽい」と見抜かれる原因は、画像の品質ではなく **設定の破綻** であることがほとんど。

- 3月の東京で半袖を着ている
- 発売前のスニーカーを履いている
- 同じ日の投稿で渋谷と京都にいる
- iPhone で撮ったはずの写真の EXIF 焦点距離が 85mm
- 服を一度も着回さない（実在の人間は必ず着回す）

これらは全部「データの整合性エラー」であって、感覚で防げるものではない。
なのでこのリポジトリでは設定を **構造化データ (`data/*.json`) として持ち、`npm run validate` で機械的に検証する**。

散文の設定資料 (`docs/`) は世界観と語り口のためのもので、事実関係の正は常に `data/` にある。

## 構成

```
data/       設定の正 (single source of truth)
  persona.json     人物そのもの
  locations.json   実在ロケーション台帳
  wardrobe.json    実在の服・アクセサリー台帳
  gear.json        スマホ / カメラと撮影設定
  posts.json       投稿ログ（整合性チェックの対象）
schemas/    data/ の JSON Schema（エディタ補完 + 構造検証）
scripts/    validate.mjs — 整合性チェッカ（依存ゼロ）
docs/       散文の設定資料
  persona-bible.md      キャラクターバイブル
  consistency-rules.md  破ってはいけないルール
  shooting-guide.md     撮影・生成の設定
  compliance.md         AI開示・法令まわり
  workflow.md           1投稿を出すまでの運用フロー
```

## 使い方

```bash
npm run validate        # 全整合性チェック
npm run validate -- -v  # 未検証 (verified:false) の事実も一覧表示
```

エラーが1件でもあれば投稿しない、を運用ルールにする。

## `verified` フラグについて

`data/` に書く「実在のもの」は、すべて `verified` と `source` を持つ。

```json
{ "name": "...", "verified": false, "source": null }
```

- `verified: false` = **まだ裏取りしていない仮置き**。この状態のものを投稿に使ってはいけない。
- 裏取り（公式サイト・製品ページ・営業時間の一次情報）をしたら `verified: true` にして `source` に URL を入れる。

実在のものを扱う以上、「たぶんこうだったはず」で書いた設定が一番の事故要因になる。
初期データはすべて `verified: false` の**たたき台**なので、使う前に必ず裏を取ること。
