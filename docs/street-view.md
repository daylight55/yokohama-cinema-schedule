# 映画館Street View調整用座標

経路計算用座標を初期のStreet View検索位置として使用しています。各リンクを開き、
建物の正面が見える位置と向きへ移動してから、ブラウザのURLを共有してください。
受け取ったURLからStreet View専用の座標・向き・ピッチ・画角をD1へ反映します。

| 映画館 | 緯度 | 経度 | 調整用リンク |
| --- | ---: | ---: | --- |
| T・ジョイ横浜 | 35.46572 | 139.62236 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.46572%2C139.62236) |
| ムービル | 35.46312 | 139.61784 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.46312%2C139.61784) |
| 横浜ブルク13 | 35.45125 | 139.63084 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.45125%2C139.63084) |
| イオンシネマみなとみらい | 35.45518 | 139.63896 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.45518%2C139.63896) |
| ローソン・ユナイテッドシネマ STYLE-S みなとみらい | 35.45774 | 139.63248 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.45774%2C139.63248) |
| kino cinéma横浜みなとみらい | 35.45910 | 139.62801 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.45910%2C139.62801) |
| 横浜シネマリン | 35.44285 | 139.63015 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.44285%2C139.63015) |
| シネマ・ジャック＆ベティ | 35.44018 | 139.62585 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.44018%2C139.62585) |
| TOHOシネマズ 上大岡 | 35.40750 | 139.59494 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.40750%2C139.59494) |
| シネマノヴェチェント | 35.45344 | 139.61157 | [Google Mapsで調整](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.45344%2C139.61157) |

## D1で保持する値

- `latitude`・`longitude`: 経路・距離計算用。Street View調整では変更しない
- `street_view_latitude`・`street_view_longitude`: 最寄りパノラマを探す位置
- `street_view_heading`: 水平方向。`0〜360`度
- `street_view_pitch`: 上下方向。`-90〜90`度
- `street_view_fov`: 水平画角。`10〜100`度

`street_view_heading`が未設定の間はGoogleが初期方向を決めます。利用者は映画館一覧の
埋め込み画面をドラッグして、その場でアングルを変更できます。
