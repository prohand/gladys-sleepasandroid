// -----------------------------------------------------------------------------
// Dates as people read them.
//
// The next alarm is published as a text feature ("2026-10-22 07:00"), and a
// text carries no time zone: it has to be written in the user's own, which a
// container running in UTC does not know. The configuration names it.
// -----------------------------------------------------------------------------

const formatters = new Map();

function formatterFor(zone) {
  if (!formatters.has(zone)) {
    let formatter = null;
    try {
      // sv-SE writes dates the ISO way: 2026-10-22 07:00.
      formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      // RangeError: a zone the runtime does not know.
    }
    formatters.set(zone, formatter);
  }
  return formatters.get(zone);
}

/** Whether the runtime knows this IANA time zone. */
export function isValidTimeZone(zone) {
  return formatterFor(zone) !== null;
}

/**
 * `YYYY-MM-DD HH:mm` in the given zone, UTC when the zone is unknown.
 * @param {number} ms Unix milliseconds
 * @param {string} zone IANA name, e.g. Europe/Paris
 */
export function formatDateTime(ms, zone) {
  const formatter = formatterFor(zone) ?? formatterFor('UTC');
  return formatter.format(new Date(ms)).replace(',', '');
}

/**
 * A duration in hours as "7 h 32" (the same in the four languages).
 * @param {number} hours
 */
export function formatHours(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} h ${String(m).padStart(2, '0')}`;
}
