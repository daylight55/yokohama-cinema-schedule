# About の使い方動画

制作・更新の判断と一連の手順は、リポジトリskill
[`hamamubi-guide-video`](../../.agents/skills/hamamubi-guide-video/SKILL.md) にまとめています。

現行アプリをPlaywrightで操作して撮影した実画面に、ズーム、緑のフォーカス枠、タップの波紋、
短いテキスト、Gemini TTSの声とオリジナルBGMを重ねる日英の操作ガイドです。
UIを図形で描き直しません。操作前後の実際の表示を使い、検索・作品詳細・公式サイトへのリンク・
スター・鑑賞予定・グループ共有・言語切り替えを紹介します。
冒頭6秒は、はまむびくんが話しながら小さく弾み、軽く体を傾けて自己紹介する専用シーンです。操作説明6場面を各8秒、
言語切り替えを5秒で紹介し、最後の5秒は再びマスコットだけのシーンに切り替わります。
跳ねる動きは各シーンに1回だけとし、最後は短くウィンクして笑顔に戻ります。全9場面・64秒です。
日英とも同じ控えめな演出に揃えています。録音内の発話位置に合わせて最初の動作を配置し、
声の再生開始時刻・間・高さ・速さは変更しません。繰り返しのジャンプや常時点滅する装飾は使いません。

画面内の上映・人物・グループは撮影用データです。実アカウントや本番の予定は使用しません。
映画館のリンクは実際の公開サイトを指し、新規タブを開くところまで確認して閉じます。
予約の申し込みは行いません。字幕にも予約と鑑賞予定の違いを残します。
マスコットは既存のロゴ、BGMは `music.py` によるオリジナルの作曲・合成です。

## 素材と生成元

- 台本・テキスト版: `shared/site-guide.json`
- 実画面の撮影: `capture.mjs` と `capture-fixture.mjs`
- 撮影元のGitリビジョン・注目箇所・操作タイミング: `captures/manifest.json`
- 元スクリーンショットとアクセシビリティスナップショット: `captures/`
- ズーム・注釈・マスコットのジャンプ・動画合成: `render.py`
- マスコット: `public/brand/hamamubi-icon-{v2,wink}.svg` を `rasterize-mascot.mjs` でPNG化した `mascot/`
- ナレーション: `narration.py`（Leda、明るく甘いアニメ風）
- 配信ファイル: `public/guide/how-to-{ja,en}.{mp4,webp,vtt}`

撮影元は現行の開発UI（ベース `518c606`、同時進行の作品名・言語対応を含むローカル作業状態）です。
今回の動画の正確な入力はコミット済みのスクリーンショットです。生成スクリプトのブランチより新しいUIを撮影しているため、
同じ素材を再撮影する場合はそのリビジョンまたは互換UIのローカルサーバーを使ってください。
依存する画面・ラベルが変わったら撮影手順を更新します。スクリーンショットをコミットしているため、
撮影元のサーバーなしでも既存素材から動画を再生成できます。

## 実画面の再撮影

Node.jsとPlaywright（Chromium）を用意し、撮影対象アプリを別ターミナルで起動します。

```sh
npm run dev -- --host 127.0.0.1 --port 5194 --strictPort
```

このブランチのルートから撮影します。既存のPlaywrightモジュールを使う場合は、その `index.mjs` の
絶対パスを `PLAYWRIGHT_MODULE` に指定できます。

```sh
GUIDE_URL=http://127.0.0.1:5194 GUIDE_SOURCE_REVISION=518c606 node scripts/site-guide/capture.mjs
```

390×700・2倍解像度で撮影し、APIだけを説明用データに置き換えます。画面・ボタン・ダイアログは
アプリ本体のものです。各操作後のスクリーンショットとアクセシビリティ情報を保存します。
最後に320×700・390×844、再読み込み、戻る・進むで横方向のオーバーフローがないことを確認します。
`--inspect` は初期画面だけを撮影して、操作対象を調べるために使います。

## Gemini 3.8 TTS

[モデル仕様](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts?hl=ja) と
[音声生成ガイド](https://ai.google.dev/gemini-api/docs/speech-generation) に基づき、
`POST https://generativelanguage.googleapis.com/v1beta/interactions` を呼びます。
モデルは `gemini-3.8-flash-tts`、認証は `x-goog-api-key` ヘッダーです。
本文と `speech_metadata.style` を分離し、返されたWAVをヘッダーを追加せず保存します。
`generation_config.speech_config[].language` は日本語 `ja-JP`、英語 `en-US` を明示します。
話し方も言語ごとに分け、英語には `boku` や日本語のアクセント指示を入れません。
英語の本文・styleに日本語文字が混ざるリクエストは送信前にエラーにします。
英語の冒頭は `Hi! I’m your Hama Movie buddy.` とし、ブランド名の途中で切らず自然な英語の抑揚にします。
呼び出しスクリプトはPython標準ライブラリだけで動作します。
日本語の「はまむび」は音声入力だけ「ハマムビ」に置き換え、一つの固有名詞・平板型の
発音指示を追加します。動画の字幕と画面上のひらがな表記は維持します。
冒頭にはユーザーが選んだ平板型サンプルをそのまま使用しています。

APIキーはローカル環境変数 `GEMINI_API_KEY` に設定します。コード・コミットに含めず、
`VITE_` 接頭辞も付けません。`.env` は自動で読み込みません。

```sh
python3 scripts/site-guide/narration.py --lang all --dry-run
python3 scripts/site-guide/narration.py --lang en --scene 0 --output-dir .wrangler/site-guide-narration-en-review
```

既定では7秒間隔です。HTTP 429では `Retry-After`（秒数・HTTP日時）と
`google.rpc.RetryInfo.retryDelay` を読み、長い方の指定時間以上待ちます。
指定がなければ10秒・20秒に最大1秒のゆらぎを加えます。1場面あたり最大2回まで再試行し、
120秒を超える待機指定では早く再試行せず停止します。エラー本文や認証ヘッダーは記録しません。

`--request-interval`（0〜60秒）、`--lang`（ja/en/all）、`--scene`（0始まり、複数指定可）、`--voice`、`--style`、`--output-dir` を指定できます。
本文・声・言語・話し方が同じ完了済み音声は再利用します。既定保存先 `.wrangler/` はGit管理外です。
新規生成時はリクエスト本文を `.request.json`、音声の秒数と言語・APIのusageを `.usage.json` に保存します。
費用は生成したリクエストのusageと当日の公式単価から概算し、キャッシュ分を二重計上しません。
今回の動画では既存音声を再利用し、予約・共有の台本を実画面に合わせて再生成しました。
操作説明は1場面8秒で、以前の短い動画用の倍速処理を外し、元の自然な読み上げに戻しています。
マスコットの専用シーン追加時にはAPIを呼ばず、既存の言語切り替え・締めのWAVを文間の無音で分割しました。
日本語は3.10秒、英語は4.15秒で分割し、`.wrangler/site-guide-narration-mascot/` に保存しています。
日本語の選択済み音声は維持しています。英語版はAPI言語分離の修正後、全9場面を英語専用の
styleで再生成し、日本語WAVと合わせて `.wrangler/site-guide-narration-localized/` に保存しています。
これらのローカル音声はGit管理外です。新しいcheckoutでは元の音声を引き継ぐか、必要な範囲だけ再生成してください。

## 動画の再生成

Python 3、Pillow、NumPy、ffmpeg（libx264 / AAC）を用意します。

```sh
python3 scripts/site-guide/render.py --narration-dir .wrangler/site-guide-narration-localized
```

macOSのヒラギノ角ゴシックを使用します。他の環境では `GUIDE_FONT` と `GUIDE_FONT_BOLD` に
日本語フォントを指定してください。マスコットのPNGは同梱済みです。
ブランドSVGを更新した場合は `npm ci` 後に `node scripts/site-guide/rasterize-mascot.mjs` で再生成します
（npmの依存に含まれるsharpを使用）。元のアイコンの形・背景・色はそのまま保持します。`--stills` では確認用PNGとポスターだけを生成します。
`--output-dir` で公開先以外に出力できます。`--lang en` / `--lang ja` で指定言語だけを書き出せます。`--narration-dir` なしではBGMのみです。

出力は900×1200、24fps、64秒、H.264/yuv420p、48kHzステレオAAC、faststart付きです。
場面の種類と長さは `captures/manifest.json` が管理します。ナレーション開始は各場面の0.4秒後です。
音声が場面の長さから0.8秒を引いた長さを超えた場合は、途中で切らず生成前にエラーにします。
字幕・ナレーション・進捗表示は同じタイムラインを使います。
BGMは18%に下げ、声を含めた最終ミックスを-16 LUFS目標に正規化します。
完成したMP4のみ公開先に移し、25MiB未満であることを検証します。

## 確認

```sh
python3 -m unittest discover -s scripts/site-guide -p 'test_*.py'
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,pix_fmt -of json public/guide/how-to-ja.mp4
npm run ci:pr
```

日英の各場面で読みやすさ、操作前後の変化、声と映像の同期、テキスト・字幕を確認します。
Aboutの直接URL、再読み込み、戻る・進む、320×700と390×844、再生・ミュート・シークも確認します。
通常ビルド・CIでは配信済みファイルを使うため、Python・ffmpeg・APIキーは不要です。
