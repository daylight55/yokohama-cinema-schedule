CREATE TABLE IF NOT EXISTS preferred_origin_stations (
  station_id TEXT PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL
);

INSERT OR REPLACE INTO stations (
  id, name, latitude, longitude, source_url, updated_at
) VALUES (
  'ishikawacho', '石川町駅', 35.438704, 139.645721,
  'https://www.google.com/maps/search/?api=1&query=%E7%9F%B3%E5%B7%9D%E7%94%BA%E9%A7%85',
  '2026-07-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO station_connections (
  station_a_id,
  station_b_id,
  line_name,
  transport_mode,
  ride_minutes,
  headway_minutes,
  transfer_minutes,
  source_url,
  verified_at
) VALUES
  (
    'kannai', 'ishikawacho', 'JR根岸線', 'train', 2, 4, 5,
    'https://transit.yahoo.co.jp/search/result/%E7%9F%B3%E5%B7%9D%E7%94%BA-%E9%96%A2%E5%86%85',
    '2026-07-24'
  ),
  (
    'sakuragicho', 'isezakichojamachi', '横浜市営地下鉄ブルーライン', 'train', 4, 7, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E4%BC%8A%E5%8B%A2%E4%BD%90%E6%9C%A8%E9%95%B7%E8%80%85%E7%94%BA',
    '2026-07-24'
  ),
  (
    'kannai', 'isezakichojamachi', '徒歩連絡', 'walk', 8, 0, 0,
    'https://www.google.com/maps/dir/?api=1&origin=%E9%96%A2%E5%86%85%E9%A7%85&destination=%E4%BC%8A%E5%8B%A2%E4%BD%90%E6%9C%A8%E9%95%B7%E8%80%85%E7%94%BA%E9%A7%85&travelmode=walking',
    '2026-07-24'
  ),
  (
    'isezakichojamachi', 'koganecho', '徒歩連絡', 'walk', 18, 0, 0,
    'https://www.google.com/maps/dir/?api=1&origin=%E4%BC%8A%E5%8B%A2%E4%BD%90%E6%9C%A8%E9%95%B7%E8%80%85%E7%94%BA%E9%A7%85&destination=%E9%BB%84%E9%87%91%E7%94%BA%E9%A7%85&travelmode=walking',
    '2026-07-24'
  );

INSERT OR REPLACE INTO preferred_origin_stations (station_id, updated_at)
VALUES
  ('ishikawacho', '2026-07-24T00:00:00.000Z'),
  ('isezakichojamachi', '2026-07-24T00:00:00.000Z');
