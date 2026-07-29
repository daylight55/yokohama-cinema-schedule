# はまむび！

横浜駅、桜木町、みなとみらい、関内、伊勢佐木町周辺の公式上映スケジュールを横断して、「今日、今から観られる映画」を確認する個人用サイトです。

[サイトを開く](https://yokohama-cinema-schedule.pages.dev)

## 現在できること

- 10館・7日分を、縦の時間軸と横スワイプの映画館枠で見る番組表
- 上映スケジュール・上映作品画面を左右にスワイプして日付を切り替え
- 作品名・映画館名で全文検索し、`q`付きURLで検索結果を共有
- 当日は、初期描画から1分単位の現在時刻位置を即座に表示
- 上映時間を1時間単位で折りたたみ、`18:00〜`のような開始時刻で表示。現在の時間帯と次の1時間を自動展開
- 日付とエリアで絞り込み
- 作品ごとのスター・鑑賞済み・興味なしをクラウド保存。鑑賞済み／興味なしの作品は上映時間から非表示
- 作品一覧から映画.comとFilmarksの作品検索へ移動
- 映画館ごとの座席・館内メモをユーザー単位でクラウド保存
- 映画館一覧から操作できるGoogle Street Viewを必要な館だけ開き、閉館予定日を一覧で明示
- 上映スケジュール・上映作品・映画館・映画はしごガチャ・マイページを切り替えるスマートフォン向けサイドバー
- 各画面を `#schedule`・`#movies`・`#cinemas`・`#planner`・`#account` のURLで直リンク（`#account`はマイページ、旧`#profile`も同画面へ移動）
- `#schedule?date=YYYY-MM-DD`のように日付を、`movie`パラメータで作品を含めて同じ表示位置へ直リンク
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

## 上映スケジュール収集

上映スケジュールは`yokohama-cinema-schedule-refresh` Workerが公式サイトから
取得し、Cloudflare D1へ保存します。Workers AIやAI Agentは動かしておらず、
映画館ごとのJSON API・HTML・公式週間画像を決められたパーサーで解析しています。
映画館ごとの取得URLと解析方法は[取得元一覧](docs/sources.md)を参照してください。

### 収集の流れ

1. Cron Triggerまたは認証付き`POST /refresh?batch=N`で収集を開始します。
2. 日本時間の当日から`SCHEDULE_DAYS`日分の日付を作ります。本番値は`7`で、
   安全のためWorker側で`1〜14`日に制限しています。
3. D1の`cinemas.active_until`を確認し、営業期間内の日付だけを映画館ごとの
   取得処理へ渡します。
4. 公式JSON APIまたはHTMLを取得し、上映時刻・作品・スクリーン・上映形式・
   公式予約URLを共通形式へ正規化します。
   T・ジョイ横浜と横浜ブルク13は、ブラウザ互換のUser-Agentで公開日付URLを
   通常のGETとして取得します。
5. 作品名から字幕・吹替・IMAX・4DX・レイティング等の上映形式表記を除き、
   重複上映を削除します。上映形式そのものは別フィールドに保持します。
6. 取得できた日だけ、既存上映と検索インデックスを日付単位で置き換えます。
   HTTPエラーや一時的な0件では前回正常データを削除しません。
7. 実行結果を`fetch_runs`と`source_health`へ、各日付の結果を
   `source_date_health`へ保存します。

映画館単位の処理は、取得元へ短時間に大量アクセスしないよう直列実行します。
作品画像は取得できる公式サイトだけ補完し、画像取得だけが失敗した場合は
上映スケジュールの更新を継続します。

### 3つの収集バッチ

外部リクエスト数と取得元への負荷を抑えるため、10館を3バッチに分割しています。
各バッチは1日1回、日本時間の`06`時台に10分ずつずらして実行します。
さらに`12:47`に、直近の実行がエラーだった映画館だけを再試行します。正常な
映画館への外部リクエストは発生しません。
`worker/wrangler.jsonc`のCron式はUTCで記述されています。

| バッチ | 日本時間の実行分 | 対象映画館 |
| --- | --- | --- |
| `0` | `06:07` | T・ジョイ横浜、ムービル、TOHOシネマズ 上大岡、横浜ブルク13、イオンシネマみなとみらい |
| `1` | `06:17` | ローソン・ユナイテッドシネマ STYLE-S みなとみらい、kino cinéma横浜みなとみらい、シネマ・ジャック＆ベティ |
| `2` | `06:27` | 横浜シネマリン、シネマノヴェチェント |
| 失敗分のみ | `12:47` | `source_health.status = 'error'`の映画館だけ |

テストでは、`shared/cinemas.ts`に登録された全映画館が重複なくいずれかの
バッチに含まれ、対応する取得実装も存在することを検証しています。

### 「7日分」の意味と公式公開範囲

Workerは毎回「日本時間の今日を含む7日」を全映画館へ要求しますが、
7日すべての上映が保存されることを保証するものではありません。映画館によっては
翌週分を火曜または水曜に公開するため、週の切り替わり前は公式サイト自体が
木曜までしか返さず、金曜以降が空になることがあります。休館日や上映のない日も
0件になります。

次の3つを`source_date_health.status`で日付ごとに区別します。

- `published`: 公式サイトから1件以上取得して、その日の上映を更新済み
- `not_published`: 取得処理は正常終了したが0件。公式未公開・休館・上映なしを含む
- `error`: HTTPエラーまたは解析エラー。前回正常データは削除せず、次回実行で再試行

日付別URLを持つ取得元は、1日だけ失敗しても残りの日付を継続して取得します。
同じHTTPリクエストは`403`・`429`・`5xx`の場合だけ、待ち時間を増やしながら
最大3回まで再試行します。公式未公開の日を推測で補完することはしません。

1日1回の全バッチで、外部サイトへのリクエストは通常およそ50回前後です。
各映画館は直列に処理し、1館あたりの週間取得は1〜8回程度です。Cron Triggerは
月約120回のWorker呼び出しに収まり、通常はWorkersの標準的な無料・有料枠に対して
十分小さい処理です。この収集は決められたURLの取得とパーサー実行なので
Browser Rendering、Workers AI、Cloudflare Agentsは使いません。実測で1回の
実行時間や外部
サブリクエスト上限に達した場合は、Agentsより先にWorkflowsまたはQueuesへの
分割を検討します。

### 本番の収集状況を確認する

デプロイ中のWorkerを確認します。

```bash
npx wrangler deployments status --config worker/wrangler.jsonc
```

日付ごとの取得元数と上映数を確認します。`showing_search.schedule_date`は
日本時間の上映日です。

```bash
npx wrangler d1 execute yokohama-cinema-schedule \
  --remote --config worker/wrangler.jsonc \
  --command="
    SELECT schedule_date,
           COUNT(DISTINCT source_id) AS source_count,
           COUNT(*) AS showing_count
    FROM showing_search
    WHERE schedule_date BETWEEN date('now', '+9 hours')
      AND date('now', '+9 hours', '+6 days')
    GROUP BY schedule_date
    ORDER BY schedule_date
  "
```

映画館ごとの取得済み日数を確認します。

```bash
npx wrangler d1 execute yokohama-cinema-schedule \
  --remote --config worker/wrangler.jsonc \
  --command="
    SELECT source_id,
           MIN(schedule_date) AS first_date,
           MAX(schedule_date) AS last_date,
           COUNT(DISTINCT schedule_date) AS covered_days,
           COUNT(*) AS showing_count
    FROM showing_search
    WHERE schedule_date BETWEEN date('now', '+9 hours')
      AND date('now', '+9 hours', '+6 days')
    GROUP BY source_id
    ORDER BY source_id
  "
```

直近の成功・失敗とエラー内容は`source_health`、実行履歴は`fetch_runs`で
確認できます。Workerログは`console.log`の`Schedule source refreshed`と
`Schedule batch completed`、失敗時の`Schedule refresh failed`を検索します。

デプロイ済みWorkerの`GET /health`は、当日から7日分について、全映画館の
`published`・`not_published`・`error`・`missing`をJSONで返します。
`error`または未実行の`missing`が1つでもあれば`ok: false`です。

```bash
curl https://yokohama-cinema-schedule-refresh.<subdomain>.workers.dev/health
```

### 映画館Street View

映画館一覧では、各館の「Street Viewを開く」を押したときだけGoogle Maps Embed
APIのiframeを読み込みます。画面内で向きやズームを操作でき、10館分を最初から
読み込まないためスマートフォンの通信量を抑えます。

10館の現在の座標と向き調整用Google Mapsリンクは
[映画館Street View調整用座標](docs/street-view.md)にまとめています。

経路計算用の`latitude`・`longitude`とは別に、Street View用の
`street_view_latitude`・`street_view_longitude`・`street_view_heading`・
`street_view_pitch`・`street_view_fov`をD1へ保存します。向きを調整するときは
経路計算用座標を変更せず、Street View用の値だけを更新します。

Maps Embed APIは公式ドキュメント上、リクエスト数の利用料金と日次上限が
ありません。APIキーはブラウザから見える前提のため、本番・プレビュー・ローカルの
必要なホストだけを許可するHTTPリファラー制限と、Maps Embed APIのAPI制限を
Google Cloud Consoleで設定してください。

### 上映検索

収集Workerは上映データの更新と同じトランザクションで、D1のFTS5検索インデックスも更新します。
Pages Functionsは`date`と`q`を受け取り、作品名・映画館名に一致する上映だけを返します。
検索結果画面は`#schedule?date=YYYY-MM-DD&q=...`または
`#movies?date=YYYY-MM-DD&q=...`として再読み込み・共有できます。

PagefindのNode APIはインデックス生成時にネイティブ実行ファイルを起動するため、
通常のCloudflare Workersランタイム内では実行できません。
定期更新される上映データと検索結果を同期するため、このサイトではWorkersから直接更新できる
D1 FTS5を採用しています。

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

別ターミナルから、`worker/.dev.vars`のトークンで3つの取得バッチを実行します。
Cloudflare Freeプランの1実行あたり外部リクエスト上限を超えないよう、
映画館を3バッチに分けています。

```bash
curl -X POST "http://localhost:8787/refresh?batch=0" \
  -H "Authorization: Bearer replace-with-a-long-random-token"
curl -X POST "http://localhost:8787/refresh?batch=1" \
  -H "Authorization: Bearer replace-with-a-long-random-token"
curl -X POST "http://localhost:8787/refresh?batch=2" \
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
