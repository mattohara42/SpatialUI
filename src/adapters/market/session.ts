/**
 * When the market is open, and the awkward fact that it usually is not.
 *
 * A garden built on infrastructure telemetry can assume the data keeps coming.
 * A market stops every evening and all weekend, which is the first assumption
 * this source breaks, and it breaks it in the one place the design is most
 * opinionated: staleness. The garden's rule is that **silence must never read as
 * health** — but a market being shut is not a broken feed, and a threshold tight
 * enough to catch a dead vendor overnight would paint every plant grey every
 * single night, which destroys the signal it exists to protect.
 *
 * The first resolution was the league's, restated: size a single threshold to the
 * longest gap the source *legitimately* produces, which here is a holiday
 * weekend — Friday's close to Tuesday's open — computed as `LONGEST_CLOSURE_MS`
 * rather than chosen. It worked, and it cost nearly four days of detection
 * latency, because one number has to cover both "shut" and "dead".
 *
 * Staleness is now session-aware and asks a sharper question instead: **when
 * should this instrument print again?** `nextBarClose` is this file's answer, and
 * it is the whole of what the exchange calendar contributes. Silence before that
 * moment is free however long it runs; silence after it is measured against a
 * tolerance of hours rather than days. `LONGEST_CLOSURE_MS` survives as the
 * bound on how far ahead that answer can legitimately be.
 *
 * ## The timezone simplification
 *
 * Exchange hours are held in a fixed −5 offset, with no daylight saving. Real
 * US equity sessions shift with it, so between March and November these are an
 * hour out against the wall clock in New York. It is stated rather than papered
 * over because it is exactly the kind of thing a live adapter fixes for free —
 * a real feed stamps its own bars — and building a timezone database in here to
 * generate fiction would be effort spent on the wrong side of the seam.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Exchange offset from UTC, in hours. Fixed; see the note above. */
const EXCHANGE_OFFSET_H = -5;

/** Session bounds in exchange-local hours from midnight. 09:30 to 16:00. */
const OPEN_H = 9.5;
const CLOSE_H = 16;

/** Length of a session, and how many whole hours of bars it yields. */
export const SESSION_MS = (CLOSE_H - OPEN_H) * HOUR_MS;

/**
 * Days the exchange is shut besides weekends, as month/day pairs.
 *
 * A short list of the fixed-date holidays, which is enough to produce the long
 * weekend the staleness threshold is sized against. A live adapter gets the real
 * calendar from its feed and this becomes dead weight, which is the point of
 * keeping it here rather than anywhere downstream.
 */
const FIXED_HOLIDAYS: ReadonlyArray<[number, number]> = [
  [0, 1], // New Year's Day
  [5, 19], // Juneteenth
  [6, 4], // Independence Day
  [11, 25], // Christmas
];

/** Midnight UTC of the exchange-local day containing `at`. */
function localDayStart(at: number): number {
  const shifted = at + EXCHANGE_OFFSET_H * HOUR_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - EXCHANGE_OFFSET_H * HOUR_MS;
}

/** Day of week in exchange-local terms. 0 is Sunday. */
function localDay(at: number): number {
  return new Date(at + EXCHANGE_OFFSET_H * HOUR_MS).getUTCDay();
}

export function isHoliday(at: number): boolean {
  const local = new Date(at + EXCHANGE_OFFSET_H * HOUR_MS);
  const month = local.getUTCMonth();
  const date = local.getUTCDate();
  return FIXED_HOLIDAYS.some(([m, d]) => m === month && d === date);
}

/** Whether the exchange trades at all on the day containing `at`. */
export function isTradingDay(at: number): boolean {
  const day = localDay(at);
  return day !== 0 && day !== 6 && !isHoliday(at);
}

/** Open and close of the session on the day containing `at`, trading or not. */
export function sessionOn(at: number): { open: number; close: number } {
  const start = localDayStart(at);
  return { open: start + OPEN_H * HOUR_MS, close: start + CLOSE_H * HOUR_MS };
}

export function isOpen(at: number): boolean {
  if (!isTradingDay(at)) return false;
  const { open, close } = sessionOn(at);
  return at >= open && at < close;
}

/**
 * The most recent session close at or before `at`, or null if there is none
 * within the search horizon.
 *
 * This is what an instrument's `updatedAt` is set from: the last moment the
 * market said anything about it. Walking back a day at a time is bounded by
 * `maxDays`, because an unbounded loop over a bad timestamp is how a scene stops
 * rendering with no message.
 */
export function previousClose(at: number, maxDays = 14): number | null {
  for (let back = 0; back <= maxDays; back++) {
    const probe = at - back * DAY_MS;
    if (!isTradingDay(probe)) continue;
    const { close } = sessionOn(probe);
    if (close <= at) return close;
  }
  return null;
}

/**
 * The next hourly bar close strictly after `at`, or null if there is none within
 * the search horizon.
 *
 * The mirror of `previousClose`, and the one question staleness needs that a
 * duration cannot answer: given that an instrument last printed at `at`, when
 * should it print again? Overnight and across a weekend the answer is the first
 * bar of the next session, which is why silence in between costs nothing —
 * nothing was due. Bounded for the same reason `previousClose` is: an unbounded
 * walk over a bad timestamp is how a scene stops rendering with no message.
 */
export function nextBarClose(at: number, maxDays = 14): number | null {
  for (let ahead = 0; ahead <= maxDays; ahead++) {
    const probe = at + ahead * DAY_MS;
    for (const close of hourlyCloses(probe)) {
      if (close > at) return close;
    }
  }
  return null;
}

/** Trading-day starts at or before `at`, most recent first. */
export function tradingDaysBack(at: number, count: number): number[] {
  const days: number[] = [];
  for (let back = 0; days.length < count && back < count * 3 + 14; back++) {
    const probe = at - back * DAY_MS;
    if (isTradingDay(probe)) days.push(localDayStart(probe));
  }
  return days;
}

/**
 * Close times of every hourly bar in the session on a given day.
 *
 * The session is six and a half hours, so the last bar is a half hour long and
 * closes on the bell. Truncating it instead would leave the closing print out of
 * the record, which is the one bar nobody would accept losing.
 */
export function hourlyCloses(dayAt: number): number[] {
  if (!isTradingDay(dayAt)) return [];
  const { open, close } = sessionOn(dayAt);
  const closes: number[] = [];
  for (let t = open + HOUR_MS; t < close; t += HOUR_MS) closes.push(t);
  closes.push(close);
  return closes;
}

/**
 * The longest the market is legitimately silent: a Friday close to the next
 * open, with a Monday holiday in the way. Computed rather than asserted, so it
 * cannot drift away from the calendar above.
 */
export const LONGEST_CLOSURE_MS = (() => {
  // A Friday close with Monday shut: Friday 16:00 to Tuesday 09:30.
  const fridayToTuesday = 4 * DAY_MS - (CLOSE_H - OPEN_H) * HOUR_MS;
  return fridayToTuesday;
})();
