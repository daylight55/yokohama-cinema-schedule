# 作品タイトルの確認・修正

2026-09-27、横浜ブルク13の予定表に `【INFINITY VISION・SCREENX with DolbyAtmos・字幕】アベンジャーズ／エンドゲーム：ア` と記載されていた。CSS省略ではなく取得したHTML本文自体が短い。同じ要素からリンクされた `cinema_detail/C5089` の `.carosuel-header` は `アベンジャーズ／エンドゲーム：アンコール`。英題 `Avengers: Endgame Encore`、配給公式リンクも一致した。

- 詳細: https://tjoy.jp/yokohama_burg13/cinema_detail/C5089
- 配給公式: https://marvel.disney.co.jp/movie/avengers-doomsday/news/20260730_01

取得元見出しだけを作品識別に使うと、短縮表記・上映方式違いから別作品キーが作られる。`data/movie-title-corrections/2026-09-27.json` の取得元、作品ID、確認済み表記の三条件で補正する。別IDや未確認表記は推測補完しない。追加の映画館リクエストは不要。

T・ジョイの先頭【…】の無条件削除もやめ、共通の上映方式正規化を使用する。意味のある【前編】等は残す。INFINITY VISION／インフィニティビジョンは上映方式として扱い、タイトルから除いた情報は `format` に残す。旧キーのハッシュURLは正式キーに読み替える。

## 既存データの補正

事前スナップショットから、修正SQLだけを生成する。実行は別コマンド。上映IDの構造、キー、取得元、表記を検証し、対象外データを渡した場合は中止する。

```sh
npx wrangler d1 execute yokohama-cinema-schedule --remote --json --command "SELECT s.*,c.name AS cinema_name,c.short_name AS cinema_short_name FROM showings s JOIN cinemas c ON c.id=s.cinema_id WHERE s.movie_key IN ('アベンジャーズエンドゲーム:ア','インフィニティビジョンアベンジャーズエンドゲーム:アンコール','アベンジャーズエンドゲーム:アンコール')" > /tmp/movie-title-before.json
node --experimental-strip-types scripts/repair-movie-titles.mjs /tmp/movie-title-before.json > /tmp/movie-title-repair.sql
# 内容を確認後に適用
npx wrangler d1 execute yokohama-cinema-schedule --remote --file /tmp/movie-title-repair.sql
```

SQLは上映ID、作品キー、タイトル、上映方式と検索インデックスを更新する。時刻、予約URL、画像は維持し、鑑賞予定・はしご予定の参照も移行する。ユーザーの作品設定は最新の更新時刻のレコードを採用し、同時刻なら既存の正式キーを優先する。予約状態は維持する。参照先IDが衝突する場合は制約違反として停止するため、実行前に対象データを確認する。

検証は `test/movie-title-corrections.test.ts`。実HTMLの最小fixture、未確認タイトルの保持、上映方式、旧ハッシュ、SQLite上の検索・予約・作品設定の移行と再適用を確認する。CLIはNode 22.6以降の `--experimental-strip-types` を使用する。

## 2026-09-27 再発への対応

補正済みWorkerの後に補正を含まないブランチがデプロイされ、定期収集で短縮名が再登録された。最新の本番機能を含むコミットへ補正を統合し、通常の開発チェックアウトにも同じ修正を反映する。公開済みの修正を含まない古いブランチから再デプロイしないこと。

最新スキーマでは紹介文・クレジット・あらすじ・調査キューがタイトル調査を参照するため、これらを正式キーへ移行してから旧キーを削除する。正式キーの既存情報を優先する。旧表記を含むタイトルカタログも除去し、再インポートによる復活を防ぐ。外部キー制約を有効にした回帰テストで検証する。
