# はまむび！

横浜駅、桜木町、みなとみらい、関内、伊勢佐木町周辺の公式上映スケジュールを横断して、「今日、今から観られる映画」を確認する個人用サイトです。

[サイトを開く](https://hama-movie.daylight55.dev)

旧URLの `https://yokohama-cinema-schedule.pages.dev` も利用できます。
Cloudflare Pagesのプロジェクト名とD1名は引き続き `yokohama-cinema-schedule` です。

## 現在できること

- 10館・7日分を、縦の時間軸と横スワイプの映画館枠で見る番組表
- 上映スケジュール・上映作品画面を左右にスワイプして日付を切り替え
- 作品名・映画館名で全文検索し、`q`付きURLで検索結果を共有
- 当日は、初期描画から1分単位の現在時刻位置を即座に表示
- 上映時間を1時間単位で折りたたみ、`18:00〜`のような開始時刻で表示。現在の時間帯と次の1時間を自動展開
- 日付とエリアで絞り込み
- 作品ごとのスター・鑑賞済み・興味なしをクラウド保存。鑑賞済み／興味なしの作品は上映時間から非表示
- 鑑賞予定ごとに予約済みかをチェックしてクラウド保存
- 作品一覧から映画.comとFilmarksの作品検索へ移動
- 映画館ごとの座席・館内メモをユーザー単位でクラウド保存
- 映画館一覧で建物名と住所に紐づくGoogle マップを必要な館だけ開き、閉館予定日を一覧で明示
- 上映スケジュール・上映作品・映画館・映画はしごガチャ・マイページを切り替えるスマートフォン向けサイドバー
- 各画面を `#schedule`・`#movies`・`#cinemas`・`#viewing-plans`・`#planner`・`#account` のURLで直リンク（`#viewing-plans`は鑑賞予定、`#account`はマイページ、旧`#profile`も同画面へ移動）
- `#schedule?date=YYYY-MM-DD`のように日付を、`movie`パラメータで作品を含めて同じ表示位置へ直リンク
- Google OAuthを主認証にし、メールアドレス単位で設定をクラウド共有。パスワードとパスキーを予備のログイン方法として登録
- 1年先まで空いている日と時間を保存し、気になる作品と移動時間を優先した映画はしごを提案
- Google カレンダーの空き時間取得と、保存した映画はしごの予定登録（OAuth設定時）
- スクロール後に現在時刻の上映位置へ戻るスマートフォン向けボタン
- 映画館一覧で移動方法と自分の所要時間を館ごとにD1へ保存
- 映画館一覧で上映スケジュールへの表示・非表示を館ごとに切り替え
- マイページでベース出発地点を一度GPS登録し、暗号化した固定位置から移動時間と間に合う上映を反映
- 上映スケジュール右下の「現在地で更新」で、保存せずに最新GPS位置からローカル推定を再計算
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
   T・ジョイ横浜と横浜ブルク13は、Cloudflare Browser Runの`content`で
   公開日付URLのHTMLを取得します。
5. 作品名から字幕・吹替・IMAX・4DX・レイティング等の上映形式表記を除き、
   全角・半角や日英併記の区切りも揃えた作品キーを再生成して重複上映を削除します。
   上映形式そのものは別フィールドに保持します。
6. 1日1回、TMDBの日本向け劇場公開作品一覧を取得し、タイトルが一致する作品へ
   日本公開日を付与します。APIトークン未設定・取得失敗時も上映収集は継続し、
   D1に保存済みの公開日を利用します。
7. 取得できた日だけ、既存上映と検索インデックスを日付単位で置き換えます。
   HTTPエラーや一時的な0件では前回正常データを削除しません。
8. 実行結果を`fetch_runs`と`source_health`へ、各日付の結果を
   `source_date_health`へ保存します。

映画館単位の処理は、取得元へ短時間に大量アクセスしないよう直列実行します。
作品画像は取得できる公式サイトだけ補完し、画像取得だけが失敗した場合は
上映スケジュールの更新を継続します。

### 3つの収集バッチ

外部リクエスト数と取得元への負荷を抑えるため、10館を3バッチに分割しています。
各バッチは6時間ごと、日本時間の`00・06・12・18`時台に10分ずつずらして実行します。
T・ジョイ横浜と横浜ブルク13は、Cloudflare Browser Runで公開HTMLを取得します。
CloudflareアカウントのCron Trigger上限（他Workerと共有）に余裕を持たせるため、専用の再試行Cronは設けていません。
エラーになった映画館も次回の所属バッチで自動的に再試行します。
`worker/wrangler.jsonc`のCron式はUTCで記述されています。

| バッチ | 日本時間の実行分 | 対象映画館 |
| --- | --- | --- |
| `0` | `06:07` | T・ジョイ横浜、ムービル、TOHOシネマズ 上大岡、横浜ブルク13、イオンシネマみなとみらい |
| `1` | `06:17` | ローソン・ユナイテッドシネマ STYLE-S みなとみらい、kino cinéma横浜みなとみらい、シネマ・ジャック＆ベティ |
| `2` | `06:27` | 横浜シネマリン、シネマノヴェチェント |

テストでは、`shared/cinemas.ts`に登録された全映画館が重複なくいずれかの
バッチに含まれ、対応する取得実装も存在することを検証しています。

### 「7日分」の意味と公式公開範囲

Workerは毎回「日本時間の今日を含む7日」を全映画館へ要求しますが、
7日すべての上映が保存されることを保証するものではありません。映画館によっては
翌週分を火曜または水曜に公開するため、週の切り替わり前は公式サイト自体が
木曜までしか返さず、金曜以降が空になることがあります。休館日や上映のない日も
0件になります。

次の4つを`source_date_health.status`と取得時刻で日付ごとに区別します。

- `published`: 公式サイトから1件以上取得して、その日の上映を更新済み
- `not_published`: 取得処理は正常終了したが0件。公式未公開・休館・上映なしを含む
- `error`: HTTPエラーまたは解析エラー。前回正常データは削除せず、次回実行で再試行

`GET /health`では、最後の取得試行から12時間を超えた日付を`stale`として明示します。
`error`・`missing`・`stale`のいずれかがあれば`ok: false`になるため、Cron停止や
設定不備で古いデータだけが残る状態を監視で検知できます。

同じHTTPリクエストは通信エラー・`5xx`の場合だけ、1秒以上空けて最大2回まで試行します。
さらに映画館ごと・1回の収集で失敗を合計5回までに制限します。HTTP内の再試行、日付を
またいだ失敗、画像補完、Browser Run・解析エラーを含み、途中で成功しても回数は戻しません。
`403`・`429`は1回で打ち切り、その映画館の残りの日付にはアクセスしません。
上限未満の日付エラーは1秒空けて次の日付へ進みます。未取得の日付はエラーとして記録し、
前回正常データを保持します。打ち切り後の自動再試行は次回の定期収集（6時間後）です。
1回20秒のタイムアウトを設け、失敗応答の本文を解放します。公式未公開の日を推測で補完することはしません。

1回の全バッチで、公式サイトの取得は通常およそ50回前後です。
各映画館は直列に処理し、1館あたりの週間取得は1〜8回程度です。Cron Triggerは
月約360回のWorker呼び出しに収まり、通常はWorkersの標準的な有料枠に対して
十分小さい処理です。T・ジョイ2館だけは通常のWorkerからのGETが403になるためBrowser Runを使います。
その他は公開APIまたはHTMLの直接取得です。Workers AIやCloudflare Agentsは使いません。

日本公開日の取得にはTMDBの`discover/movie`を`region=JP`、
`with_release_type=2|3`で使用します。直近120日から14日先までを対象にし、
取得結果は正規化した作品名をキーとしてD1へ保存します。TMDBのAPIは非商用利用時も
出典表記が必要なため、「このサイトについて」に公式ロゴと所定の免責文を表示します。

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
`published`・`not_published`・`error`・`missing`・`stale`をJSONで返します。
`error`・未実行の`missing`・12時間を超えた`stale`が1つでもあれば`ok: false`、HTTP 503です。

```bash
curl https://yokohama-cinema-schedule-refresh.<subdomain>.workers.dev/health
```

### 映画館の地図プレビュー

映画館一覧では、表示位置までスクロールした館だけGoogle Maps Embed APIの
iframeを読み込みます。座標だけで入口付近を探すStreet Viewではなく、映画館名と
建物名を含む住所をPlace検索へ渡し、施設のマーカーがすぐ見える縮尺で開きます。
10館分を最初から読み込まないため、スマートフォンの通信量も抑えます。

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
npx wrangler pages secret put PROFILE_ENCRYPTION_KEY
```

`PROFILE_ENCRYPTION_KEY`にはbase64形式の32バイト乱数を設定します。値を画面や
シェル履歴へ出さずに新規作成する例:

```bash
openssl rand -base64 32 | npx wrangler pages secret put PROFILE_ENCRYPTION_KEY
```

4. Workerの手動実行トークンとTMDB API Read Access Tokenを登録します。

   ```bash
   npx wrangler secret put WORKER_TRIGGER_TOKEN --config worker/wrangler.jsonc
   npx wrangler secret put TMDB_API_READ_TOKEN --config worker/wrangler.jsonc
   ```

5. PagesとWorkerをデプロイします。

   ```bash
   npm run pages:deploy
   npm run worker:deploy
   ```

`APP_PASSWORD`は長いランダム文字列、`SESSION_SECRET`は32バイト以上のランダム値を推奨します。`robots`指定だけに依存せず、`*.pages.dev`を含む全リクエストをPages Functionsのミドルウェアで保護します。独自ドメインを追加する場合は、さらにCloudflare Accessのメール許可リストを重ねられます。

### Google カレンダーOAuth

Google CloudでCalendar APIを有効化し、ウェブアプリケーション用OAuthクライアントを作成します。
承認済みのリダイレクトURIには、新旧ホスト名それぞれのログイン用とカレンダー連携用URLを登録します。

```text
https://hama-movie.daylight55.dev/auth/google/login/callback
https://hama-movie.daylight55.dev/auth/google/callback
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
既存の映画設定やベース出発地点、移動時間、はしごプランはその管理者へ引き継がれます。
以降の新規ユーザーは、管理者が`#admin-users`で発行した招待リンクから
Googleで本人確認して登録します。旧メール許可リストだけでは新規登録できません。

ユーザーが設定する予備パスワードは暗号化して復元する方式ではなく、
ユーザーごとのランダムsaltとPBKDF2-HMAC-SHA256（600,000回）による不可逆ハッシュ
だけをD1へ保存します。ログインセッションもCookieの生トークンではなく、
SHA-256ハッシュだけをD1へ保存します。パスキーはWebAuthnの端末機能と
`@simplewebauthn/server`を使うため、外部の有料認証サービスは不要です。
パスキーは登録したホスト名に紐づくため、本番運用で独自ドメインへ移す場合は、
ドメイン確定後に登録してください。

## 移動時間の目安

映画館ごとに徒歩・電車・バス・自転車を選び、選択内容をD1へ保存します。
プロフィールで現在地をベース出発地点として一度登録すると、以後はD1に暗号化して保存した固定位置から
選択した移動方法に応じた目安を算出します。電車ではD1に登録した
石川町駅・伊勢佐木長者町駅を起点候補とし、次の内訳を映画館ごとに合算して短い方を
表示します。

- ベース出発地点の登録時に計算・保存した各起点駅までの徒歩時間
- D1に保持した駅間の乗車時間、平均待ち時間、乗換時間
- D1に保持した映画館最寄り駅から映画館までの徒歩時間
- 到着時刻のぶれを吸収する余裕10分

ベース出発地点の登録時だけGoogle Maps Routes APIで起点2駅までの徒歩時間を取得します。
徒歩APIが利用できない場合は、ベース出発地点と駅の直線距離から徒歩時間を推定して保存します。
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

「Googleマップで案内」は、ベース出発地点と映画館名・住所、保存した移動方法を指定した
Google マップを開きます。クリック時だけGoogle マップへベース出発地点を渡し、APIキーは
使用しません。

GPSはプロフィールの「現在地をベース出発地点として登録／更新」を押した時だけ使用します。
座標は分単位の所要時間に必要な約10m単位へ丸め、AES-256-GCMで暗号化してD1へ保存します。
暗号鍵はD1へ保存せず、Cloudflare Pagesの`PROFILE_ENCRYPTION_KEY`、認証済みユーザーID、
プロフィールごとのランダムsaltをHKDF-SHA256で合成してユーザー別に派生させます。
ユーザーIDはAES-GCMの追加認証データにも含めるため、暗号文を別ユーザーの行へ移しても
復号できません。既存の平文座標はプロフィールの初回読込時に暗号化し、旧座標列を`0`へ
置き換えます。

復号した座標は通常の画面や経路一覧APIへ返しません。「Googleマップで案内」を明示的に
押した時だけ、認証済みのサーバー経由でGoogle マップの案内URLを生成します。
ベース出発地点はマイページから更新・削除でき、ブラウザストレージやアプリログには保存
しません。登録後は別端末でも同じ固定位置を使えます。

上映時間の折りたたみはプロフィールで「なし・30分・1時間」から選べます。
設定は`app_preferences`へ保存し、ベース出発地点の有無にかかわらず別端末でも共有します。

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


## 期限付き招待とメール送信

マイページ →「ユーザー管理・招待」（`#admin-users`）でリンクを発行します。
リンクは発行から24時間、1人1回限り有効です。メールアドレスを指定すると、
そのアドレスの検証済みGoogleアカウントだけが登録できます。未指定ならLINE等で
共有し、最初の1人が登録できます。リンクのプレビューや開封だけでは消費しません。
管理者は登録前の招待を取り消せます。Google登録後は既存のパスキー・予備パスワードも使えます。

生の招待トークンはリンク発行時だけ返し、D1にはSHA-256ハッシュだけを保存します。
ユーザー作成・Google ID連携・招待消費はD1 batchトランザクションで処理します。
招待は常にメンバー権限で登録し、メールアドレスを知っているだけでは登録できません。

招待リンクのホスト名はPagesの `APP_ORIGIN=https://hama-movie.daylight55.dev` に固定します。
旧URLから管理画面を開いた場合も、新しいホスト名のリンクを発行します。
メールWorkerの `APP_ORIGIN` も同じ値に設定します。

送信元は `noreply@notify.daylight55.dev`。Cloudflare Email Serviceの送信ドメインを
有効化し、SPF・DKIM・DMARCを設定します。Pagesは`send_email`バインディングに
対応していないため、非公開の`yokohama-cinema-schedule-mail` Workerを
`INVITE_MAILER`サービスバインディングで呼び出します。公開URLは無効です。
メール送信が失敗した場合も、画面は失敗を明示して共有可能なリンクを表示します。

デプロイ順序:

```bash
npm run db:migrate:remote
npx wrangler deploy --config mail-worker/wrangler.jsonc
npm run worker:deploy
npm run pages:deploy
```

PagesとメールWorkerの`INVITE_FROM_EMAIL`を揃えてください。
本番ホストを変更する場合は、メールWorkerの`APP_ORIGIN`も合わせます。
プレビュー環境から本番ホスト以外のリンクをメール送信することは拒否します。

## T・ジョイ系の取得経路と障害の再発防止

2026-09-25の本番監視では、T・ジョイ横浜・横浜ブルク13のCloudflare発リクエストが
403となり、各日3回の再試行によってサブリクエスト上限を超え、後続のイオンシネマも
失敗していました。Paidプランでは`limits.subrequests: 1000`を明示していますが、
上限を増やすだけでは403を解決できません。

T・ジョイ2館はCloudflare Browser Runの`BROWSER.quickAction("content", ...)`で
公式ページを取得します。通常のWorkerのfetchが403でも、公開ページのブラウザ描画で
スケジュールを取得できることを確認しています。CAPTCHAを解く処理や非公開APIは使いません。
各日付を直列に処理し、画像・フォント・動画・CSSの取得を省き、遷移の上限を20秒に設定します。
Browser Runにも失敗した日付は解析エラーとして記録し、前回正常データを保持します。
公式HTMLの日付不一致やスケジュール構造消失も未公開ではなく解析エラーです。

全館をCloudflare Cronで6時間おきに収集し、GitHub Actionsを定期収集には使いません。
1館でも失敗した定期実行は例外としてCloudflare Observabilityに記録されます。
`GET /health`は全館・全日付をチェックし、エラー・欠測・12時間を超える未更新でHTTP 503を返します。
外部のHTTP監視からもこのURLを監視できます。GitHubのCIが停止しても定期収集は継続します。

Browser Run Quick Actionsはブラウザ利用時間で課金されます。公式料金（2026-09-25確認）は
Workers Paidに月10時間が含まれ、超過は1時間0.09米ドルです。
ブラウザ利用時間はCloudflare Dashboardで確認してください。
ローカルで実サービスの動作を確認する場合は、browser bindingの`remote: true`か
`wrangler dev --remote`を明示します（通常のローカルモードではQuick Actionsは動きません）。

CIはPRマージ状態で`npm ci`と`npm run ci:pr`を実行します。ローカルの再現確認は
変更をコミットした後で`npm run ci:pr:clean`を実行してください。
一時worktreeへ最新mainをマージし、`npm ci`と同じ検証を実行して後片付けします。

GitHub Actionsの請求ロック等でジョブが起動しない場合、CI成功とは扱いません。
GitHubの請求・Actions利用可否を復旧してからマージしてください。`gh run view <run-id>`とcheck-run annotationsで
実行前の失敗とテスト失敗を区別できます。
