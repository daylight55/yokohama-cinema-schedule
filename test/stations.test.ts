import { describe, expect, it } from "vitest";
import {
  buildTransitRoutes,
  TRANSIT_BUFFER_MINUTES,
} from "../functions/api/routes";
import {
  estimateStationTravel,
  estimateWalksToStations,
} from "../functions/_lib/stations";
import type {
  Cinema,
  Station,
  StationConnection,
} from "../shared/types";

const stations: Station[] = [
  {
    id: "yokohama",
    name: "横浜駅",
    latitude: 35.466188,
    longitude: 139.622715,
  },
  {
    id: "sakuragicho",
    name: "桜木町駅",
    latitude: 35.450849,
    longitude: 139.631044,
  },
  {
    id: "kannai",
    name: "関内駅",
    latitude: 35.443336,
    longitude: 139.636563,
  },
  {
    id: "ishikawacho",
    name: "石川町駅",
    latitude: 35.438704,
    longitude: 139.645721,
  },
  {
    id: "isezakichojamachi",
    name: "伊勢佐木長者町駅",
    latitude: 35.441019,
    longitude: 139.633011,
  },
  {
    id: "koganecho",
    name: "黄金町駅",
    latitude: 35.439421,
    longitude: 139.622531,
  },
  {
    id: "minatomirai",
    name: "みなとみらい駅",
    latitude: 35.457497,
    longitude: 139.632784,
  },
  {
    id: "tobe",
    name: "戸部駅",
    latitude: 35.456764,
    longitude: 139.619778,
  },
];

const connection = (
  stationAId: string,
  stationBId: string,
  lineName: string,
  rideMinutes: number,
  headwayMinutes: number,
  transportMode: StationConnection["transportMode"] = "train",
): StationConnection => ({
  stationAId,
  stationBId,
  lineName,
  transportMode,
  rideMinutes,
  headwayMinutes,
  transferMinutes: transportMode === "train" ? 5 : 0,
});

const connections: StationConnection[] = [
  connection("yokohama", "sakuragicho", "JR根岸線", 4, 4),
  connection(
    "yokohama",
    "sakuragicho",
    "横浜市営地下鉄ブルーライン",
    2,
    7,
  ),
  connection("sakuragicho", "kannai", "JR根岸線", 2, 4),
  connection("kannai", "ishikawacho", "JR根岸線", 2, 4),
  connection(
    "sakuragicho",
    "isezakichojamachi",
    "横浜市営地下鉄ブルーライン",
    4,
    7,
  ),
  connection(
    "kannai",
    "isezakichojamachi",
    "徒歩連絡",
    8,
    0,
    "walk",
  ),
  connection(
    "isezakichojamachi",
    "koganecho",
    "徒歩連絡",
    18,
    0,
    "walk",
  ),
  connection("yokohama", "minatomirai", "みなとみらい線", 3, 4),
  connection("sakuragicho", "minatomirai", "徒歩連絡", 12, 0, "walk"),
  connection("yokohama", "tobe", "京急本線", 2, 6),
  connection("yokohama", "koganecho", "京急本線", 5, 6),
];

const cinema = (
  id: string,
  nearestStationId: string,
  stationWalkMinutes: number,
): Cinema => ({
  id,
  name: id,
  shortName: id,
  area: "kannai",
  areaLabel: "関内",
  address: "横浜市",
  latitude: 35.44,
  longitude: 139.63,
  sourceUrl: "https://example.com",
  activeUntil: null,
  approval: "private_only",
  nearestStationId,
  stationWalkMinutes,
  stationWalkDistanceMeters: 300,
});

describe("station travel estimates", () => {
  it("keeps one initial wait while riding the same JR line", () => {
    expect(
      estimateStationTravel("ishikawacho", "yokohama", connections),
    ).toEqual({
      minutes: 10,
      lines: ["JR根岸線"],
    });
  });

  it("uses the direct Blue Line estimate from Isezaki-Chojamachi", () => {
    expect(
      estimateStationTravel(
        "isezakichojamachi",
        "sakuragicho",
        connections,
      ),
    ).toEqual({
      minutes: 8,
      lines: ["横浜市営地下鉄ブルーライン"],
    });
  });

  it("can combine JR with a stored walking connection", () => {
    expect(
      estimateStationTravel(
        "ishikawacho",
        "isezakichojamachi",
        connections,
      ),
    ).toEqual({
      minutes: 12,
      lines: ["JR根岸線"],
    });
  });

  it.each([
    ["yokohama", 10, 10],
    ["sakuragicho", 6, 8],
    ["minatomirai", 18, 20],
    ["isezakichojamachi", 12, 0],
    ["koganecho", 23, 18],
    ["tobe", 20, 20],
  ])(
    "calculates %s from both configured origin stations",
    (destinationStationId, fromIshikawacho, fromIsezakiChojamachi) => {
      expect(
        estimateStationTravel(
          "ishikawacho",
          destinationStationId,
          connections,
        )?.minutes,
      ).toBe(fromIshikawacho);
      expect(
        estimateStationTravel(
          "isezakichojamachi",
          destinationStationId,
          connections,
        )?.minutes,
      ).toBe(fromIsezakiChojamachi);
    },
  );
});

describe("walking access to stations", () => {
  it("matches unordered Google route-matrix rows to station indexes", async () => {
    const fetcher = (async () =>
      Response.json([
        {
          destinationIndex: 1,
          distanceMeters: 900,
          duration: "601s",
          condition: "ROUTE_EXISTS",
        },
        {
          destinationIndex: 0,
          distanceMeters: 300,
          duration: "180s",
          condition: "ROUTE_EXISTS",
        },
      ])) as typeof fetch;

    const result = await estimateWalksToStations(
      35.44,
      139.63,
      stations.slice(0, 2),
      "test-key",
      fetcher,
    );

    expect(
      result.map(({ station, durationMinutes, provider }) => ({
        stationId: station.id,
        durationMinutes,
        provider,
      })),
    ).toEqual([
      {
        stationId: "yokohama",
        durationMinutes: 3,
        provider: "google_maps",
      },
      {
        stationId: "sakuragicho",
        durationMinutes: 11,
        provider: "google_maps",
      },
    ]);
  });
});

describe("cinema transit routes", () => {
  it("chooses between Ishikawacho and Isezaki-Chojamachi per cinema", () => {
    const stationWalks = [
      {
        station: stations.find(({ id }) => id === "kannai")!,
        distanceMeters: 80,
        durationMinutes: 1,
        provider: "google_maps" as const,
      },
      {
        station: stations.find(({ id }) => id === "ishikawacho")!,
        distanceMeters: 400,
        durationMinutes: 6,
        provider: "google_maps" as const,
      },
      {
        station: stations.find(({ id }) => id === "isezakichojamachi")!,
        distanceMeters: 500,
        durationMinutes: 7,
        provider: "google_maps" as const,
      },
    ];
    const routes = buildTransitRoutes(
      35.44,
      139.64,
      [
        cinema("burg", "sakuragicho", 2),
        cinema("cinemarine", "isezakichojamachi", 6),
      ],
      stationWalks,
      stations,
      connections,
      new Set(["ishikawacho", "isezakichojamachi"]),
    );

    expect(routes.get("burg")).toMatchObject({
      durationMinutes: 24,
      bufferMinutes: TRANSIT_BUFFER_MINUTES,
      provider: "custom",
      transitDetails: {
        originStationId: "ishikawacho",
        destinationStationId: "sakuragicho",
        originWalkMinutes: 6,
        stationTravelMinutes: 6,
        destinationWalkMinutes: 2,
      },
    });
    expect(routes.get("cinemarine")).toMatchObject({
      durationMinutes: 23,
      transitDetails: {
        originStationId: "isezakichojamachi",
        destinationStationId: "isezakichojamachi",
        originWalkMinutes: 7,
        stationTravelMinutes: 0,
        destinationWalkMinutes: 6,
      },
    });
  });
});
