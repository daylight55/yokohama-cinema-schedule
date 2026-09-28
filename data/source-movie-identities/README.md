# 公式作品IDの事前照合

初回導入時の確認待ちを抑えるため、T・ジョイ系の公式予定表から取得した作品IDを公式詳細ページの `data-code` と照合し、`.carosuel-header` の作品名を保存する。ネットワーク障害・404・ID不一致は収録しない。映画館別ID、予定表の解析後の表記、正式名、出典、確認日時を残す。

```sh
node --experimental-strip-types scripts/reviewed-source-identities.mjs data/source-movie-identities/2026-09-28.json > /tmp/source-movie-identities.sql
npx wrangler d1 execute yokohama-cinema-schedule --remote --file /tmp/source-movie-identities.sql
```

このカタログは公式名を確認した記録であり、既存の作品キー変更を承認するものではない。新しい証拠でも既存の登録済み正式名は上書きしない。実際の掲載可否は収集時のキー衝突・作品キー変更検証を通す。
