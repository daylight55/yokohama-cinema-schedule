import type { AuthContextData, PagesEnv } from "../../_lib/env";
import { locationFeatureUnavailable } from "../../_lib/location-feature";

export const onRequestGet: PagesFunction<PagesEnv, "cinemaId", AuthContextData> =
  async () => locationFeatureUnavailable();
