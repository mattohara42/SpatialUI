import type { Grammar, Rule } from './types';
import type { Rng } from './random';

/**
 * Hard ceiling on expanded string length. L-Systems grow exponentially and one
 * extra iteration on a branching grammar is the difference between 4k symbols
 * and 200k. Rather than let a bad config drop the headset to 20 FPS, expansion
 * stops and reports it.
 */
export const MAX_SYMBOLS = 24_000;

export interface Expansion {
  symbols: string;
  truncated: boolean;
}

export function expand(grammar: Grammar, rng: Rng): Expansion {
  let current = grammar.axiom;

  for (let i = 0; i < grammar.iterations; i++) {
    let next = '';
    for (const ch of current) {
      const rule = grammar.rules[ch];
      next += rule === undefined ? ch : pick(rule, rng);
    }
    if (next.length > MAX_SYMBOLS) {
      return { symbols: current, truncated: true };
    }
    current = next;
  }

  return { symbols: current, truncated: false };
}

function pick(rule: Rule, rng: Rng): string {
  if (typeof rule === 'string') return rule;
  if (rule.length === 0) return '';

  let total = 0;
  for (const alt of rule) total += alt.weight ?? 1;

  let roll = rng() * total;
  for (const alt of rule) {
    roll -= alt.weight ?? 1;
    if (roll <= 0) return alt.successor;
  }
  return rule[rule.length - 1].successor;
}
