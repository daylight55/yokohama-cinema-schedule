# About の使い方動画

コミック風の動きとオリジナルBGMを組み合わせた使い方動画です。日本語と英語で同じ操作を紹介します。
動画の秒数や章番号を見出し・映像に表示しません。
実際のアカウント情報や映画の宣材画像は使用せず、既存のはまむび！ロゴと図形を使っています。
上映・メンバーの表示は説明用のサンプルです。ナレーションや第三者のキャラクターは使用しません。BGMは `music.py` で新しく作曲・合成した
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
