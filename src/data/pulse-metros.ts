// Metro registry for /pulse (P-A Builder Market Pulse).
//
// FABRICATION-ZERO POLICY: this file contains NO market statistics. Every
// number rendered on /pulse pages is either (a) fetched at cron time from the
// named public series below (U.S. Census Bureau Building Permits Survey and
// Freddie Mac PMMS, both published through FRED) or (b) computed from
// SplanAI's own database with an n>=10 floor and an explicit "based on N
// samples" label. Anything unsourced renders as "n/a" — never an estimate.
//
// Series IDs verified 2026-07-02 against fred.stlouisfed.org (all monthly,
// not seasonally adjusted, units = single-family (1-unit) housing units
// authorized by building permits for the MSA).
//
// Metro list = the outreach target metros (obsidian-vault:
// SplanAI/40_Outreach/target_companies.csv). Austin has no CSV rows yet but
// stays in per the P-A task spec (top homebuilding metro in the ICP band).

export interface PulseMetro {
  /** URL segment: /pulse/<slug> */
  slug: string;
  /** Display name, e.g. "Dallas–Fort Worth" */
  name: string;
  /** Two-letter state code of the metro's anchor city */
  stateCode: string;
  /** Census MSA title the permit series covers */
  msaName: string;
  /** FRED series: "New Private Housing Units Authorized by Building Permits: 1-Unit Structures for <MSA>" */
  fredPermitsSeriesId: string;
  /** Public source URL for the permit series */
  fredSeriesUrl: string;
}

export const PULSE_METROS: PulseMetro[] = [
  {
    slug: "raleigh",
    name: "Raleigh",
    stateCode: "NC",
    msaName: "Raleigh-Cary, NC",
    fredPermitsSeriesId: "RALE537BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/RALE537BP1FH",
  },
  {
    slug: "nashville",
    name: "Nashville",
    stateCode: "TN",
    msaName: "Nashville-Davidson--Murfreesboro--Franklin, TN",
    fredPermitsSeriesId: "NASH947BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/NASH947BP1FH",
  },
  {
    slug: "austin",
    name: "Austin",
    stateCode: "TX",
    msaName: "Austin-Round Rock-Georgetown, TX",
    fredPermitsSeriesId: "AUST448BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/AUST448BP1FH",
  },
  {
    slug: "dallas-fort-worth",
    name: "Dallas–Fort Worth",
    stateCode: "TX",
    msaName: "Dallas-Fort Worth-Arlington, TX",
    fredPermitsSeriesId: "DALL148BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/DALL148BP1FH",
  },
  {
    slug: "charlotte",
    name: "Charlotte",
    stateCode: "NC",
    msaName: "Charlotte-Concord-Gastonia, NC-SC",
    fredPermitsSeriesId: "CHAR737BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/CHAR737BP1FH",
  },
  {
    slug: "boise",
    name: "Boise",
    stateCode: "ID",
    msaName: "Boise City, ID",
    fredPermitsSeriesId: "BOIS216BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/BOIS216BP1FH",
  },
  {
    slug: "phoenix",
    name: "Phoenix",
    stateCode: "AZ",
    msaName: "Phoenix-Mesa-Chandler, AZ",
    fredPermitsSeriesId: "PHOE004BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/PHOE004BP1FH",
  },
  {
    slug: "atlanta",
    name: "Atlanta",
    stateCode: "GA",
    msaName: "Atlanta-Sandy Springs-Alpharetta, GA",
    fredPermitsSeriesId: "ATLA013BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/ATLA013BP1FH",
  },
  {
    slug: "tampa",
    name: "Tampa",
    stateCode: "FL",
    msaName: "Tampa-St. Petersburg-Clearwater, FL",
    fredPermitsSeriesId: "TAMP312BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/TAMP312BP1FH",
  },
  {
    slug: "jacksonville",
    name: "Jacksonville",
    stateCode: "FL",
    msaName: "Jacksonville, FL",
    fredPermitsSeriesId: "JACK212BP1FH",
    fredSeriesUrl: "https://fred.stlouisfed.org/series/JACK212BP1FH",
  },
];

export const PULSE_METRO_SLUGS = PULSE_METROS.map((m) => m.slug);

export function getPulseMetro(slug: string): PulseMetro | undefined {
  return PULSE_METROS.find((m) => m.slug === slug);
}
