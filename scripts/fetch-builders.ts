/**
 * fetch-builders.ts
 *
 * Google Places API (Text Search v2 / New) を使って
 * TX・FL の主要都市のカスタムホームビルダーを検索し builders.csv に出力する。
 *
 * 使い方: scripts/README.md 参照
 *
 * 注意: PLACES_API_KEY は本番 SplanAI プロジェクトとは別の GCP プロジェクトのキーを使うこと。
 */

import * as fs from "fs";
import * as path from "path";

// ── 設定 ──────────────────────────────────────────────────────────────

const API_KEY = process.env.PLACES_API_KEY;
if (!API_KEY) {
  console.error("❌ PLACES_API_KEY が未設定です。scripts/README.md を参照してください。");
  process.exit(1);
}

const OUTPUT_FILE = path.join(process.cwd(), "builders.csv");
const SLEEP_MS    = 300; // 都市間の待機時間 (レート制限対策)

// FieldMask: コスト最小化のため必要フィールドのみ指定
// Text Search (New) は Basic, Advanced, Preferred の3段階課金
// displayName / formattedAddress / nationalPhoneNumber / websiteUri は Basic ($0.016/req)
const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
].join(",");

// ── 対象都市リスト (TX 15都市 + FL 15都市 = 30都市) ──────────────────

const CITIES: { city: string; state: string }[] = [
  // Texas
  { city: "Houston",       state: "TX" },
  { city: "Dallas",        state: "TX" },
  { city: "Austin",        state: "TX" },
  { city: "San Antonio",   state: "TX" },
  { city: "Fort Worth",    state: "TX" },
  { city: "El Paso",       state: "TX" },
  { city: "Arlington",     state: "TX" },
  { city: "Corpus Christi",state: "TX" },
  { city: "Plano",         state: "TX" },
  { city: "Lubbock",       state: "TX" },
  { city: "Frisco",        state: "TX" },
  { city: "McKinney",      state: "TX" },
  { city: "Laredo",        state: "TX" },
  { city: "Garland",       state: "TX" },
  { city: "Irving",        state: "TX" },
  // Florida
  { city: "Miami",         state: "FL" },
  { city: "Orlando",       state: "FL" },
  { city: "Tampa",         state: "FL" },
  { city: "Jacksonville",  state: "FL" },
  { city: "Fort Lauderdale",state: "FL" },
  { city: "St. Petersburg", state: "FL" },
  { city: "Hialeah",       state: "FL" },
  { city: "Tallahassee",   state: "FL" },
  { city: "Cape Coral",    state: "FL" },
  { city: "Boca Raton",    state: "FL" },
  { city: "Sarasota",      state: "FL" },
  { city: "Naples",        state: "FL" },
  { city: "Palm Beach",    state: "FL" },
  { city: "Gainesville",   state: "FL" },
  { city: "Pensacola",     state: "FL" },
];

// ── 型定義 ────────────────────────────────────────────────────────────

interface PlaceResult {
  displayName?:        { text?: string };
  formattedAddress?:   string;
  nationalPhoneNumber?:string;
  websiteUri?:         string;
}

interface PlacesApiResponse {
  places?: PlaceResult[];
  error?: { message: string; status: string };
}

interface BuilderRecord {
  name:    string;
  address: string;
  phone:   string;
  website: string;
  city:    string;
  state:   string;
}

// ── ユーティリティ ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toRow(r: BuilderRecord): string {
  return [r.name, r.address, r.phone, r.website, r.city, r.state]
    .map(escapeCsv)
    .join(",");
}

// ── API 呼び出し ──────────────────────────────────────────────────────

async function searchBuilders(city: string, state: string): Promise<BuilderRecord[]> {
  const query = `custom home builder ${city} ${state}`;
  const url   = "https://places.googleapis.com/v1/places:searchText";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "X-Goog-Api-Key": API_KEY!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery:     query,
      languageCode:  "en",
      regionCode:    "US",
      maxResultCount: 20, // 上限 20件/リクエスト
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${city}, ${state}: ${text}`);
  }

  const data = await res.json() as PlacesApiResponse;

  if (data.error) {
    throw new Error(`API error for ${city}, ${state}: ${data.error.message}`);
  }

  return (data.places ?? []).map(p => ({
    name:    p.displayName?.text          ?? "",
    address: p.formattedAddress           ?? "",
    phone:   p.nationalPhoneNumber        ?? "",
    website: p.websiteUri                 ?? "",
    city,
    state,
  }));
}

// ── メイン ────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔍 ${CITIES.length} 都市を検索します...`);
  console.log(`📄 出力先: ${OUTPUT_FILE}\n`);

  const header = "name,address,phone,website,city,state";
  const rows: string[] = [header];
  let total = 0;
  let errors = 0;

  for (const { city, state } of CITIES) {
    try {
      process.stdout.write(`  ${city}, ${state} ... `);
      const results = await searchBuilders(city, state);
      rows.push(...results.map(toRow));
      total += results.length;
      console.log(`${results.length} 件`);
    } catch (err) {
      errors++;
      console.error(`❌ エラー: ${(err as Error).message}`);
    }

    await sleep(SLEEP_MS);
  }

  fs.writeFileSync(OUTPUT_FILE, rows.join("\n"), "utf-8");

  console.log(`\n✅ 完了`);
  console.log(`   合計: ${total} 件`);
  console.log(`   エラー: ${errors} 都市`);
  console.log(`   出力: ${OUTPUT_FILE}`);
  if (errors > 0) {
    console.log("\n⚠️  エラーが発生した都市は CSV に含まれていません。");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
