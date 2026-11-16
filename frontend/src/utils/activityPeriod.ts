/**
 * One plain description of an activity request's dates, used by the form, the
 * request page, the approvals dialog and the PDF so they all read the same.
 *
 * Reconciliation is due 4 working days after the activity ends. Working days
 * are Monday to Friday, matching the server (reconciliation.service.js counts
 * weekdays only; public holidays are not excluded).
 */
import { formatDate } from './datetime';

export const ACTIVITY_RECON_WORKING_DAYS = 4;

/** 'YYYY-MM-DD' (or a longer ISO string) → a UTC-midnight Date for that calendar day. */
const toDay = (value?: string | null): Date | null => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

const addWorkingDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  let left = n;
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return out;
};

export interface ActivityPeriod {
  /** "12 – 14 Nov 2026", "28 Nov – 2 Dec 2026", or a single day. */
  period: string;
  /** Inclusive length in calendar days. */
  days: number;
  /** The date the reconciliation is due, e.g. "20 Nov 2026". */
  reconDue: string;
}

/** Null when either date is missing or the end is before the start. */
export const describeActivityPeriod = (start?: string | null, end?: string | null): ActivityPeriod | null => {
  const s = toDay(start);
  const e = toDay(end);
  if (!s || !e || e < s) return null;

  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();

  let period: string;
  if (days === 1) period = formatDate(iso(s));
  else if (sameMonth) period = `${String(s.getUTCDate()).padStart(2, '0')} – ${formatDate(iso(e))}`;
  else if (sameYear) period = `${formatDate(iso(s), { omitYear: true })} – ${formatDate(iso(e))}`;
  else period = `${formatDate(iso(s))} – ${formatDate(iso(e))}`;

  return {
    period,
    days,
    reconDue: formatDate(iso(addWorkingDays(e, ACTIVITY_RECON_WORKING_DAYS))),
  };
};
