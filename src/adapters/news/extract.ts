import { COUNTRIES } from '../world/countries';
import type { ConflictKind, UnrestKind } from '../world/types';
import type { Article } from './types';

/**
 * A headline, turned into a record.
 *
 * This is the layer neither existing adapter needed. A box score arrives with a
 * home team on it and a bar arrives with a symbol on it; a headline arrives with
 * a sentence, and somebody has to decide what it is about. That decision is made
 * here, in one pure function, where it can be read, tested, and disagreed with.
 *
 * **The governing rule is that this refuses to guess.** A headline it cannot
 * place confidently produces *no event at all*, and that is the correct output
 * rather than a shortfall. The cost of a miss is a country whose garden is
 * quieter than the world was. The cost of a wrong attribution is the app
 * asserting that something happened in a real country, in a panel that looks
 * exactly like the ones showing measured numbers. Those are not comparable, so
 * precision wins every time recall would like to.
 *
 * Three consequences follow, and all three are deliberate:
 *
 * - **Two countries in one headline yields nothing.** "Israel and Lebanon" is
 *   ambiguous about which garden plant the event belongs to, and picking the
 *   first one is picking arbitrarily. Real feeds do this constantly, so this
 *   discards real events. It is still the right trade.
 * - **Sport is discarded wholesale.** "Brazil beat Argentina" and "clash" in a
 *   match report are the single richest source of false conflict in a world
 *   feed. Anything carrying sporting vocabulary is dropped before it is
 *   classified.
 * - **Capitals are not surface forms.** "Washington", "Beijing", and "Brussels"
 *   are usually metonyms for an institution rather than a state, and "Georgia"
 *   is a country and a US state at once. Leaving capitals out costs recall and
 *   buys precision, which is the trade this whole module makes.
 *
 * The classifier is a keyword table on purpose. A model would do better and
 * would not be legible: nobody could read the docs and predict its output, and
 * the one thing this layer must be is *inspectable*, because everything it emits
 * ends up attached to the name of a real place.
 */

export type ExtractedKind = UnrestKind | ConflictKind;

export interface ExtractedEvent {
  iso3: string;
  kind: ExtractedKind;
  /** Epoch ms — the article's publication time. */
  at: number;
  /** 0..1. How serious the *report* reads. Never a measurement. */
  severity: number;
  /** The account this was derived from. Required; see the note above. */
  article: Article;
}

/**
 * Surface forms beyond the country's own name: common short names and
 * demonyms, since a world desk writes "Ukrainian forces" far more often than
 * "Ukraine forces".
 *
 * Incomplete on purpose, and safe to leave incomplete: a country with no entry
 * here is still matched by its name, and a demonym nobody listed produces a
 * miss rather than an error. Extending the table improves recall and cannot
 * damage precision, which is the property that makes it safe to grow.
 *
 * Two omissions worth naming. Bare "US" is not here — " us " is a pronoun and
 * would match half the feed — though "U.S." is, because the punctuation
 * survives normalization as a distinct token. Bare "America" is not here
 * either, because "Latin America" and "South America" would both match it.
 */
const ALIASES: Record<string, readonly string[]> = {
  USA: ['u.s.', 'usa', 'u.s.a.', 'united states of america', 'american', 'americans'],
  GBR: ['uk', 'u.k.', 'britain', 'great britain', 'british'],
  RUS: ['russian', 'russians'],
  CHN: ['chinese'],
  IND: ['indian', 'indians'],
  KOR: ['south korean', 'republic of korea'],
  PRK: ['north korean', 'dprk'],
  COD: ['dr congo', 'drc', 'democratic republic of the congo', 'democratic republic of congo'],
  COG: ['republic of the congo', 'congo-brazzaville'],
  CIV: ['ivory coast', 'ivorian'],
  TUR: ['turkey', 'turkish'],
  MMR: ['burma', 'burmese'],
  CPV: ['cape verde'],
  TLS: ['east timor', 'timorese'],
  SWZ: ['swaziland'],
  NLD: ['holland', 'dutch', 'the netherlands'],
  CHE: ['swiss'],
  DEU: ['german', 'germans'],
  FRA: ['french'],
  ESP: ['spanish'],
  ITA: ['italian'],
  PRT: ['portuguese'],
  GRC: ['greek'],
  POL: ['polish'],
  UKR: ['ukrainian', 'ukrainians'],
  BLR: ['belarusian'],
  CZE: ['czech', 'czech republic'],
  SVK: ['slovak'],
  SVN: ['slovenian'],
  HRV: ['croatian'],
  SRB: ['serbian', 'serbs'],
  BIH: ['bosnia', 'bosnian'],
  MKD: ['macedonia', 'macedonian'],
  MNE: ['montenegrin'],
  ALB: ['albanian'],
  ROU: ['romanian'],
  BGR: ['bulgarian'],
  HUN: ['hungarian'],
  AUT: ['austrian'],
  BEL: ['belgian'],
  SWE: ['swedish'],
  NOR: ['norwegian'],
  DNK: ['danish'],
  FIN: ['finnish'],
  ISL: ['icelandic'],
  IRL: ['irish'],
  EST: ['estonian'],
  LVA: ['latvian'],
  LTU: ['lithuanian'],
  JPN: ['japanese'],
  VNM: ['vietnam', 'vietnamese'],
  THA: ['thai'],
  PHL: ['filipino', 'philippine'],
  IDN: ['indonesian'],
  MYS: ['malaysian'],
  SGP: ['singaporean'],
  KHM: ['cambodian'],
  LAO: ['laotian'],
  BRN: ['bruneian', 'brunei darussalam'],
  PAK: ['pakistani'],
  BGD: ['bangladeshi'],
  LKA: ['sri lankan'],
  NPL: ['nepali', 'nepalese'],
  AFG: ['afghan', 'afghans'],
  IRN: ['iranian', 'iranians'],
  IRQ: ['iraqi', 'iraqis'],
  SYR: ['syrian', 'syrians'],
  LBN: ['lebanese'],
  ISR: ['israeli', 'israelis'],
  JOR: ['jordanian'],
  SAU: ['saudi', 'saudis', 'saudi arabian'],
  ARE: ['uae', 'u.a.e.', 'emirati'],
  QAT: ['qatari'],
  KWT: ['kuwaiti'],
  OMN: ['omani'],
  BHR: ['bahraini'],
  YEM: ['yemeni', 'yemenis'],
  EGY: ['egyptian', 'egyptians'],
  LBY: ['libyan'],
  TUN: ['tunisian'],
  DZA: ['algerian'],
  MAR: ['moroccan'],
  SDN: ['sudanese'],
  SSD: ['south sudanese'],
  ETH: ['ethiopian'],
  ERI: ['eritrean'],
  SOM: ['somali', 'somalis'],
  KEN: ['kenyan'],
  UGA: ['ugandan'],
  TZA: ['tanzanian'],
  RWA: ['rwandan'],
  BDI: ['burundian'],
  NGA: ['nigerian', 'nigerians'],
  GHA: ['ghanaian'],
  SEN: ['senegalese'],
  MLI: ['malian'],
  NER: ['nigerien'],
  BFA: ['burkinabe'],
  TCD: ['chadian'],
  CMR: ['cameroonian'],
  CAF: ['central african republic'],
  ZAF: ['south african', 'south africans'],
  ZWE: ['zimbabwean'],
  ZMB: ['zambian'],
  MOZ: ['mozambican'],
  AGO: ['angolan'],
  NAM: ['namibian'],
  BWA: ['botswanan'],
  MEX: ['mexican', 'mexicans'],
  BRA: ['brazilian', 'brazilians'],
  ARG: ['argentine', 'argentinian'],
  CHL: ['chilean'],
  COL: ['colombian'],
  VEN: ['venezuelan', 'venezuelans'],
  PER: ['peruvian'],
  BOL: ['bolivian'],
  ECU: ['ecuadorian'],
  PRY: ['paraguayan'],
  URY: ['uruguayan'],
  CUB: ['cuban', 'cubans'],
  HTI: ['haitian', 'haitians'],
  DOM: ['dominican republic'],
  JAM: ['jamaican'],
  TTO: ['trinidadian'],
  CAN: ['canadian', 'canadians'],
  AUS: ['australian', 'australians'],
  NZL: ['new zealander'],
  PNG: ['papua new guinean'],
  FJI: ['fijian'],
  KAZ: ['kazakh', 'kazakhstani'],
  UZB: ['uzbek'],
  TJK: ['tajik'],
  TKM: ['turkmen'],
  KGZ: ['kyrgyz'],
  ARM: ['armenian', 'armenians'],
  AZE: ['azerbaijani', 'azeri'],
  GEO: ['georgian'],
  CYP: ['cypriot'],
  MNG: ['mongolian'],
  BTN: ['bhutanese'],
  MDV: ['maldivian'],
  MDA: ['moldovan'],
};

interface SurfaceForm {
  /** Already normalized. */
  form: string;
  iso3: string;
}

/**
 * Every surface form, longest first.
 *
 * The ordering is what stops "Guinea" from claiming a headline about Papua New
 * Guinea, and "Niger" from claiming one about Nigeria. Longer forms are matched
 * first and shorter matches overlapping them are dropped, so the most specific
 * name present is the one that wins.
 */
const FORMS: readonly SurfaceForm[] = (() => {
  const out: SurfaceForm[] = [];
  for (const country of COUNTRIES) {
    out.push({ form: normalize(country.name), iso3: country.iso3 });
    for (const alias of ALIASES[country.iso3] ?? []) {
      out.push({ form: normalize(alias), iso3: country.iso3 });
    }
  }
  return out
    .filter((entry) => entry.form.length > 0)
    .sort((a, b) => b.form.length - a.form.length);
})();

/**
 * Lowercase, and every run of non-alphanumerics collapsed to one space.
 *
 * Applied to the text and to every surface form alike, which is what makes a
 * plain `includes` of a space-padded needle mean "whole word" without a regex.
 * It also folds "U.S." and "U S" together, and "Guinea-Bissau" and "Guinea
 * Bissau", which real feeds mix freely.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Sport, in the vocabulary that gets mistaken for conflict. */
const SPORT = [
  'world cup', 'match', 'goal', 'striker', 'league', 'tournament', 'qualifier',
  'olympic', 'olympics', 'medal', 'fixture', 'squad', 'stadium', 'friendly',
  'cricket', 'rugby', 'midfielder', 'knockout',
];

/**
 * The classifier, in order of precedence.
 *
 * Order is load-bearing: a headline carrying both "rebels" and "protest" is
 * about an insurgency, and one carrying "air strike" is not a labour dispute
 * however the word "strike" is read. Which is also why bare "strike" is absent
 * from the labour list — it is the most overloaded word in a world feed, and
 * only the compound forms are safe.
 */
const RULES: ReadonlyArray<{ kind: ExtractedKind; terms: readonly string[] }> = [
  {
    kind: 'civil-conflict',
    terms: ['civil war', 'rebels', 'rebel', 'insurgency', 'insurgents', 'militia', 'coup', 'junta'],
  },
  {
    kind: 'armed-conflict',
    terms: [
      'air strike', 'airstrike', 'air strikes', 'airstrikes', 'shelling', 'artillery',
      'drone strike', 'drone strikes', 'offensive', 'ceasefire', 'armed group',
      'armed clashes', 'border clashes', 'military operation', 'war',
    ],
  },
  { kind: 'riot', terms: ['riot', 'rioting', 'rioters', 'looting', 'unrest', 'violent clashes'] },
  { kind: 'protest', terms: ['protest', 'protests', 'protesters', 'demonstration', 'demonstrators', 'rally'] },
  { kind: 'strike', terms: ['general strike', 'walkout', 'strike action', 'industrial action', 'workers strike'] },
];

/** Base seriousness per kind, before the report's own language is read. */
const BASE_SEVERITY: Record<ExtractedKind, number> = {
  'armed-conflict': 0.7,
  'civil-conflict': 0.65,
  riot: 0.45,
  protest: 0.3,
  strike: 0.25,
};

/** Words that say the report is describing something worse than its kind alone. */
const INTENSIFIERS = [
  'killed', 'dead', 'deadly', 'deaths', 'fatal', 'casualties', 'massacre',
  'mass', 'thousands', 'hundreds',
];

/**
 * One article, or nothing.
 *
 * Nothing is a normal, frequent, correct answer here — see the note at the top.
 */
export function extract(article: Article): ExtractedEvent | null {
  const text = normalize(`${article.title} ${article.summary}`);
  if (text.length === 0) return null;

  const hay = ` ${text} `;
  if (contains(hay, SPORT)) return null;

  const iso3 = soleCountryIn(hay);
  if (!iso3) return null;

  const kind = classify(hay);
  if (!kind) return null;

  return {
    iso3,
    kind,
    at: article.publishedAt,
    severity: severityOf(kind, hay),
    article,
  };
}

/** Every article that resolves, in publication order. */
export function extractAll(articles: readonly Article[]): ExtractedEvent[] {
  const out: ExtractedEvent[] = [];
  for (const article of articles) {
    const event = extract(article);
    if (event) out.push(event);
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The one country this text is about, or null if it names none or several.
 *
 * Exported because "which country is this headline about" is the question most
 * worth being able to assert against directly, separately from what the
 * classifier then does with it.
 */
export function soleCountryIn(paddedText: string): string | null {
  const hay = paddedText.startsWith(' ') ? paddedText : ` ${normalize(paddedText)} `;

  interface Hit { iso3: string; start: number; end: number }
  const hits: Hit[] = [];

  for (const { form, iso3 } of FORMS) {
    const needle = ` ${form} `;
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      hits.push({ iso3, start: at, end: at + needle.length });
      // Advance by one rather than by the needle: adjacent words share the
      // space between them, so a step of the full length would skip a
      // neighbouring match.
      from = at + 1;
    }
  }

  // FORMS is longest-first, so the first hit covering a span is the most
  // specific name there. Anything overlapping an already-kept hit is a shorter
  // name inside a longer one — "Guinea" inside "Papua New Guinea".
  const kept: Hit[] = [];
  for (const hit of hits) {
    const overlaps = kept.some((k) => hit.start < k.end && k.start < hit.end);
    if (!overlaps) kept.push(hit);
  }

  const distinct = new Set(kept.map((hit) => hit.iso3));
  return distinct.size === 1 ? [...distinct][0] : null;
}

function classify(hay: string): ExtractedKind | null {
  for (const rule of RULES) {
    if (contains(hay, rule.terms)) return rule.kind;
  }
  return null;
}

function severityOf(kind: ExtractedKind, hay: string): number {
  let severity = BASE_SEVERITY[kind];
  for (const word of INTENSIFIERS) {
    if (hay.includes(` ${word} `)) severity += 0.08;
  }
  return Math.min(1, Math.round(severity * 100) / 100);
}

/** Whole-word containment of any term, on already-normalized padded text. */
function contains(hay: string, terms: readonly string[]): boolean {
  return terms.some((term) => hay.includes(` ${normalize(term)} `));
}
