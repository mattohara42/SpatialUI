import { countryOf } from './countries';

/**
 * Land borders, between countries that share a UN subregion.
 *
 * This is the first real link topology in the project. The league's grafts are
 * division rivalries — real, but a grouping the schedule already expresses — and
 * the book's are a correlation computed from the same bars that drive the
 * plants. Neither is a fact about the world that exists independently of the
 * data feeding the garden. A shared land border is.
 *
 * **Why only within a subregion.** Grafts are drawn between plants, and a bed
 * is where a plant stands, so a border that crosses subregions draws a root the
 * length of the greenhouse — legible as a line, useless as a reading, and the
 * failure `layout.ts` already warns about in its recorded assumption. Scoping to
 * the bed keeps every graft local. The cost is stated rather than hidden: Egypt
 * and Israel share a border and this table does not know it, so what is drawn is
 * "neighbours within this region" and never "all of this country's neighbours".
 *
 * That also means several beds have no grafts at all. Micronesia and Polynesia
 * are islands; Northern America has one border in it. An empty set here is the
 * honest answer rather than a gap to fill.
 */

/** Unordered pairs of ISO3 codes. Each border appears once. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  // Northern Africa
  ['DZA', 'LBY'], ['DZA', 'MAR'], ['DZA', 'TUN'], ['LBY', 'TUN'],
  ['LBY', 'SDN'], ['EGY', 'LBY'], ['EGY', 'SDN'],

  // Eastern Africa
  ['BDI', 'RWA'], ['BDI', 'TZA'], ['RWA', 'TZA'], ['RWA', 'UGA'],
  ['UGA', 'TZA'], ['UGA', 'KEN'], ['UGA', 'SSD'], ['KEN', 'TZA'],
  ['KEN', 'SSD'], ['KEN', 'ETH'], ['KEN', 'SOM'], ['ETH', 'SSD'],
  ['ETH', 'SOM'], ['ETH', 'ERI'], ['ETH', 'DJI'], ['ERI', 'DJI'],
  ['DJI', 'SOM'], ['MWI', 'TZA'], ['MWI', 'MOZ'], ['MWI', 'ZMB'],
  ['MOZ', 'TZA'], ['MOZ', 'ZMB'], ['MOZ', 'ZWE'], ['ZMB', 'TZA'],
  ['ZMB', 'ZWE'],

  // Middle Africa
  ['AGO', 'COD'], ['AGO', 'COG'], ['CMR', 'TCD'], ['CMR', 'CAF'],
  ['CMR', 'COG'], ['CMR', 'GNQ'], ['CMR', 'GAB'], ['CAF', 'TCD'],
  ['CAF', 'COD'], ['CAF', 'COG'], ['COG', 'COD'], ['COG', 'GAB'],
  ['GAB', 'GNQ'],

  // Southern Africa
  ['BWA', 'NAM'], ['BWA', 'ZAF'], ['ZAF', 'NAM'], ['ZAF', 'LSO'],
  ['ZAF', 'SWZ'],

  // Western Africa
  ['BEN', 'BFA'], ['BEN', 'NER'], ['BEN', 'NGA'], ['BEN', 'TGO'],
  ['BFA', 'CIV'], ['BFA', 'GHA'], ['BFA', 'MLI'], ['BFA', 'NER'],
  ['BFA', 'TGO'], ['CIV', 'GHA'], ['CIV', 'GIN'], ['CIV', 'LBR'],
  ['CIV', 'MLI'], ['GHA', 'TGO'], ['GIN', 'GNB'], ['GIN', 'LBR'],
  ['GIN', 'MLI'], ['GIN', 'SEN'], ['GIN', 'SLE'], ['GNB', 'SEN'],
  ['LBR', 'SLE'], ['MLI', 'MRT'], ['MLI', 'NER'], ['MLI', 'SEN'],
  ['MRT', 'SEN'], ['NER', 'NGA'], ['GMB', 'SEN'],

  // Northern America
  ['CAN', 'USA'],

  // Caribbean
  ['HTI', 'DOM'],

  // Central America
  ['BLZ', 'GTM'], ['BLZ', 'MEX'], ['CRI', 'NIC'], ['CRI', 'PAN'],
  ['SLV', 'GTM'], ['SLV', 'HND'], ['GTM', 'HND'], ['GTM', 'MEX'],
  ['HND', 'NIC'],

  // South America
  ['ARG', 'BOL'], ['ARG', 'BRA'], ['ARG', 'CHL'], ['ARG', 'PRY'],
  ['ARG', 'URY'], ['BOL', 'BRA'], ['BOL', 'CHL'], ['BOL', 'PRY'],
  ['BOL', 'PER'], ['BRA', 'COL'], ['BRA', 'GUY'], ['BRA', 'PRY'],
  ['BRA', 'PER'], ['BRA', 'SUR'], ['BRA', 'URY'], ['BRA', 'VEN'],
  ['CHL', 'PER'], ['COL', 'ECU'], ['COL', 'PER'], ['COL', 'VEN'],
  ['ECU', 'PER'], ['GUY', 'SUR'], ['GUY', 'VEN'],

  // Central Asia
  ['KAZ', 'KGZ'], ['KAZ', 'TKM'], ['KAZ', 'UZB'], ['KGZ', 'TJK'],
  ['KGZ', 'UZB'], ['TJK', 'UZB'], ['TKM', 'UZB'],

  // Eastern Asia
  ['CHN', 'MNG'], ['CHN', 'PRK'], ['PRK', 'KOR'],

  // South-Eastern Asia
  ['BRN', 'MYS'], ['KHM', 'LAO'], ['KHM', 'THA'], ['KHM', 'VNM'],
  ['IDN', 'MYS'], ['IDN', 'TLS'], ['LAO', 'MMR'], ['LAO', 'THA'],
  ['LAO', 'VNM'], ['MYS', 'THA'], ['MMR', 'THA'],

  // Southern Asia
  ['AFG', 'IRN'], ['AFG', 'PAK'], ['BGD', 'IND'], ['BTN', 'IND'],
  ['IND', 'NPL'], ['IND', 'PAK'], ['IRN', 'PAK'],

  // Western Asia
  ['ARM', 'AZE'], ['ARM', 'GEO'], ['ARM', 'TUR'], ['AZE', 'GEO'],
  ['AZE', 'TUR'], ['GEO', 'TUR'], ['IRQ', 'JOR'], ['IRQ', 'KWT'],
  ['IRQ', 'SAU'], ['IRQ', 'SYR'], ['IRQ', 'TUR'], ['ISR', 'JOR'],
  ['ISR', 'LBN'], ['ISR', 'SYR'], ['JOR', 'SAU'], ['JOR', 'SYR'],
  ['KWT', 'SAU'], ['LBN', 'SYR'], ['OMN', 'SAU'], ['OMN', 'ARE'],
  ['OMN', 'YEM'], ['QAT', 'SAU'], ['SAU', 'ARE'], ['SAU', 'YEM'],
  ['SYR', 'TUR'],

  // Eastern Europe
  ['BLR', 'POL'], ['BLR', 'RUS'], ['BLR', 'UKR'], ['BGR', 'ROU'],
  ['CZE', 'POL'], ['CZE', 'SVK'], ['HUN', 'ROU'], ['HUN', 'SVK'],
  ['HUN', 'UKR'], ['POL', 'RUS'], ['POL', 'SVK'], ['POL', 'UKR'],
  ['MDA', 'ROU'], ['MDA', 'UKR'], ['ROU', 'UKR'], ['RUS', 'UKR'],
  ['SVK', 'UKR'],

  // Northern Europe
  ['EST', 'LVA'], ['LVA', 'LTU'], ['FIN', 'NOR'], ['FIN', 'SWE'],
  ['NOR', 'SWE'], ['IRL', 'GBR'],

  // Southern Europe
  ['ALB', 'GRC'], ['ALB', 'MKD'], ['ALB', 'MNE'], ['BIH', 'HRV'],
  ['BIH', 'MNE'], ['BIH', 'SRB'], ['HRV', 'SVN'], ['HRV', 'SRB'],
  ['HRV', 'MNE'], ['GRC', 'MKD'], ['ITA', 'SMR'], ['ITA', 'SVN'],
  ['MKD', 'SRB'], ['MNE', 'SRB'], ['PRT', 'ESP'],

  // Western Europe
  ['AUT', 'DEU'], ['AUT', 'CHE'], ['AUT', 'LIE'], ['BEL', 'FRA'],
  ['BEL', 'DEU'], ['BEL', 'LUX'], ['BEL', 'NLD'], ['FRA', 'DEU'],
  ['FRA', 'LUX'], ['FRA', 'MCO'], ['FRA', 'CHE'], ['DEU', 'LUX'],
  ['DEU', 'NLD'], ['DEU', 'CHE'], ['LIE', 'CHE'],

  // Australia & New Zealand, Melanesia, Micronesia, Polynesia: islands, and
  // Papua New Guinea's only land border is with Indonesia, in another subregion.
];

export interface Border {
  a: string;
  b: string;
}

/**
 * Every intra-subregion land border, normalized so `a` sorts before `b` and no
 * pair appears twice. Pairs naming a country not in the table, or spanning two
 * subregions, are dropped rather than trusted — a typo here would otherwise
 * draw a graft between two plants that never touch.
 */
export const BORDERS: readonly Border[] = (() => {
  const seen = new Set<string>();
  const out: Border[] = [];

  for (const [left, right] of PAIRS) {
    const [a, b] = left < right ? [left, right] : [right, left];
    const key = `${a}~${b}`;
    if (seen.has(key)) continue;

    const first = countryOf(a);
    const second = countryOf(b);
    if (!first || !second) continue;
    if (first.subregion !== second.subregion) continue;

    seen.add(key);
    out.push({ a, b });
  }

  return out;
})();

/** The neighbours of a country, within its own subregion. */
export function neighboursOf(iso3: string): string[] {
  const out: string[] = [];
  for (const border of BORDERS) {
    if (border.a === iso3) out.push(border.b);
    else if (border.b === iso3) out.push(border.a);
  }
  return out;
}
