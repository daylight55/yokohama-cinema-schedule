# 確認済み作品画像

2026-09-27に映画館・公式作品サイトから確認した補完画像。JSONには元の上映タイトル、作品キー、出典のタイトル・URL、画像URLと確認内容を保存する。画像ファイルの複製・生成はせず、既存アプリと同じく公開画像URLを使う。

72作品キー、80通りの上映タイトルを確認。各URLについてHTTP 200と画像Content-Typeを確認済み。前後編は別の公式キービジュアル、1992年版『許されざる者』は映画祭の1992年版の画像を使用する。特別上映は同一作品と確認できた場合のみ通常版の画像を使う。

未確定のため残したもの：
- TVアニメ『薬屋のひとりごと』第3期 舞台挨拶付き先行上映会ライブビューイング（映画館詳細ページから画像を取得できず、公式サイトはHTTP 403）
- フォーカスロック+宇宙の声が聞きたくて（併映全体に対応する画像を確認できず）

## 検証と適用

```sh
python3 scripts/test-reviewed-images.py
npm run ci:pr
node scripts/reviewed-images.mjs > /tmp/reviewed-images.sql
npx wrangler d1 migrations list yokohama-cinema-schedule --remote --config worker/wrangler.jsonc
npx wrangler d1 migrations apply yokohama-cinema-schedule --remote --config worker/wrangler.jsonc
npx wrangler d1 execute yokohama-cinema-schedule --remote --file /tmp/reviewed-images.sql
```

SQL生成自体は書き込みをしない。適用前に保留中マイグレーションと生成SQLを確認する。0025は既存の本番0023/0024と番号が重ならないようにしている。

`reviewed_movie_images` は上映タイトルと作品キーの両方が一致する場合だけ参照する。既存の実画像を上書きせず、NULL・空文字・既知のT・ジョイのno-img画像だけを補う。収集が上映行を削除して再挿入しても、INSERTトリガーで補完される。コレクターやフロントエンドの再デプロイは不要。

2026-09-27本番適用後、これからの1,643上映中1,641上映に画像が登録され、未補完は上記2上映。画像の外部URLは将来変更される場合がある。取り消し時はまず対応する補完レコードを削除し、適用前の `id,image_url` スナップショットを使って、補完URLがそのまま残っている行のみ戻す。
