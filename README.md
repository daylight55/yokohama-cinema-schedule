# はまむび！

横浜駅、桜木町、みなとみらい、関内、伊勢佐木町周辺の公式上映スケジュールを横断して、「今日、今から観られる映画」を確認する個人用サイトです。

[サイトを開く](https://yokohama-cinema-schedule.pages.dev)

## 現在できること

- 10館・7日分を、縦の時間軸と横スワイプの映画館枠で見る番組表
- 上映時間画面を左右にスワイプして日付を切り替え
- 当日は、初期描画から1分単位の現在時刻位置を即座に表示
- 上映時間を1時間単位で折りたたみ、`18:00〜`のような開始時刻で表示。現在の時間帯と次の1時間を自動展開
- 日付とエリアで絞り込み
- 作品ごとのスター・鑑賞済み・興味なしをクラウド保存。鑑賞済み／興味なしの作品は上映時間から非表示
- 作品一覧から映画.comとFilmarksの作品検索へ移動
- 上映時間・上映作品・映画館・マイページを切り替えるスマートフォン向けサイドバー
- 各画面を `#schedule`・`#movies`・`#cinemas`・`#planner`・`#account` のURLで直リンク（`#account`はマイページ、旧`#profile`も同画面へ移動）
- Google OAuthを主認証にし、メールアドレス単位で設定をクラウド共有。パスワードとパスキーを予備のログイン方法として登録
- 1年先まで空いている日と時間を保存し、気になる作品と移動時間を優先した映画はしごを提案
- Google カレンダーの空き時間取得と、保存した映画はしごの予定登録（OAuth設定時）
- スクロール後に現在時刻の上映位置へ戻るスマートフォン向けボタン
- 映画館一覧で移動方法と自分の所要時間を館ごとにD1へ保存
- マイページで自宅を一度GPS登録し、D1の固定位置から移動時間と間に合う上映を反映
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

別ターミナルから、`worker/.dev.vars`のトークンで2つの取得バッチを実行します。
Cloudflare Freeプランの1実行あたり外部リクエスト上限を超えないよう、
映画館を2バッチに分けています。

```bash
curl -X POST "http://localhost:8787/refresh?batch=0" \
  -H "Authorization: Bearer replace-with-a-long-random-token"
curl -X POST "http://localhost:8787/refresh?batch=1" \
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
npx wrangler pages secret put GOOGLE_CLIENT_ID
npx wrangler pages secret put GOOGLE_CLIENT_SECRET
npx wrangler pages secret put GOOGLE_TOKEN_ENCRYPTION_KEY
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

### Google カレンダーOAuth

Google CloudでCalendar APIを有効化し、ウェブアプリケーション用OAuthクライアントを作成します。
承認済みのリダイレクトURIには、ログイン用とカレンダー連携用の本番URLを登録します。

```text
https://yokohama-cinema-schedule.pages.dev/auth/google/login/callback
https://yokohama-cinema-schedule.pages.dev/auth/google/callback
```

ローカルで連携を確認する場合は、利用するポートのcallbackも追加します。

```text
http://localhost:8788/auth/google/login/callback
http://localhost:8788/auth/google/callback
```

OAuthトークンはD1へ平文保存せず、`GOOGLE_TOKEN_ENCRYPTION_KEY`から生成した
AES-GCM鍵で暗号化します。要求する権限は空き時間の参照と、自分が所有する
カレンダーへのイベント登録に限定しています。OAuth秘密情報が未設定の場合も、
映画はしごの提案・保存は利用でき、Google カレンダー連携だけが設定待ち表示になります。

### ユーザー認証

Googleログインでは、検証済みメールアドレスを一意な検索キーとして保存し、
Googleの`sub`を変更されない認証主体IDとして保持します。初回管理者は、従来の
`APP_PASSWORD`でログインしてから`#account`でGoogleアカウントを連携します。
既存の映画設定や自宅、移動時間、はしごプランはその管理者へ引き継がれます。
以降の新規ユーザーは、管理者がメールアドレスを招待リストへ追加してから
Googleログインします。

ユーザーが設定する予備パスワードは暗号化して復元する方式ではなく、
ユーザーごとのランダムsaltとPBKDF2-HMAC-SHA256（600,000回）による不可逆ハッシュ
だけをD1へ保存します。ログインセッションもCookieの生トークンではなく、
SHA-256ハッシュだけをD1へ保存します。パスキーはWebAuthnの端末機能と
`@simplewebauthn/server`を使うため、外部の有料認証サービスは不要です。
パスキーは登録したホスト名に紐づくため、本番運用で独自ドメインへ移す場合は、
ドメイン確定後に登録してください。

## 移動時間の目安

映画館ごとに徒歩・電車・バス・自転車を選び、選択内容をD1へ保存します。
プロフィールで現在地を自宅として一度登録すると、以後はD1に保存した固定位置から
選択した移動方法に応じた目安を算出します。電車ではD1に登録した
石川町駅・伊勢佐木長者町駅を起点候補とし、次の内訳を映画館ごとに合算して短い方を
表示します。

- 自宅登録時に計算・保存した各起点駅までの徒歩時間
- D1に保持した駅間の乗車時間、平均待ち時間、乗換時間
- D1に保持した映画館最寄り駅から映画館までの徒歩時間
- 到着時刻のぶれを吸収する余裕10分

自宅登録時だけGoogle Maps Routes APIで起点2駅までの徒歩時間を取得します。
徒歩APIが利用できない場合は、自宅と駅の直線距離から徒歩時間を推定して保存します。
通常のページ表示や移動方法の変更ではGoogle APIを呼びません。
映画館一覧では、経路案内や実際の体感をもとに「自分の所要時間」を分単位で
上書きできます。設定した時間は一覧表示と「間に合う」判定に優先して使い、
「自動に戻す」で駅徒歩・駅間時間からの自動計算へ戻せます。
開始60分以内の上映のうち、現在時刻＋表示中の移動時間＋20分を中心に前後10分の回を
緑色で強調します。

Google Maps PlatformのRoutes API、Directions API、Distance Matrix APIはいずれも、
横浜周辺の公共交通テストで空結果となったため、駅間時間は2026年7月24日時点の検索
結果と運行間隔をD1に保存しています。実際の乗換は映画館ごとの
「Googleマップで案内」からGoogle マップの画面で確認します。

「Googleマップで案内」は、自宅位置と映画館名・住所、保存した移動方法を指定した
Google マップを開きます。クリック時だけGoogle マップへ自宅位置を渡し、APIキーは
使用しません。

GPSはプロフィールの「現在地を自宅として登録／更新」を押した時だけ使用します。
自宅座標は分単位の所要時間に必要な約10m単位へ丸めてD1に保存し、画面には表示
しません。登録後は別端末でも同じ固定位置を使い、端末ごとの位置情報許可は不要です。
自宅情報はプロフィールから更新・削除でき、プライベートモードでのみ保存・返却
します。ブラウザストレージには保存しません。

上映時間の折りたたみはプロフィールで「なし・30分・1時間」から選べます。
設定は`app_preferences`へ保存し、自宅情報の有無にかかわらず別端末でも共有します。

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
