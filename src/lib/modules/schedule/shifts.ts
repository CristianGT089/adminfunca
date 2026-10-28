/**
 * Standard module shifts. With the shift, the start date and the end date we know which days
 * to mark on the calendar and how many hours they add up to. No server dependencies: used in
 * the form (preview) and on the server (creation).
 */
export const SHIFTS = ["DAYTIME", "EVENING", "SATURDAY"] as const;
export type Shift = (typeof SHIFTS)[number];

export type ShiftDefinition = {
  name: string;
  description: string;
  days: number[]; // 0 = Sunday … 6 = Saturday
  startHour: number; // in hours (7.5 = 7:30)
  endHour: number;
};

export const SHIFT_DEFINITION: Record<Shift, ShiftDefinition> = {
  DAYTIME: { name: "Diurno", description: "Martes, miércoles y jueves · 7:00 a. m. a 12:00 m.", days: [2, 3, 4], startHour: 7, endHour: 12 },
  EVENING: { name: "Nocturno", description: "Lunes a viernes · 6:00 p. m. a 9:00 p. m.", days: [1, 2, 3, 4, 5], startHour: 18, endHour: 21 },
  SATURDAY: { name: "Sábados", description: "Sábados · 7:00 a. m. a 4:00 p. m.", days: [6], startHour: 7, endHour: 16 },
};

export const hoursPerSession = (s: Shift) => SHIFT_DEFINITION[s].endHour - SHIFT_DEFINITION[s].startHour;

/** Dates (at local midnight) of every session between start and end, inclusive. */
export function shiftSessions(shift: Shift, from: Date, to: Date, max = 400): Date[] {
  const { days } = SHIFT_DEFINITION[shift];
  const dates: Date[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const limit = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= limit && dates.length < max) {
    if (days.includes(cursor.getDay())) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** First end date (inclusive) starting at `from` that completes the requested hours. */
export function endDateForHours(shift: Shift, from: Date, hours: number): Date | null {
  const perSession = hoursPerSession(shift);
  const sessions = Math.ceil(hours / perSession);
  if (sessions <= 0) return null;
  const { days } = SHIFT_DEFINITION[shift];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (days.includes(cursor.getDay())) {
      n++;
      if (n === sessions) return new Date(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

/** First class day on or after the given date. */
export function firstSession(shift: Shift, from: Date): Date {
  const { days } = SHIFT_DEFINITION[shift];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 7; i++) {
    if (days.includes(cursor.getDay())) return cursor;
    cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
}

export function atHour(date: Date, decimalHour: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setMinutes(Math.round(decimalHour * 60));
  return d;
}
