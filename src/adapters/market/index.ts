/**
 * The market adapter's public face.
 *
 * What a live adapter replaces: `syntheticMarketSource` and nothing else. A
 * broker API, a data vendor, or a CSV of your own fills implements
 * `MarketSource`, and the derivations, the translation, and the scene are all
 * unchanged — they only ever see bars, lots, and halts stamped with when they
 * happened.
 *
 * What it would *not* have to supply is a calendar: `session.ts` is here because
 * generated bars need to land in real sessions, and a real feed stamps its own.
 * It stays useful for one thing only — the staleness threshold, which is a fact
 * about how long this source is legitimately silent.
 */
export * from './types';
export { INSTRUMENTS, SECTORS, instrumentsIn } from './instruments';
export {
  DAY_MS,
  HOUR_MS,
  LONGEST_CLOSURE_MS,
  SESSION_MS,
  hourlyCloses,
  isHoliday,
  isOpen,
  isTradingDay,
  previousClose,
  sessionOn,
  tradingDaysBack,
} from './session';
export { generateMarketSnapshot, syntheticMarketSource, type TapeOptions } from './tape';
export * from './derive';
