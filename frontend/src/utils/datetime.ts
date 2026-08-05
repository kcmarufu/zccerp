/**
 * Date & time formatting — one source of truth for the whole UI.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every screen used to call `new Date(x).toLocaleString()` directly, which
 * renders in the *viewer's* operating-system timezone. Two people looking at the
 * same approval therefore saw two different times, and anyone whose machine sat
 * west of UTC saw trip dates a full day early. Whose clock is right stopped
 * being knowable, which is fatal for an approval audit trail.
 *
 * The rules here:
 *
 *   1. An INSTANT (approved_at, created_at, submitted_at — a DATETIME column)
 *      is a real moment in time. It is stored UTC and always displayed in the
 *      organisation's timezone, so every user sees the same clock time for the
 *      same event no matter how their laptop is configured.
 *
 *   2. A CALENDAR DATE (trip_date, activity_start_date — a DATE column) has no
 *      time and no timezone. "4 August" is 4 August everywhere. These are
 *      formatted straight from their Y-M-D parts and never converted, so they
 *      cannot drift by a day.
 *
 * Anything user-facing should call these helpers rather than toLocale* directly.
 */

/** Timezone the organisation operates in (Zimbabwe, UTC+2, no DST). */
export const ORG_TIME_ZONE = 'Africa/Harare';
export const ORG_TIME_ZONE_LABEL = 'CAT';

type DateInput = string | number | Date | null | undefined;

/** Matches a bare calendar date, or the date half of an ISO timestamp. */
const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * True when the value represents a calendar date with no meaningful time —
 * either 'YYYY-MM-DD' or an ISO string sitting exactly on UTC midnight, which is
 * how a DATE column serialises when it is (incorrectly) sent as a timestamp.
 */
function calendarParts(value: DateInput): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null;
  const match = CALENDAR_DATE_RE.exec(value.trim());
  if (!match) return null;
  const isBareDate = value.trim().length === 10;
  const isUtcMidnight = /T00:00:00(\.000)?Z$/.test(value.trim());
  if (!isBareDate && !isUtcMidnight) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Parse anything into a Date, returning null when it is not usable. */
function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a CALENDAR DATE (DATE column) — never timezone-converted.
 * e.g. '2026-08-04' → '04 Aug 2026'
 */
export function formatDate(
  value: DateInput,
  opts: { long?: boolean; numeric?: boolean; omitYear?: boolean } = {}
): string {
  let parts = calendarParts(value);
  if (!parts) {
    // A genuine timestamp being shown as a date — take its calendar day in org time.
    const date = toDate(value);
    if (!date) return '—';
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: ORG_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(date);
    const get = (type: string) => Number(p.find(x => x.type === type)?.value);
    parts = { y: get('year'), m: get('month'), d: get('day') };
  }

  const day = String(parts.d).padStart(2, '0');
  if (opts.numeric) {
    const dm = `${day}/${String(parts.m).padStart(2, '0')}`;
    return opts.omitYear ? dm : `${dm}/${parts.y}`;
  }
  const month = opts.long ? MONTHS_LONG[parts.m - 1] : MONTHS_SHORT[parts.m - 1];
  return opts.omitYear ? `${day} ${month}` : `${day} ${month} ${parts.y}`;
}

/** Format an INSTANT as date + time in the organisation's timezone. */
export function formatDateTime(value: DateInput, opts: { seconds?: boolean } = {}): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ORG_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(opts.seconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date).replace(',', '');
}

/** Format the time-of-day of an INSTANT in the organisation's timezone. */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ORG_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Format a TIME column ('HH:MM:SS') for display. Pure clock value — no date,
 * no conversion.
 */
export function formatClock(value: DateInput): string {
  if (typeof value !== 'string') return '—';
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '—';
}

/**
 * Value for an <input type="date">, which accepts 'YYYY-MM-DD' and nothing else.
 * Feeding it a full ISO timestamp makes the control render blank — that is how
 * dates silently disappeared when a rejected request was edited and resubmitted.
 */
export function toDateInputValue(value: DateInput): string {
  const parts = calendarParts(value);
  if (parts) {
    return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  }
  const date = toDate(value);
  if (!date) return '';
  // Use the org-timezone calendar day so the prefilled day matches what is displayed.
  const [{ value: d }, , { value: m }, , { value: y }] = new Intl.DateTimeFormat('en-GB', {
    timeZone: ORG_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(date);
  return `${y}-${m}-${d}`;
}

/** Value for an <input type="time">, which expects 'HH:MM'. */
export function toTimeInputValue(value: DateInput): string {
  if (typeof value !== 'string') return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

/** Today's calendar date in the organisation's timezone, as 'YYYY-MM-DD'. */
export function todayInputValue(): string {
  return toDateInputValue(new Date());
}

/**
 * Drop-in replacement for date-fns `format`.
 *
 * date-fns formats in the *browser's* timezone, which is the whole problem this
 * module exists to solve. This version keeps the same call signature and pattern
 * syntax so existing call sites need no rewriting, but resolves the parts in the
 * organisation's timezone — and leaves calendar dates ('YYYY-MM-DD') untouched.
 *
 * Supports the tokens this codebase uses: yyyy MMMM MMM MM dd d HH mm ss.
 */
export function format(value: DateInput, pattern: string): string {
  const cal = calendarParts(value);
  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0;

  if (cal) {
    ({ y, m: mo, d } = cal);
  } else {
    const date = toDate(value);
    if (!date) return '—';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: ORG_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
    y = get('year'); mo = get('month'); d = get('day');
    // Intl renders midnight as hour 24 in some locales; normalise to 0.
    h = get('hour') % 24; mi = get('minute'); se = get('second');
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const tokens: Record<string, string> = {
    yyyy: String(y),
    MMMM: MONTHS_LONG[mo - 1],
    MMM: MONTHS_SHORT[mo - 1],
    MM: pad(mo),
    dd: pad(d),
    d: String(d),
    HH: pad(h),
    mm: pad(mi),
    ss: pad(se),
  };

  // Longest tokens first so 'MMMM' is not eaten by 'MMM', 'dd' not by 'd', etc.
  return pattern.replace(/yyyy|MMMM|MMM|MM|dd|HH|mm|ss|d/g, (t) => tokens[t] ?? t);
}
