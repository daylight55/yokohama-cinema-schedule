# 上映スケジュール取得元

最終確認: 2026-07-29

この一覧は、個人用サイトの実装時点で確認できた公式ページと取得方式を記録したものです。サイト構造は予告なく変わるため、Workerは映画館ごとに失敗を隔離し、失敗時には前回正常データを残します。

| 映画館 | 週間・日別URL | 解析方法 | 現在の扱い |
|---|---|---|---|
| T・ジョイ横浜 | `https://tjoy.jp/t-joy_yokohama?date=YYYY-MM-DD` | ブラウザ互換のUser-Agentで公開日付ページをGETし、作品セクションと上映枠をCheerioで解析 | private_only |
| ムービル | `https://109cinemas.net/movil/schedules/YYYYMMDD.html?theater_code=72` | 日別HTMLの`article`、`ul.timetable`、`li.check_date`、`time.start/end`を解析 | private_only。2026-09-30閉館予定 |
| TOHOシネマズ 上大岡 | `https://api2.tohotheater.jp/api/schedule/v1/schedule/066/TNPI3050J02?...&show_day=YYYYMMDD` | 公式劇場ページが利用する日別JSON APIを取得し、作品・スクリーン・上映枠・販売状態を解析。公式週間ページは`https://hlo.tohotheater.jp/net/schedule/066/TNPI2000J01.do` | private_only |
| 横浜ブルク13 | `https://tjoy.jp/yokohama_burg13?date=YYYY-MM-DD` | T・ジョイ横浜と同じ公開日付ページを解析 | private_only |
| イオンシネマみなとみらい | `https://theater.aeoncinema.com/schedule/v2/data/minatomirai/schedule.json?v=YYYYMMDDHHmm` | 日付キーを持つJSONを解析。上映時刻はISO 8601 | private_only |
| ローソン・ユナイテッドシネマ STYLE-S みなとみらい | `https://www.unitedcinemas.jp/minatomirai/daily.php?date=YYYY-MM-DD` | PC版の日別HTMLをShift_JISでデコードし、作品・スクリーン・開始終了時刻を解析 | private_only |
| kino cinéma 横浜みなとみらい | `https://kinocinema.jp/minatomirai/` | 1ページ内の有効な日付タブと`.schedule__item`を対応させて解析 | private_only。Node環境では証明書チェーンエラーが起きることがあり、Cloudflareでの実運用確認が必要 |
| シネマ・ジャック＆ベティ | `https://schedule.eigaland.com/api/schedulePage/show/listByCinemaIdAndDate?webKey=f005657d-7131-479e-a734-c42c14d98f9f&date=YYYY-MM-DD` | Eigalandの日別JSON API。作品、スクリーン、上映回、購入URLを解析 | private_only |
| 横浜シネマリン | `https://schedule.eigaland.com/api/schedulePage/show/listByCinemaIdAndDate?webKey=4d6c9e5f-bcca-4635-abe4-6f0db498a8bc&date=YYYY-MM-DD` | Eigalandの日別JSON API | private_only |
| シネマノヴェチェント | `https://cinema1900.wixsite.com/home/filmtheater1900` | Wixページから対象週のスケジュール画像を抽出し、閉館まで公開済みの6週分を目視確認した上映回へ対応付ける。公式画像URLが差し替わった場合は未確認データを取り込まず収集エラーとして検知 | private_only。2026-08-31閉館予定 |

## 今回の対象外

- あらすじ、座席残数: 事実としての上映時刻と公式購入リンクに限定し、権利や利用条件の確認前は保存・転載しない。

## 作品画像

- T・ジョイ系は公開日付ページの作品セクション内画像を使用
- ジャック＆ベティ、シネマリンはEigaland APIの`posterUrl`を使用
- ムービル、kino cinéma、ユナイテッドは公式の上映作品一覧を1回追加取得し、作品名または公式作品IDで上映回へ対応付け
- イオンシネマなど公式スケジュールから画像を取得できない作品は画像なしとして保存

画像ファイル自体は複製せず、公式サイトのHTTPS URLのみをD1に保存します。
画像取得だけが失敗した場合は上映スケジュールの更新を継続します。
画像表示は許諾確認までプライベートモードに限定します。

## 公開前の確認

各情報提供元から許諾を得た映画館だけ、`shared/cinemas.ts`の`approval`を`approved`へ変更します。そのうえでPagesの`PUBLIC_MODE=true`にすると、未許諾の映画館はAPIレスポンスから除外されます。許諾が揃うまでは`PUBLIC_MODE=false`とアプリ内認証を維持します。

公式サイトの注意書き、問い合わせ先、映画館ごとの許諾依頼文案は[公開許諾の問い合わせ先と依頼文案](./publication-permission-requests.md)にまとめています。
