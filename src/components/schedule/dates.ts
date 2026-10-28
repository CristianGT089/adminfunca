/** Local-time date helpers for the calendar. Month and day names are shown in the UI. */

export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const SHORT_DAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Monday of the week of the given date. */
export function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(startOfDay(d), -day);
}

/** The 5 or 6 weeks covering the month, Monday to Sunday. */
export function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let cursor = startOfWeek(first);
  const weeks: Date[][] = [];
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
export const longDate = (d: Date) => d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

/** Value for a datetime-local input (local time). */
export function toLocalInput(d: Date) {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string) => new Date(v);

export const formatHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
