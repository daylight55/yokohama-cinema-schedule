INSERT OR IGNORE INTO stations (
  id,
  name,
  latitude,
  longitude,
  source_url,
  updated_at
)
VALUES (
  'kamiooka',
  '上大岡駅',
  35.409024,
  139.595991,
  'https://www.google.com/maps/search/?api=1&query=%E4%B8%8A%E5%A4%A7%E5%B2%A1%E9%A7%85',
  '2026-07-26T00:00:00.000Z'
);

INSERT OR IGNORE INTO station_connections (
  station_a_id,
  station_b_id,
  line_name,
  transport_mode,
  ride_minutes,
  headway_minutes,
  transfer_minutes,
  source_url,
  verified_at
)
VALUES (
  'yokohama',
  'kamiooka',
  '京急本線',
  'train',
  8,
  5,
  5,
  'https://www.jorudan.co.jp/time/to/%E6%A8%AA%E6%B5%9C_%E4%B8%8A%E5%A4%A7%E5%B2%A1/?r=%E4%BA%AC%E6%80%A5%E6%9C%AC%E7%B7%9A',
  '2026-07-26'
);

INSERT OR IGNORE INTO cinemas (
  id,
  name,
  short_name,
  area,
  area_label,
  address,
  latitude,
  longitude,
  source_url,
  active_until,
  approval,
  updated_at,
  nearest_station_id,
  station_walk_minutes,
  station_walk_distance_meters,
  station_walk_source_url,
  station_access_verified_at
)
VALUES (
  'toho-kamiooka',
  'TOHOシネマズ 上大岡',
  'TOHO上大岡',
  'kamiooka',
  '上大岡',
  '横浜市港南区上大岡西1-18-5 mioka 3F',
  35.4075,
  139.59494,
  'https://hlo.tohotheater.jp/net/schedule/066/TNPI2000J01.do',
  NULL,
  'private_only',
  '2026-07-26T00:00:00.000Z',
  'kamiooka',
  3,
  200,
  'https://www.google.com/maps/dir/?api=1&origin=%E4%B8%8A%E5%A4%A7%E5%B2%A1%E9%A7%85&destination=TOHO%E3%82%B7%E3%83%8D%E3%83%9E%E3%82%BA%E4%B8%8A%E5%A4%A7%E5%B2%A1&travelmode=walking',
  '2026-07-26'
);
