# 今日の横浜映画

横浜駅、桜木町、みなとみらい、関内、伊勢佐木町周辺の公式上映スケジュールを横断して、「今日、今から観られる映画」を確認する個人用サイトです。

[サイトを開く](https://yokohama-cinema-schedule.pages.dev)

## 現在できること

- 8館・7日分を、縦の時間軸と横スワイプの映画館枠で見る番組表
- 当日は、ページを開いた時点の現在時刻まで自動スクロール
- 日付とエリアで絞り込み
- 任意で現在地を取得し、映画館ごとの電車・徒歩時間を一覧表示して間に合う上映を強調
- 公式画像と作品名だけの作品一覧
- スターした好みの作品をD1へ保存し、番組表でも強調
- 公式予約ページへのリンク
- 映画館ごとの取得失敗を隔離し、前回正常データを保持
- D1の映画館ごとの有効終了日を使い、閉館後は収集・表示対象から除外
- Pages全体をパスワードと署名済みHttpOnly Cookieで保護
- 公開モードでは許諾済みソースだけを返す

取得URLと解析方法は [docs/sources.md](docs/sources.md) にまとめています。

## 構成

[![横浜映画館スケジュールのCloudflareアーキテクチャ](docs/architecture/cloudflare-architecture.svg)](docs/architecture/cloudflare-architecture.drawio)

[編集用draw.ioファイル](docs/architecture/cloudflare-architecture.drawio) /
[図のソースとアイコンについて](docs/architecture/README.md)

Workerは日本時間の0時・6時・9時・12時・15時・18時・21時台に実行する設定です。

### 映画館の有効期間

`cinemas.active_until`に`YYYY-MM-DD`形式で最終営業日を保存します。終了日は
範囲に含まれ、その翌日から収集、上映API、経路API、取得状態APIの対象外になります。
`NULL`は終了予定なしを表します。

静的な映画館一覧の終了日は初回登録時のデフォルトです。以後のWorker実行では
D1の`active_until`を上書きしないため、閉館予定が変わった場合はD1の値を更新します。

## ローカル起動

Node.js 22以降を推奨します。

```bash
npm install
cp .dev.vars.example .dev.vars
cp worker/.dev.vars.example worker/.dev.vars
npm run db:migrate:local
```

ターミナル1で収集Workerを起動します。

```bash
npm run worker:dev
```

別ターミナルから、`worker/.dev.vars`のトークンで初回取得を実行します。

```bash
curl -X POST http://localhost:8787/refresh \
  -H "Authorization: Bearer replace-with-a-long-random-token"
```

ターミナル2でPagesを起動します。

```bash
npm run pages:dev
```

## Cloudflareへデプロイ

1. Wranglerへログインします。

   ```bash
   npx wrangler login
   ```

2. D1を作成し、表示されたIDを`wrangler.jsonc`と`worker/wrangler.jsonc`の`database_id`へ設定します。

   ```bash
   npx wrangler d1 create yokohama-cinema-schedule
   npm run db:migrate:remote
   ```

3. Pagesプロジェクトを一度作成した後、秘密情報を登録します。

   ```bash
   npx wrangler pages project create yokohama-cinema-schedule
   npx wrangler pages secret put APP_PASSWORD
   npx wrangler pages secret put SESSION_SECRET
   npx wrangler pages secret put GOOGLE_MAPS_API_KEY
   ```

4. Workerの手動実行トークンを登録します。

   ```bash
   npx wrangler secret put WORKER_TRIGGER_TOKEN --config worker/wrangler.jsonc
   ```

5. PagesとWorkerをデプロイします。

   ```bash
   npm run pages:deploy
   npm run worker:deploy
   ```

`APP_PASSWORD`は長いランダム文字列、`SESSION_SECRET`は32バイト以上のランダム値を推奨します。`robots`指定だけに依存せず、`*.pages.dev`を含む全リクエストをPages Functionsのミドルウェアで保護します。独自ドメインを追加する場合は、さらにCloudflare Accessのメール許可リストを重ねられます。

## 経路検索

Google Maps PlatformでRoutes APIを有効にし、PagesのSecret
`GOOGLE_MAPS_API_KEY`を設定すると、現在地から全映画館までの公共交通経路を
`computeRouteMatrix`で一括計算します。映画館ごとの電車・徒歩時間を一覧表示し、
開始60分以内で移動時間に10分の余裕を加えても間に合う上映を緑色で強調します。

Google Mapsのキーを設定しない場合は、OpenRouteService互換のMatrix API、
それも未設定の場合は直線距離に道路係数を掛けた徒歩時間の目安へフォールバック
します。フォールバック使用中は画面にも「徒歩目安」と表示します。

- `ROUTE_MATRIX_API_URL`
- `ROUTE_MATRIX_API_KEY`

位置情報はブラウザから経路APIへ送信する1回のリクエストにのみ使用し、D1には保存しません。

## 作品画像とスター

作品画像は各映画館の公式スケジュールまたは公式上映作品一覧から取得します。
公式ページに画像がない作品にはプレースホルダーを表示します。

現在は単一オーナー向けのプライベートサイトのため、スターは
`movie_preferences`にサイト共通の好みとして保存します。公開モードでは
好みを返さず、スター更新APIも無効化します。複数ユーザー対応時はこのテーブルへ
ユーザーIDを追加して分離します。

## 検証

```bash
npm run ci:pr
```

型検査、29件以上の単体テスト、プロダクションビルドを順に実行します。
