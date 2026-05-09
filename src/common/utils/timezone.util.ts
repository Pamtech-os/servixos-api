/**
 * Converts a UTC Date to its wall-clock equivalent in the given IANA timezone.
 * The returned Date object's UTC components reflect the local time values.
 *
 * Example: UTC 15:00 with timezone "America/New_York" (UTC-5) → returned as 10:00Z,
 * so consumers can display the stored value directly without further conversion.
 *
 * Falls back to the original UTC date if the timezone string is invalid.
 */
export function toBusinessLocalTime(utcDate: Date, timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(utcDate);

    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }

    // hour '24' is returned for midnight in some locales — normalise to '00'
    const hour = p['hour'] === '24' ? '00' : p['hour'];
    const localStr = `${p['year']}-${p['month']}-${p['day']}T${hour}:${p['minute']}:${p['second']}`;

    return new Date(localStr + 'Z');
  } catch {
    return utcDate;
  }
}
