# 今日の横浜映画

横浜駅、桜木町、みなとみらい、関内、伊勢佐木町周辺の公式上映スケジュールを横断して、「今日、今から観られる映画」を確認する個人用サイトです。

[サイトを開く](https://yokohama-cinema-schedule.pages.dev)

## 現在できること

- 9館・7日分を、縦の時間軸と横スワイプの映画館枠で見る番組表
- 当日は、初期描画から1分単位の現在時刻位置を即座に表示
- 日付とエリアで絞り込み
- 上映時間・上映作品・映画館を切り替えるスマートフォン向けサイドバー
- 映画館一覧で徒歩・電車・バス・自転車を館ごとに選択してD1へ保存
- 一度有効にした現在地の自動取得設定をD1で端末間共有し、移動時間と間に合う上映を自動反映
- 公式画像と作品名だけの作品一覧
- スターした好みの作品をD1へ保存し、操作位置を保ったまま番組表でも強調
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

## 移動時間の目安

映画館ごとに徒歩・電車・バス・自転車を選び、選択内容をD1へ保存します。現在地を
取得すると、直線距離へ移動方法別の道路係数、速度、駅や停留所へのアクセス・待ち
時間を加えた目安を算出します。開始60分以内で、移動時間に準備10分を加えても間に
合う上映を緑色で強調します。

日本国内の公共交通をGoogle Maps Routes APIから安定して取得できないため、電車・
バスも実経路ではなく目安です。正確な公共交通時刻が必要になった場合は、NAVITIME
APIや駅すぱあとWebサービスへ経路計算部分を差し替えます。

「現在地」を一度押すと、自動取得を有効にしたことだけをD1へ保存します。以後は別の
端末で開いた場合も現在地を自動取得し、映画館までの目安時間を反映します。ブラウザの
位置情報利用許可は端末ごとに必要です。「自動取得を停止」すると共有設定を無効にし、
その端末で取得済みの経路表示も消去します。

緯度・経度はブラウザから経路APIへ送信する1回のリクエストにのみ使用し、D1や
ブラウザストレージには保存しません。D1へ保存するのは自動取得の有効・無効と、
映画館ごとの移動方法だけです。これらの設定はプライベートモードでのみ保存・返却
します。

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

型検査、単体テスト、プロダクションビルドを順に実行します。
