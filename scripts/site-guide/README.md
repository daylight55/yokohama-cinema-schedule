# About の使い方動画

コミック風の動き、Gemini TTSのナレーション、オリジナルBGMを組み合わせた使い方動画です。日本語と英語で同じ操作を紹介します。
動画の秒数や章番号を見出し・映像に表示しません。
説明ははまむびくんが話しかける短い文にし、サンプル画面は場面ごとの主操作だけを大きく表示します。
言語切り替えは専用の場面だけで紹介し、共通ヘッダーや細かな補足は載せません。マスコットに腕を描き足しません。
実際のアカウント情報や映画の宣材画像は使用せず、既存のはまむび！ロゴと図形を使っています。
上映・メンバーの表示は説明用のサンプルです。第三者のキャラクターは使用しません。ナレーションはGemini 3.8 Flash TTSのLeda音声（萌え声・アニメ寄り）です。BGMは `music.py` で新しく作曲・合成した
マレット風メロディ、ベース、コード、打楽器です。既存曲・外部サンプル・外部音楽サービスは使用しません。

## 再生成

Python 3、Pillow 12.3.0、NumPy 2.3.5、ffmpeg（libx264 / AAC）を用意し、リポジトリのルートから実行します。

```sh
python3 scripts/site-guide/render.py
```

macOSではインストール済みのヒラギノ角ゴシックを使用します。他の環境では、日本語を含む
フォントのパスを `GUIDE_FONT` と `GUIDE_FONT_BOLD` に指定してください。フォントファイルは配布しません。
`--stills` を付けると、ポスターと確認用の各場面のPNG（`/tmp/hama-guide-*`）だけを出力します。

- 説明文・テキスト版: `shared/site-guide.json`
- 図解・動き: `scripts/site-guide/render.py`
- BGMの作曲・音源合成: `scripts/site-guide/music.py`
- 配信用MP4・WebPポスター・WebVTT字幕: `public/guide/how-to-{ja,en}.*`

配布済みファイルをコミットするので、CI・通常のアプリビルドにはPythonやffmpegは不要です。
動画はH.264/yuv420pとステレオAAC、faststart付き。BGMは-18 LUFS・true peak上限-1.5 dBTPを目標に正規化します。
再生操作前に音は鳴りません。プレイヤーの音量・ミュートで調節できます。完成したMP4だけを配信ディレクトリに移します。各ファイルをCloudflare Pagesの25MiB制限内に保ちます。
Aboutはアカウントの表示言語に応じて動画を切り替え、言語変更時は再生を停止して先頭に戻します。
自動再生・ループ・動画の先読みはせず、操作はブラウザ標準の再生コントロールを使います。
動画内の説明と同じテキスト版、選択式の字幕、ダウンロードリンクも用意しています。

## 確認

```sh
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,pix_fmt -of json public/guide/how-to-ja.mp4
npm run ci:pr
```

日英の映像とBGMの再生・ミュート・シーク・終了、320×700と390×844の横スクロール、テキスト版と字幕、
Aboutの直接URL・再読み込み・履歴移動を確認してください。

## Gemini 3.8 TTS のナレーション（任意）

公式の [モデル仕様](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts?hl=ja) と
[音声生成ガイド](https://ai.google.dev/gemini-api/docs/speech-generation) に基づき、
`narration.py` は `POST https://generativelanguage.googleapis.com/v1beta/interactions` を呼びます。
モデルは `gemini-3.8-flash-tts`、認証は `x-goog-api-key` ヘッダーです。
読み上げ本文と `speech_metadata` の `style` を分離し、音声は `steps` の
`model_output.content` から取得します。3.8 の WAV 出力は既にヘッダー付きなので、そのまま保存します。
Python標準ライブラリだけで呼び出せます。

APIキーをローカル環境変数 `GEMINI_API_KEY` に設定してから実行してください。
キーはチャット・ソース・コミットに含めず、`VITE_` 接頭辞も付けません。
スクリプトは `.env` を自動で読み込みません。

```sh
# API呼び出しなしで原稿を確認
python3 scripts/site-guide/narration.py --lang all --dry-run
# 日英8場面ずつ、初回は計16回のAPI呼び出し（利用料金が発生する場合があります）
python3 scripts/site-guide/narration.py --lang all --voice Leda
# 保存済みWAVを読み込み、BGMの音量を下げて動画に合成
python3 scripts/site-guide/render.py --narration-dir .wrangler/site-guide-narration
```

`--lang ja`（既定）または `--lang en` で片方だけ生成できます。
レンダラーは日英両方を処理するため、合成前に両方のWAVを用意してください。
既定は選定したLeda音声で、明るく甘いアニメ風のはまむびくんを指定しています。
`--style 'Warm, friendly and brisk.'` で話し方、`--voice` でプリセット音声、
`--output-dir` で保存先を変更できます。本文・モデル・声・話し方が同じ音声は再利用します。
API呼び出しの間は既定で7秒待ちます（`--request-interval` で0〜60秒に変更可能）。
HTTP 429の場合は、レスポンスの `Retry-After`（秒数またはHTTP日時）と
`google.rpc.RetryInfo.retryDelay` を読み、指定された時間以上待って再試行します。
両方ある場合は長い方を使います。指定がない場合は10秒・20秒に最大1秒のゆらぎを加えて待ちます。
再試行は1場面あたり最大2回、1回の待機は最大120秒です。120秒を超える指定では、早めに再試行せず停止します。
それ以外のエラーも停止します。再実行すると完了済み場面を再利用します。
APIエラー本文・認証ヘッダーはログに出しません。
生成音声とキャッシュ情報の既定保存先 `.wrangler/` はGit管理外です。

各場面の先頭・末尾に0.2秒の余裕を確保します。音声が5.6秒を超えるとレンダリング前に停止します。
速めの `--style` で再生成してください。音声は途中で切りません。
ナレーション合成時はBGMを18%に下げ、最終ミックスを-16 LUFS目標に正規化します。
`--narration-dir` なしのレンダリングは従来通りBGMのみです。
生成後は読み間違い、場面との同期、声とBGMのバランスを試聴してからMP4を公開してください。
このブランチのMP4は選定したLeda音声で生成済みです。
日本語の最終場面は末尾の無音を0.26秒短縮し、英語の第4・6・8場面は
ffmpegの `atempo` で声の高さを保ったまま約1.057・1.064・1.248倍速に調整しています。
セリフの途中は切っていません。再生成時も長さと同期を確認してください。本番への反映はマージ・デプロイ後になります。

APIキーなしの検証:

```sh
python3 -m unittest discover -s scripts/site-guide -p 'test_*.py'
```
