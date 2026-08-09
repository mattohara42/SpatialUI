import { describe, expect, it } from 'vitest';
import {
  MARK_LIMIT,
  emblemFrom,
  emblemOf,
  initialsOf,
  inkFor,
  luminanceOf,
} from './labels';

describe('initialsOf', () => {
  it('initials a multi-word label the way a person would', () => {
    expect(initialsOf('Payments Gateway')).toBe('PG');
    expect(initialsOf('Dallas Cowboys')).toBe('DC');
  });

  it('takes letters rather than one initial from a single word', () => {
    // One character is not a mark, it is a typo.
    expect(initialsOf('postgres')).toBe('POS');
    expect(initialsOf('api')).toBe('API');
  });

  it('splits on punctuation, so slugs read as words', () => {
    expect(initialsOf('auth-api')).toBe('AA');
    expect(initialsOf('billing_worker.eu')).toBe('BWE');
  });

  it('drops noise words when there is something else to use', () => {
    expect(initialsOf('Bank of England')).toBe('BE');
    expect(initialsOf('The Ashes')).toBe('ASH');
  });

  it('keeps noise words when they are all there is', () => {
    expect(initialsOf('the of and')).toBe('TOA');
  });

  it('never returns more than the limit, and never nothing', () => {
    for (const label of [
      'a b c d e f',
      'Extremely Long Service Name With Many Words',
      '!!!',
      '',
      '2024 Season Review',
    ]) {
      const mark = initialsOf(label);
      expect(mark.length).toBeGreaterThan(0);
      expect(mark.length).toBeLessThanOrEqual(MARK_LIMIT);
      expect(mark).toBe(mark.toUpperCase());
    }
  });
});

describe('emblemFrom', () => {
  it('is stable, so a plant does not change identity between runs', () => {
    expect(emblemFrom('Payments Gateway')).toEqual(emblemFrom('Payments Gateway'));
  });

  it('separates different things', () => {
    const a = emblemFrom('Payments Gateway');
    const b = emblemFrom('Postgres Primary');
    expect(a.color).not.toBe(b.color);
  });

  it('takes an explicit seed, so two things sharing a name still differ', () => {
    expect(emblemFrom('api', 'eu-api').color).not.toBe(
      emblemFrom('api', 'us-api').color,
    );
  });

  it('stays muted: a derived plate never shouts like a health colour', () => {
    // Loud colour means health in this scene, and a label may not borrow it.
    for (const label of ['alpha', 'beta service', 'gamma', 'delta node', 'epsilon']) {
      const { color } = emblemFrom(label);
      const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
      const saturation =
        (Math.max(...channels) - Math.min(...channels)) / Math.max(...channels);
      expect(saturation).toBeLessThan(0.6);
    }
  });
});

describe('inkFor', () => {
  it('puts dark ink on light plates and light ink on dark ones', () => {
    expect(luminanceOf(inkFor('#f2e9d0'))).toBeLessThan(0.2);
    expect(luminanceOf(inkFor('#0b2265'))).toBeGreaterThan(0.7);
  });

  it('keeps every derived emblem readable', () => {
    for (let i = 0; i < 200; i++) {
      const emblem = emblemFrom(`service-${i}`);
      const gap = Math.abs(luminanceOf(emblem.color) - luminanceOf(emblem.ink));
      expect(gap).toBeGreaterThan(0.2);
    }
  });

  it('judges by luminance, not by lightness', () => {
    // A saturated blue and a yellow at the same HSL lightness are nothing alike
    // to look at; picking ink by lightness puts black text on navy.
    expect(inkFor('#0000ff')).toBe(inkFor('#000000'));
    expect(inkFor('#ffff00')).toBe(inkFor('#ffffff'));
  });
});

describe('emblemOf', () => {
  it('uses what translation chose', () => {
    const chosen = { mark: 'DAL', color: '#003594', ink: '#ffffff' };
    expect(emblemOf({ id: 'dal', label: 'Dallas Cowboys', emblem: chosen })).toBe(chosen);
  });

  it('falls back on the node id, so two plants named alike stay distinct', () => {
    const a = emblemOf({ id: 'eu-api', label: 'api' });
    const b = emblemOf({ id: 'us-api', label: 'api' });
    expect(a.mark).toBe(b.mark);
    expect(a.color).not.toBe(b.color);
  });
});
