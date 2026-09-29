# 音声・言語・費用

## APIの契約

実装はリポジトリルートの `scripts/site-guide/narration.py`。Python標準ライブラリだけで動く。

- モデル: `gemini-3.8-flash-tts`
- エンドポイント: `POST https://generativelanguage.googleapis.com/v1beta/interactions`
- 認証: ローカルの `GEMINI_API_KEY`。値を出力しない。`.env` の自動読み込みはなく、ブラウザ用の `VITE_` 変数にはしない。
- 本文: `input[].content[].text`。指示文を発話本文に混ぜない。
- 話し方: 同じtext要素の `annotations: [{"type":"speech_metadata","style":"…"}]`。
- 声・言語: `generation_config.speech_config: [{"voice":"Leda","language":"en-US"}]`。日本語は `ja-JP`。Interactions APIのフィールドは `language` で、別APIの `languageCode` と混同しない。
- 出力: `response_format: {"type":"audio","mime_type":"audio/wav"}`。返された音声にはWAVヘッダーがあるため、二重に付加しない。

仕様が変わったら [音声生成](https://ai.google.dev/gemini-api/docs/speech-generation)、[Interactions API](https://ai.google.dev/api/interactions-api)、[モデル仕様](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts) を確認して実装とこの文書を更新する。

## 言語・発音の分離

`scene_request` は言語別のstyleを選び、`request_body` はAPIの言語指定を付ける。共通STYLEに日本語の一人称やアクセント指定を入れない。

日本語の「はまむび」は音声入力だけ「ハマムビ」に置換し、一語の4モーラ・平板型の指定を加える。画面はひらがなのまま。承認済みの日本語冒頭WAVは、英語の修正で再生成しない。

英語は英語のみの原稿・styleを使う。原稿やstyleに日本語文字が混ざるとスクリプトが停止する。ASCIIで書かれた `boku` のような日本語向け指示もレビューで除く。ブランド名は英語の文に滑らかにつなげる。言語指定は生成の制御であり、聞き取り品質の保証ではない。生成した全場面を再生して確認し、必要に応じて原稿を与えない文字起こしでも言語混入・読み落としを確認する。自動文字起こしだけを人間の試聴と表現しない。

```sh
python3 scripts/site-guide/narration.py --lang en --scene 0 --dry-run
python3 scripts/site-guide/narration.py --lang en --scene 0 --output-dir .wrangler/site-guide-narration-en-review
```

`--scene` は0始まりで複数指定できる。英語全体を直すなら `--lang en` とし、日本語を巻き込む `--lang all` を無条件に使わない。声の比較を毎回やり直す必要はない。

## キャッシュと再試行

`LANG-NN.wav` と `LANG-NN.json`（リクエスト本文のSHA256）が一致すると再利用する。新規生成時は `.request.json` と `.usage.json` も保存する。APIキーは保存しない。API言語・声・style・本文が変わればfingerprintも変わる。

`--dry-run` は原稿確認用で、実際に発生するキャッシュミス数の見積もりではない。編集して分割した音声には通常のfingerprintがないことがあるため、ファイルがあるだけで「APIは呼ばれない」と判断しない。

現在の実装は直列・7秒間隔。429では `Retry-After` と `RetryInfo.retryDelay` の長い方を切り上げて待つ。ヒントなしは10秒・20秒に最大1秒のゆらぎ、1場面最大2再試行。120秒を超える指定は早く再試行せず停止する。途中までできた素材は残し、必要な待機後に同じコマンドで続行する。429だけから同時処理数制限と断定せず、RPM・TPM・日次上限等を確認する。

## 費用の計算

実行日に [公式料金](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts) を確認し、モデル、料金区分、有効期間、為替の前提を記録する。料金を恒久的な定数として扱わない。

新規生成された各 `.usage.json` の公開集計値を使う。`total_input_tokens` と `total_output_tokens` の両方を足した上で `total_tokens` も足す、といった二重計上をしない。内部実装用の生トークン値も追加しない。複数モダリティがあれば各内訳に対応する単価を使う。

```text
概算USD = 入力text tokens / 1,000,000 × 入力単価
        + 出力audio tokens / 1,000,000 × 出力単価
概算JPY = 概算USD × 明示したUSD/JPY
```

2026-09-28に確認したStandard有料単価の例は、2026年末まで入力$0.50/100万tokens、音声出力$9/100万tokens。音声の目安は$0.00225/10秒。将来の実行時には再確認する。

usageがなければWAVの秒数を使った音声出力分の概算を示し、入力分・再試行分など計上できない部分を明記する。請求画面を確認していなければ実請求額と呼ばない。試聴・不採用テイク・音声検証などの追加API呼び出しも実行分に含め、キャッシュ再利用やローカル再合成は新規生成に数えない。APIを一度も呼んでいない演出変更なら、今回の追加API費用は0円と報告できる。
