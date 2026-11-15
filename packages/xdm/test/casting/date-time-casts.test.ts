import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { castDateTime } from '@/casting/date-time-casts';
import { type AtomicType, castAs, XdmAtomicValue, XS } from '@/index';

/** A value of a type from its lexical form. */
const value = (type: AtomicType, text: string): XdmAtomicValue => castAs(XdmAtomicValue.string(text), type);

/** A value cast to a type, as its canonical text, or undefined when castDateTime leaves the pair to the caller. */
function cast(source: XdmAtomicValue, target: AtomicType): string | undefined {
  const result = castDateTime(source, target);
  if (result !== undefined) expect(result.type).toBe(target);
  return result?.stringValue;
}

describe('castDateTime among dates and times (F&O §19.1.6)', () => {
  const instant = value(XS.dateTime, '2024-02-29T13:45:30.5-05:00');

  it('casts a date and time to each date and time type, keeping the fields the target has', () => {
    const targets = [XS.date, XS.time, XS.gYearMonth, XS.gYear, XS.gMonthDay, XS.gDay, XS.gMonth, XS.dateTimeStamp];
    expect(targets.map((target) => cast(instant, target))).toEqual([
      '2024-02-29-05:00',
      '13:45:30.5-05:00',
      '2024-02-05:00',
      '2024-05:00',
      '--02-29-05:00',
      '---29-05:00',
      '--02-05:00',
      '2024-02-29T13:45:30.5-05:00',
    ]);
  });

  it('casts a date to a date and time at midnight, and to the xs:g* types', () => {
    const leapDay = value(XS.date, '2024-02-29');
    expect(cast(leapDay, XS.dateTime)).toBe('2024-02-29T00:00:00');
    expect(cast(leapDay, XS.gYearMonth)).toBe('2024-02');
    expect(cast(leapDay, XS.gMonthDay)).toBe('--02-29');
    expect(cast(value(XS.date, '2024-02-29Z'), XS.dateTimeStamp)).toBe('2024-02-29T00:00:00Z');
  });

  it('casts a xs:dateTimeStamp to a xs:dateTime', () => {
    expect(cast(value(XS.dateTimeStamp, '2024-02-29T00:00:00+14:00'), XS.dateTime)).toBe('2024-02-29T00:00:00+14:00');
  });

  it('raises FORG0001 for a value without a timezone cast to xs:dateTimeStamp', () => {
    expect(codeOf(() => castDateTime(value(XS.dateTime, '2024-02-29T00:00:00'), XS.dateTimeStamp))).toBe('FORG0001');
    expect(codeOf(() => castDateTime(value(XS.date, '2024-02-29'), XS.dateTimeStamp))).toBe('FORG0001');
  });

  it('leaves pairs the cast table does not allow to the caller', () => {
    expect(cast(value(XS.date, '2024-02-29'), XS.time)).toBeUndefined();
    expect(cast(value(XS.time, '12:00:00'), XS.dateTime)).toBeUndefined();
    expect(cast(value(XS.time, '12:00:00'), XS.date)).toBeUndefined();
    expect(cast(value(XS.gYear, '2024'), XS.gYearMonth)).toBeUndefined();
    expect(cast(value(XS.gMonthDay, '--02-29'), XS.date)).toBeUndefined();
  });

  it('leaves values and targets that are not dates, times or durations to the caller', () => {
    expect(cast(XdmAtomicValue.string('2024-02-29'), XS.date)).toBeUndefined();
    expect(cast(value(XS.date, '2024-02-29'), XS.string)).toBeUndefined();
    expect(cast(value(XS.date, '2024-02-29'), XS.dayTimeDuration)).toBeUndefined();
    expect(cast(value(XS.dayTimeDuration, 'P1D'), XS.date)).toBeUndefined();
  });
});

describe('castDateTime among durations (F&O §19.1.7)', () => {
  const span = value(XS.duration, '-P1Y2M3DT4H');

  it('keeps the part of a duration the target has', () => {
    expect(cast(span, XS.yearMonthDuration)).toBe('-P1Y2M');
    expect(cast(span, XS.dayTimeDuration)).toBe('-P3DT4H');
    expect(cast(value(XS.duration, 'P1D'), XS.yearMonthDuration)).toBe('P0M');
    expect(cast(value(XS.duration, 'P1Y'), XS.dayTimeDuration)).toBe('PT0S');
  });

  it('casts either subtype to xs:duration and to the other subtype', () => {
    expect(cast(value(XS.yearMonthDuration, 'P1Y'), XS.duration)).toBe('P1Y');
    expect(cast(value(XS.dayTimeDuration, 'PT1.5S'), XS.duration)).toBe('PT1.5S');
    expect(cast(value(XS.yearMonthDuration, 'P1Y'), XS.dayTimeDuration)).toBe('PT0S');
    expect(cast(value(XS.dayTimeDuration, 'P1D'), XS.yearMonthDuration)).toBe('P0M');
  });
});
