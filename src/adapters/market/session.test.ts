import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  HOUR_MS,
  LONGEST_CLOSURE_MS,
  hourlyCloses,
  isHoliday,
  isOpen,
  isTradingDay,
  nextBarClose,
  previousClose,
  sessionOn,
  tradingDaysBack,
} from './session';

/** A Wednesday, mid-session. 2026-04-15 15:00 UTC is 10:00 in the exchange's -5. */
const WEDNESDAY_OPEN = Date.UTC(2026, 3, 15, 15, 0);
/** The Saturday after it. */
const SATURDAY = Date.UTC(2026, 3, 18, 15, 0);

describe('the trading calendar', () => {
  it('trades on weekdays and not at weekends', () => {
    expect(isTradingDay(WEDNESDAY_OPEN)).toBe(true);
    expect(isTradingDay(SATURDAY)).toBe(false);
    expect(isTradingDay(SATURDAY + DAY_MS)).toBe(false); // Sunday
    expect(isTradingDay(SATURDAY + 2 * DAY_MS)).toBe(true); // Monday
  });

  it('knows the fixed holidays', () => {
    expect(isHoliday(Date.UTC(2026, 6, 4, 16, 0))).toBe(true);
    expect(isHoliday(Date.UTC(2026, 11, 25, 16, 0))).toBe(true);
    expect(isHoliday(WEDNESDAY_OPEN)).toBe(false);
    expect(isTradingDay(Date.UTC(2026, 11, 25, 16, 0))).toBe(false);
  });

  it('is open inside the session and shut either side of it', () => {
    const { open, close } = sessionOn(WEDNESDAY_OPEN);
    expect(isOpen(open)).toBe(true);
    expect(isOpen(open - 1)).toBe(false);
    // The close is the end of the session, not a moment inside it.
    expect(isOpen(close - 1)).toBe(true);
    expect(isOpen(close)).toBe(false);
  });

  it('is never open on a day it does not trade', () => {
    const { open, close } = sessionOn(SATURDAY);
    for (const at of [open, open + HOUR_MS, close - 1]) {
      expect(isOpen(at)).toBe(false);
    }
  });

  it('walks back to the last close, skipping the weekend', () => {
    // Sunday afternoon: the last thing the market said was Friday's close.
    const sunday = SATURDAY + DAY_MS;
    const last = previousClose(sunday);
    expect(last).not.toBeNull();
    expect(isTradingDay(last!)).toBe(true);
    expect(new Date(last!).getUTCDay()).toBe(5); // Friday
    expect(last!).toBeLessThan(sunday);
  });

  it('returns the same day close once the bell has gone', () => {
    const { close } = sessionOn(WEDNESDAY_OPEN);
    expect(previousClose(close)).toBe(close);
    // A minute before, it is still yesterday's.
    expect(previousClose(close - 1)!).toBeLessThan(close);
  });

  it('hands back only trading days, most recent first', () => {
    const days = tradingDaysBack(SATURDAY, 10);
    expect(days).toHaveLength(10);
    for (const day of days) expect(isTradingDay(day)).toBe(true);
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeLessThan(days[i - 1]);
    }
  });

  it('gives a session seven hourly bars, the last one on the bell', () => {
    const closes = hourlyCloses(WEDNESDAY_OPEN);
    // 09:30 to 16:00 is six and a half hours: six whole ones and the stub.
    expect(closes).toHaveLength(7);
    expect(closes[closes.length - 1]).toBe(sessionOn(WEDNESDAY_OPEN).close);
    for (let i = 1; i < closes.length; i++) {
      expect(closes[i]).toBeGreaterThan(closes[i - 1]);
    }
  });

  it('gives a closed day no bars at all', () => {
    expect(hourlyCloses(SATURDAY)).toHaveLength(0);
  });

  it('answers when an instrument should next print, across a weekend', () => {
    // The question a flat threshold cannot ask. Friday's close is followed by
    // Monday's first bar, so the whole weekend is time in which nothing was due.
    const fridayClose = sessionOn(SATURDAY - DAY_MS).close;
    const next = nextBarClose(fridayClose);
    expect(next).not.toBeNull();
    expect(isTradingDay(next!)).toBe(true);
    expect(new Date(next!).getUTCDay()).toBe(1); // Monday
    expect(next!).toBe(hourlyCloses(SATURDAY + 2 * DAY_MS)[0]);

    // And it is exactly the far end of the gap `previousClose` measures from.
    expect(previousClose(next! - 1)).toBe(fridayClose);
  });

  it('walks bar to bar inside a session, and is strict about "next"', () => {
    const closes = hourlyCloses(WEDNESDAY_OPEN);
    for (let i = 1; i < closes.length; i++) {
      expect(nextBarClose(closes[i - 1])).toBe(closes[i]);
    }
    // Strictly after, or a source that just printed would be due again at the
    // same instant and every plant would be permanently late.
    expect(nextBarClose(closes[0])).toBeGreaterThan(closes[0]);
  });

  it('never looks further ahead than the longest legitimate closure', () => {
    // The bound that lets the schedule keep a tight grace: however awkwardly a
    // closure falls, the next print is inside a holiday weekend of it.
    const fridayClose = sessionOn(SATURDAY - DAY_MS).close;
    expect(nextBarClose(fridayClose)! - fridayClose).toBeLessThanOrEqual(
      LONGEST_CLOSURE_MS,
    );
  });

  it('sizes the longest closure at a holiday weekend', () => {
    // Friday's close to Tuesday's open, which is what the staleness threshold
    // has to clear. Anything shorter greys the whole garden every long weekend.
    expect(LONGEST_CLOSURE_MS).toBeGreaterThan(3 * DAY_MS);
    expect(LONGEST_CLOSURE_MS).toBeLessThan(4 * DAY_MS);

    // And it really does cover an ordinary weekend with room over.
    const fridayClose = sessionOn(SATURDAY - DAY_MS).close;
    const mondayOpen = sessionOn(SATURDAY + 2 * DAY_MS).open;
    expect(mondayOpen - fridayClose).toBeLessThan(LONGEST_CLOSURE_MS);
  });
});
