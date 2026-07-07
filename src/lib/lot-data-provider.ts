import { getMarketPack, type LotDataProviderId, type Market } from "@/lib/market";

export interface LotDataProvider {
  id: LotDataProviderId;
  label: string;
  market: Market | "any";
  enabledByDefault: boolean;
}

export const LOT_DATA_PROVIDERS: Record<LotDataProviderId, LotDataProvider> = {
  manual: {
    id: "manual",
    label: "Manual entry",
    market: "any",
    enabledByDefault: true,
  },
  "us-trestle": {
    id: "us-trestle",
    label: "Trestle MLS",
    market: "us",
    enabledByDefault: false,
  },
};

export function defaultLotDataProvider(market: Market = "us"): LotDataProvider {
  return LOT_DATA_PROVIDERS[getMarketPack(market).lotDataProvider];
}

export function normalizeLotDataProvider(value: unknown, market: Market = "us"): LotDataProvider {
  if (value === "us-trestle" && market === "us") return LOT_DATA_PROVIDERS["us-trestle"];
  return defaultLotDataProvider(market);
}
