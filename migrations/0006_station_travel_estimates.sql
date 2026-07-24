CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  source_url TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS station_connections (
  station_a_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  station_b_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  line_name TEXT NOT NULL,
  transport_mode TEXT NOT NULL CHECK (transport_mode IN ('train', 'walk')),
  ride_minutes INTEGER NOT NULL CHECK (ride_minutes >= 0),
  headway_minutes INTEGER NOT NULL CHECK (headway_minutes >= 0),
  transfer_minutes INTEGER NOT NULL DEFAULT 5 CHECK (transfer_minutes >= 0),
  source_url TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (station_a_id, station_b_id, line_name)
);

ALTER TABLE cinemas ADD COLUMN nearest_station_id TEXT REFERENCES stations(id);
ALTER TABLE cinemas ADD COLUMN station_walk_minutes INTEGER CHECK (station_walk_minutes >= 0);
ALTER TABLE cinemas ADD COLUMN station_walk_distance_meters INTEGER CHECK (station_walk_distance_meters >= 0);
ALTER TABLE cinemas ADD COLUMN station_walk_source_url TEXT;
ALTER TABLE cinemas ADD COLUMN station_access_verified_at TEXT;

INSERT OR REPLACE INTO stations (
  id, name, latitude, longitude, source_url, updated_at
) VALUES
  (
    'yokohama', '横浜駅', 35.466188, 139.622715,
    'https://www.google.com/maps/search/?api=1&query=%E6%A8%AA%E6%B5%9C%E9%A7%85',
    '2026-07-24T00:00:00.000Z'
  ),
  (
    'sakuragicho', '桜木町駅', 35.450849, 139.631044,
    'https://www.google.com/maps/search/?api=1&query=%E6%A1%9C%E6%9C%A8%E7%94%BA%E9%A7%85',
    '2026-07-24T00:00:00.000Z'
  ),
  (
    'minatomirai', 'みなとみらい駅', 35.457497, 139.632784,
    'https://www.google.com/maps/search/?api=1&query=%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84%E9%A7%85',
    '2026-07-24T00:00:00.000Z'
  ),
  (
    'kannai', '関内駅', 35.443336, 139.636563,
    'https://www.google.com/maps/search/?api=1&query=%E9%96%A2%E5%86%85%E9%A7%85',
    '2026-07-24T00:00:00.000Z'
  ),
  (
    'isezakichojamachi', '伊勢佐木長者町駅', 35.441019, 139.633011,
    'https://www.google.com/maps/search/?api=1&query=%E4%BC%8A%E5%8B%A2%E4%BD%90%E6%9C%A8%E9%95%B7%E8%80%85%E7%94%BA%E9%A7%85',
    '2026-07-24T00:00:00.000Z'
  ),
  (
    'tobe', '戸部駅', 35.456764, 139.619778,
    'https://www.google.com/maps/search/?api=1&query=%E6%88%B8%E9%83%A8%E9%A7%85',
    '2026-07-24T00:00:00.000Z'
  ),
  (
    'koganecho', '黄金町駅', 35.439421, 139.622531,
    'https://www.google.com/maps/search/?api=1&query=%E9%BB%84%E9%87%91%E7%94%BA%E9%A7%85',
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
    'yokohama', 'sakuragicho', 'JR根岸線', 'train', 4, 4, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E6%A1%9C%E6%9C%A8%E7%94%BA',
    '2026-07-24'
  ),
  (
    'yokohama', 'sakuragicho', '横浜市営地下鉄ブルーライン', 'train', 2, 7, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E6%A1%9C%E6%9C%A8%E7%94%BA',
    '2026-07-24'
  ),
  (
    'sakuragicho', 'kannai', 'JR根岸線', 'train', 2, 4, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E9%96%A2%E5%86%85',
    '2026-07-24'
  ),
  (
    'yokohama', 'kannai', '横浜市営地下鉄ブルーライン', 'train', 5, 5, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E9%96%A2%E5%86%85',
    '2026-07-24'
  ),
  (
    'yokohama', 'isezakichojamachi', '横浜市営地下鉄ブルーライン', 'train', 7, 7, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E4%BC%8A%E5%8B%A2%E4%BD%90%E6%9C%A8%E9%95%B7%E8%80%85%E7%94%BA',
    '2026-07-24'
  ),
  (
    'kannai', 'isezakichojamachi', '横浜市営地下鉄ブルーライン', 'train', 2, 7, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E4%BC%8A%E5%8B%A2%E4%BD%90%E6%9C%A8%E9%95%B7%E8%80%85%E7%94%BA',
    '2026-07-24'
  ),
  (
    'yokohama', 'minatomirai', 'みなとみらい線', 'train', 3, 4, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84',
    '2026-07-24'
  ),
  (
    'yokohama', 'tobe', '京急本線', 'train', 2, 6, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E6%88%B8%E9%83%A8',
    '2026-07-24'
  ),
  (
    'yokohama', 'koganecho', '京急本線', 'train', 5, 6, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E9%BB%84%E9%87%91%E7%94%BA',
    '2026-07-24'
  ),
  (
    'tobe', 'koganecho', '京急本線', 'train', 3, 6, 5,
    'https://transit.yahoo.co.jp/search/result/%E6%A8%AA%E6%B5%9C-%E9%BB%84%E9%87%91%E7%94%BA',
    '2026-07-24'
  ),
  (
    'sakuragicho', 'minatomirai', '徒歩連絡', 'walk', 12, 0, 0,
    'https://www.google.com/maps/dir/?api=1&origin=%E6%A1%9C%E6%9C%A8%E7%94%BA%E9%A7%85&destination=%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84%E9%A7%85&travelmode=walking',
    '2026-07-24'
  );

UPDATE cinemas
SET
  nearest_station_id = 'yokohama',
  station_walk_minutes = 2,
  station_walk_distance_meters = 80,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E6%A8%AA%E6%B5%9C%E9%A7%85&destination=T%E3%83%BB%E3%82%B8%E3%83%A7%E3%82%A4%E6%A8%AA%E6%B5%9C&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'tjoy-yokohama';

UPDATE cinemas
SET
  nearest_station_id = 'yokohama',
  station_walk_minutes = 10,
  station_walk_distance_meters = 699,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E6%A8%AA%E6%B5%9C%E9%A7%85&destination=%E3%83%A0%E3%83%BC%E3%83%93%E3%83%AB&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'movil';

UPDATE cinemas
SET
  nearest_station_id = 'sakuragicho',
  station_walk_minutes = 2,
  station_walk_distance_meters = 148,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E6%A1%9C%E6%9C%A8%E7%94%BA%E9%A7%85&destination=%E6%A8%AA%E6%B5%9C%E3%83%96%E3%83%AB%E3%82%AF13&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'yokohama-burg13';

UPDATE cinemas
SET
  nearest_station_id = 'minatomirai',
  station_walk_minutes = 11,
  station_walk_distance_meters = 777,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84%E9%A7%85&destination=%E3%82%A4%E3%82%AA%E3%83%B3%E3%82%B7%E3%83%8D%E3%83%9E%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'aeon-minatomirai';

UPDATE cinemas
SET
  nearest_station_id = 'minatomirai',
  station_walk_minutes = 3,
  station_walk_distance_meters = 163,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84%E9%A7%85&destination=MARK+IS+%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'united-minatomirai';

UPDATE cinemas
SET
  nearest_station_id = 'minatomirai',
  station_walk_minutes = 9,
  station_walk_distance_meters = 601,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84%E9%A7%85&destination=kino+cin%C3%A9ma%E6%A8%AA%E6%B5%9C%E3%81%BF%E3%81%AA%E3%81%A8%E3%81%BF%E3%82%89%E3%81%84&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'kino-minatomirai';

UPDATE cinemas
SET
  nearest_station_id = 'isezakichojamachi',
  station_walk_minutes = 6,
  station_walk_distance_meters = 350,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E4%BC%8A%E5%8B%A2%E4%BD%90%E6%9C%A8%E9%95%B7%E8%80%85%E7%94%BA%E9%A7%85&destination=%E6%A8%AA%E6%B5%9C%E3%82%B7%E3%83%8D%E3%83%9E%E3%83%AA%E3%83%B3&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'cinemarine';

UPDATE cinemas
SET
  nearest_station_id = 'koganecho',
  station_walk_minutes = 6,
  station_walk_distance_meters = 395,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E9%BB%84%E9%87%91%E7%94%BA%E9%A7%85&destination=%E3%82%B7%E3%83%8D%E3%83%9E%E3%83%BB%E3%82%B8%E3%83%A3%E3%83%83%E3%82%AF%EF%BC%86%E3%83%99%E3%83%86%E3%82%A3&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'jack-and-betty';

UPDATE cinemas
SET
  nearest_station_id = 'tobe',
  station_walk_minutes = 14,
  station_walk_distance_meters = 925,
  station_walk_source_url = 'https://www.google.com/maps/dir/?api=1&origin=%E6%88%B8%E9%83%A8%E9%A7%85&destination=%E3%82%B7%E3%83%8D%E3%83%9E%E3%83%8E%E3%83%B4%E3%82%A7%E3%83%81%E3%82%A7%E3%83%B3%E3%83%88&travelmode=walking',
  station_access_verified_at = '2026-07-24'
WHERE id = 'novecento';

CREATE INDEX IF NOT EXISTS idx_cinemas_nearest_station
  ON cinemas(nearest_station_id);
