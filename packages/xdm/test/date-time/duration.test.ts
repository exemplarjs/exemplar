import { fc, test } from '@fast-check/vitest';
import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { type AtomicType, Decimal, Duration, type DurationKind, XS } from '@/index';

const ZERO = Decimal.of(0n);
const decimal = (text: string): Decimal => Decimal.parse(text) as Decimal;

describe('Duration', () => {
  it('holds months and seconds with the sign, and gives each component without it', () => {
    const span = Duration.parse('-P1Y2M3DT4H5M6.5S', XS.duration);
    expect([span.totalMonths, span.totalSeconds.toString(), span.sign]).toEqual([-14, '-273906.5', -1]);
    expect([span.years, span.months, span.days, span.hours, span.minutes]).toEqual([1, 2, 3, 4, 5]);
    expect(span.seconds.toString()).toBe('6.5');
    expect(span.kind).toBe('duration');
    expect(span.xmlSchemaType).toBe(XS.duration);
  });

  it('carries over components beyond their usual range', () => {
    const span = Duration.parse('P20Y15MT123H61M', XS.duration);
    expect([span.years, span.months, span.days, span.hours, span.minutes]).toEqual([21, 3, 5, 4, 1]);
    expect(span.toString()).toBe('P21Y3M5DT4H1M');
  });

  it('takes the sign from the seconds when there are no months', () => {
    expect(Duration.parse('-PT1S', XS.dayTimeDuration).sign).toBe(-1);
    expect(Duration.parse('PT1S', XS.dayTimeDuration).sign).toBe(1);
    expect(Duration.parse('PT0S', XS.dayTimeDuration).sign).toBe(0);
    expect(Duration.parse('P1M', XS.yearMonthDuration).sign).toBe(1);
  });

  it('writes its canonical form, a zero duration as P0M or PT0S', () => {
    expect(Duration.parse('-P0Y', XS.yearMonthDuration).toString()).toBe('P0M');
    expect(Duration.parse('-PT0.000S', XS.dayTimeDuration).toString()).toBe('PT0S');
    expect(Duration.parse('P0Y0M0DT0H0M0S', XS.duration).toString()).toBe('PT0S');
    expect(Duration.parse('PT1.500S', XS.dayTimeDuration).toString()).toBe('PT1.5S');
  });

  it('turns negative zero months into zero', () => {
    expect(Object.is(new Duration(XS.yearMonthDuration, -0, ZERO).totalMonths, 0)).toBe(true);
  });

  it('raises FORG0001 for text that is not of its type', () => {
    expect(codeOf(() => Duration.parse('P1D', XS.yearMonthDuration))).toBe('FORG0001');
    expect(codeOf(() => Duration.parse('P', XS.duration))).toBe('FORG0001');
  });
});

describe('the Duration constructor', () => {
  it('needs whole months within the safe integers', () => {
    expect(codeOf(() => new Duration(XS.yearMonthDuration, 1.5, ZERO))).toBe('FORG0001');
    expect(codeOf(() => new Duration(XS.yearMonthDuration, 2 ** 60, ZERO))).toBe('FORG0001');
  });

  it('needs months and seconds of the same sign', () => {
    expect(codeOf(() => new Duration(XS.duration, -1, Decimal.of(1n)))).toBe('FORG0001');
    expect(codeOf(() => new Duration(XS.duration, 1, Decimal.of(-1n)))).toBe('FORG0001');
    expect(new Duration(XS.duration, -1, Decimal.of(-1n)).toString()).toBe('-P1MT1S');
    expect(new Duration(XS.duration, 1, ZERO).toString()).toBe('P1M');
  });

  it('keeps each subtype to its own part', () => {
    expect(codeOf(() => new Duration(XS.yearMonthDuration, 0, Decimal.of(1n)))).toBe('FORG0001');
    expect(codeOf(() => new Duration(XS.dayTimeDuration, 1, ZERO))).toBe('FORG0001');
    expect(new Duration(XS.dayTimeDuration, 0, decimal('-0.5')).toString()).toBe('-PT0.5S');
  });
});

/** Any duration of a kind, as months and seconds of one sign. */
const anyDuration = fc
  .record({
    kind: fc.constantFrom<DurationKind>('duration', 'yearMonthDuration', 'dayTimeDuration'),
    months: fc.integer({ min: 0, max: 1_000_000_000 }),
    // Kept within the safe integers, so the components multiply back exactly.
    seconds: fc.bigInt({ min: 0n, max: 10n ** 14n }),
    scale: fc.integer({ min: 0, max: 9 }),
    negative: fc.boolean(),
  })
  .map(({ kind, months, seconds, scale, negative }) => {
    const sign = negative ? -1 : 1;
    const signedMonths = kind === 'dayTimeDuration' ? 0 : sign * months;
    const signedSeconds = kind === 'yearMonthDuration' ? ZERO : Decimal.of(BigInt(sign) * seconds, scale);
    return new Duration(XS[kind], signedMonths, signedSeconds);
  });

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MONTHS_PER_YEAR = 12;

test.prop([anyDuration])('reads back every duration it writes', (duration) => {
  const read = Duration.parse(duration.toString(), duration.xmlSchemaType);
  expect(read.totalMonths).toBe(duration.totalMonths);
  expect(read.totalSeconds.compare(duration.totalSeconds)).toBe(0);
});

test.prop([anyDuration])('rebuilds its seconds from days, hours, minutes and seconds', (duration) => {
  const wholeMinutes = (duration.days * HOURS_PER_DAY + duration.hours) * MINUTES_PER_HOUR + duration.minutes;
  const magnitude = Decimal.of(BigInt(wholeMinutes * SECONDS_PER_MINUTE)).add(duration.seconds);
  const signed = duration.sign < 0 ? magnitude.negate() : magnitude;
  expect(signed.compare(duration.totalSeconds)).toBe(0);
  expect(duration.years * MONTHS_PER_YEAR + duration.months).toBe(Math.abs(duration.totalMonths));
});

describe('Duration, found in review', () => {
  it('raises XPTY0004 for a type that is not a duration type', () => {
    expect(codeOf(() => new Duration(XS.date as never, 1, ZERO))).toBe('XPTY0004');
  });

  it('raises FODT0002 for more days than its getters can count exactly', () => {
    expect(codeOf(() => Duration.parse('PT9999999999999999999999H', XS.dayTimeDuration))).toBe('FODT0002');
  });
});

describe('Duration.toString', () => {
  const duration = (months: number, seconds: string, type: AtomicType<DurationKind> = XS.duration): string =>
    new Duration(type, months, decimal(seconds)).toString();

  it('writes every part, leaving out zero parts', () => {
    expect(duration(14, '273906.5')).toBe('P1Y2M3DT4H5M6.5S');
    expect([duration(0, '259200'), duration(12, '0')]).toEqual(['P3D', 'P1Y']);
    expect([duration(0, '3600', XS.dayTimeDuration), duration(0, '60', XS.dayTimeDuration)]).toEqual(['PT1H', 'PT1M']);
  });

  it('writes a negative duration with a leading minus', () => {
    expect([duration(-4, '0', XS.yearMonthDuration), duration(0, '-0.25', XS.dayTimeDuration)]).toEqual([
      '-P4M',
      '-PT0.25S',
    ]);
  });

  it('writes a zero year-month duration as P0M and any other zero duration as PT0S', () => {
    expect([duration(0, '0', XS.yearMonthDuration), duration(0, '0', XS.dayTimeDuration), duration(0, '0')]).toEqual([
      'P0M',
      'PT0S',
      'PT0S',
    ]);
  });
});
