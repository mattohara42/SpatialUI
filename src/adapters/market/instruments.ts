import type { Instrument, SectorKey } from './types';

/**
 * The book: thirty-two instruments across eight sectors.
 *
 * Symbols, names, sectors, and listing years are real, the way the league's
 * franchises and founding years are real. What is fiction is everything that
 * moves — prices, volumes, and the fills — and the snapshot says so in its
 * provenance rather than leaving a reader to guess.
 *
 * Four to a sector, eight sectors, because that is the shape the layout reads
 * best: eight beds wrap into two rows and a sector becomes somewhere you stand
 * rather than a legend entry. It is the same arrangement the eight divisions
 * land in, which is not a coincidence — it is the largest garden the bed
 * wrapping handles well, and both sources were fitted to it deliberately.
 *
 * The colours are the plate a tag's roundel is printed on. Identity, never
 * state, so they are picked to be distinguishable from each other and from the
 * greys staleness uses, and never from anything a price does.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  // Technology
  { symbol: 'AAPL', name: 'Apple', sector: 'technology', listedYear: 1980, color: '#4a4a4c' },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'technology', listedYear: 1986, color: '#2f6db4' },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'technology', listedYear: 1999, color: '#4f8a10' },
  { symbol: 'ORCL', name: 'Oracle', sector: 'technology', listedYear: 1986, color: '#b03a2e' },

  // Financials
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'financials', listedYear: 1969, color: '#5c4b8a' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'financials', listedYear: 1973, color: '#a2364a' },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'financials', listedYear: 1999, color: '#3d6ea5' },
  { symbol: 'AXP', name: 'American Express', sector: 'financials', listedYear: 1977, color: '#2e7d94' },

  // Health care
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'health-care', listedYear: 1944, color: '#b8484f' },
  { symbol: 'PFE', name: 'Pfizer', sector: 'health-care', listedYear: 1942, color: '#3f7fb5' },
  { symbol: 'MRK', name: 'Merck', sector: 'health-care', listedYear: 1946, color: '#2f8f7a' },
  { symbol: 'ABT', name: 'Abbott', sector: 'health-care', listedYear: 1937, color: '#6a7fbd' },

  // Energy
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'energy', listedYear: 1920, color: '#a8443a' },
  { symbol: 'CVX', name: 'Chevron', sector: 'energy', listedYear: 1921, color: '#3a6fa8' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'energy', listedYear: 1981, color: '#b5622e' },
  { symbol: 'SLB', name: 'Schlumberger', sector: 'energy', listedYear: 1962, color: '#4d6f8f' },

  // Consumer
  { symbol: 'KO', name: 'Coca-Cola', sector: 'consumer', listedYear: 1919, color: '#b3383f' },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'consumer', listedYear: 1891, color: '#3f7f9e' },
  { symbol: 'NKE', name: 'Nike', sector: 'consumer', listedYear: 1980, color: '#5a5a5c' },
  { symbol: 'MCD', name: "McDonald's", sector: 'consumer', listedYear: 1965, color: '#a8862e' },

  // Industrials
  { symbol: 'BA', name: 'Boeing', sector: 'industrials', listedYear: 1962, color: '#3f6ea8' },
  { symbol: 'CAT', name: 'Caterpillar', sector: 'industrials', listedYear: 1929, color: '#a8912e' },
  { symbol: 'GE', name: 'General Electric', sector: 'industrials', listedYear: 1892, color: '#4a7f9e' },
  { symbol: 'UPS', name: 'United Parcel Service', sector: 'industrials', listedYear: 1999, color: '#7a5a3a' },

  // Utilities
  { symbol: 'NEE', name: 'NextEra Energy', sector: 'utilities', listedYear: 1946, color: '#4f8a5a' },
  { symbol: 'DUK', name: 'Duke Energy', sector: 'utilities', listedYear: 1961, color: '#3f7f8f' },
  { symbol: 'SO', name: 'Southern Company', sector: 'utilities', listedYear: 1949, color: '#8a6a3a' },
  { symbol: 'AEP', name: 'American Electric Power', sector: 'utilities', listedYear: 1949, color: '#5f6f9e' },

  // Materials
  { symbol: 'LIN', name: 'Linde', sector: 'materials', listedYear: 1992, color: '#4a7f7a' },
  { symbol: 'SHW', name: 'Sherwin-Williams', sector: 'materials', listedYear: 1964, color: '#a84a5a' },
  { symbol: 'FCX', name: 'Freeport-McMoRan', sector: 'materials', listedYear: 1995, color: '#8a5a2e' },
  { symbol: 'NUE', name: 'Nucor', sector: 'materials', listedYear: 1972, color: '#5a6a7a' },
];

export const SECTORS: readonly SectorKey[] = [
  'technology',
  'financials',
  'health-care',
  'energy',
  'consumer',
  'industrials',
  'utilities',
  'materials',
];

/** The instruments in one sector, in book order. */
export function instrumentsIn(sector: SectorKey): Instrument[] {
  return INSTRUMENTS.filter((i) => i.sector === sector);
}
