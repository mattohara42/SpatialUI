import { describe, expect, it } from 'vitest';
import { extract, extractAll, soleCountryIn } from './extract';
import { generateArticles, syntheticNewsSource } from './feeds';
import type { Article } from './types';

const T0 = Date.UTC(2026, 5, 1, 9, 0);
const DAY = 24 * 60 * 60 * 1000;

function article(title: string, summary = '', at = T0): Article {
  return {
    id: `t-${title.slice(0, 12)}`,
    outlet: 'Simulated Wire',
    title,
    summary,
    url: 'https://simulated.invalid/x',
    publishedAt: at,
  };
}

describe('country resolution', () => {
  it('resolves a plain country name', () => {
    expect(soleCountryIn('protests across Kenya')).toBe('KEN');
  });

  it('resolves a demonym', () => {
    expect(soleCountryIn('Ukrainian forces advance')).toBe('UKR');
  });

  it('prefers the longest name present', () => {
    // The whole reason FORMS is sorted longest-first. Each of these contains a
    // shorter country name inside it.
    expect(soleCountryIn('unrest in Papua New Guinea')).toBe('PNG');
    expect(soleCountryIn('unrest in Equatorial Guinea')).toBe('GNQ');
    expect(soleCountryIn('unrest in Guinea-Bissau')).toBe('GNB');
    expect(soleCountryIn('unrest in South Sudan')).toBe('SSD');
  });

  it('does not match a country name inside another word', () => {
    // "Niger" sits inside "Nigeria", and "Mali" inside "Somalia".
    expect(soleCountryIn('fuel protests in Nigeria')).toBe('NGA');
    expect(soleCountryIn('drought in Somalia')).toBe('SOM');
  });

  it('refuses a headline naming two countries', () => {
    expect(soleCountryIn('border clashes between Israel and Lebanon')).toBeNull();
  });

  it('refuses a headline naming none', () => {
    expect(soleCountryIn('markets rally on rate cut hopes')).toBeNull();
  });

  it('does not treat the pronoun "us" as the United States', () => {
    // The reason bare "US" is not a surface form. This sentence names no
    // country at all and must resolve to nothing.
    expect(soleCountryIn('the minister told us the talks had failed')).toBeNull();
    // The punctuated form survives normalization as its own token and is safe.
    expect(soleCountryIn('U.S. officials confirmed the strike')).toBe('USA');
  });
});

describe('classification', () => {
  it('reads an air strike as armed conflict, not a labour dispute', () => {
    const event = extract(article('Air strikes reported in Yemen'));
    expect(event?.kind).toBe('armed-conflict');
  });

  it('reads a general strike as a strike', () => {
    const event = extract(article('General strike halts transport in Greece'));
    expect(event?.kind).toBe('strike');
  });

  it('prefers conflict over protest when a headline carries both', () => {
    // Order in RULES is load-bearing: this is an insurgency story that also
    // mentions a demonstration, not the other way round.
    const event = extract(
      article('Rebels seize district in Mali', 'A demonstration was held in the capital.'),
    );
    expect(event?.kind).toBe('civil-conflict');
  });

  it('produces nothing for a headline with no event vocabulary', () => {
    expect(extract(article('Kenya opens new rail link'))).toBeNull();
  });
});

describe('adversarial cases', () => {
  it('discards sport that reads like conflict', () => {
    expect(extract(article('Brazil and Argentina clash in World Cup qualifier'))).toBeNull();
    expect(extract(article('Croatia fight back in tournament match', 'A late goal levelled it.'))).toBeNull();
  });

  it('discards a headline it cannot place, however clear the event is', () => {
    // A real, serious, well-classified event that names two countries. Dropping
    // it is the designed behaviour, not a bug: see the note in extract.ts.
    const event = extract(article('Deadly shelling reported on the Armenia and Azerbaijan border'));
    expect(event).toBeNull();
  });
});

describe('severity', () => {
  it('rates a protest below an air strike', () => {
    const protest = extract(article('Thousands join protests across Chile'));
    const strike = extract(article('Air strikes reported in Libya'));
    expect(protest!.severity).toBeLessThan(strike!.severity);
  });

  it('is raised by the language of the report', () => {
    const plain = extract(article('Rioting breaks out in Ecuador'));
    const grave = extract(article('Rioting breaks out in Ecuador', 'Dozens were killed and hundreds hurt.'));
    expect(grave!.severity).toBeGreaterThan(plain!.severity);
    expect(grave!.severity).toBeLessThanOrEqual(1);
  });
});

describe('provenance', () => {
  it('carries the originating article onto every event', () => {
    const source = article('Air strikes reported in Sudan');
    const event = extract(source);
    expect(event?.article).toBe(source);
    expect(event?.article.outlet).toBe('Simulated Wire');
  });

  it('takes the event time from the article, never from now', () => {
    const event = extract(article('Rioting breaks out in Peru', '', T0 - 40 * DAY));
    expect(event?.at).toBe(T0 - 40 * DAY);
  });
});

describe('the generated feed', () => {
  it('never claims to be live', () => {
    expect(syntheticNewsSource().live).toBe(false);
  });

  it('names no real outlet and links nowhere that resolves', () => {
    const articles = generateArticles(T0 - 30 * DAY, T0);
    expect(articles.length).toBeGreaterThan(0);
    for (const item of articles) {
      expect(item.outlet.startsWith('Simulated')).toBe(true);
      expect(item.url).toContain('.invalid/');
    }
  });

  it('depends only on the window, so widening it returns a superset', () => {
    // The property that lets the world source be re-asked without the past
    // sliding underneath it.
    const narrow = generateArticles(T0 - 10 * DAY, T0);
    const wide = generateArticles(T0 - 40 * DAY, T0);
    const wideIds = new Set(wide.map((a) => a.id));
    for (const item of narrow) expect(wideIds.has(item.id)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const a = generateArticles(T0 - 20 * DAY, T0, { seed: 7 });
    const b = generateArticles(T0 - 20 * DAY, T0, { seed: 7 });
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it('produces articles the extractor can actually read', () => {
    // A feed whose copy the extractor rejects would test nothing at all, so
    // this is really an assertion about the two halves being in step.
    const articles = generateArticles(T0 - 30 * DAY, T0);
    const events = extractAll(articles);
    expect(events.length).toBeGreaterThan(articles.length * 0.9);
    expect(events.every((e) => e.iso3.length === 3)).toBe(true);
  });

  it('leaves some countries entirely silent', () => {
    // The staleness case, reached the way the market's halt is: nothing is
    // reported, so nothing arrives, and no timestamp is edited to fake it.
    const articles = generateArticles(T0 - 60 * DAY, T0);
    const heard = new Set(extractAll(articles).map((e) => e.iso3));
    expect(heard.size).toBeLessThan(193);
  });
});
