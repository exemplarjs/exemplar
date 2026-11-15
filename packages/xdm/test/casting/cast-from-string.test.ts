import { describe, expect, it } from 'vitest';
import { contentFromText } from '@/casting/cast-from-string';
import { DEFAULT_PREFIXES, Duration, XMLGregorianCalendar, XS } from '@/index';

describe('contentFromText', () => {
  it('reads content for each primitive type, or undefined', () => {
    expect(contentFromText('1', XS.boolean, DEFAULT_PREFIXES)).toBe(true);
    expect(contentFromText('maybe', XS.boolean, DEFAULT_PREFIXES)).toBeUndefined();
    expect(contentFromText('5', XS.short, DEFAULT_PREFIXES)).toBe(5n);
    expect(contentFromText('5.5', XS.decimal, DEFAULT_PREFIXES)?.toString()).toBe('5.5');
    expect(contentFromText('INF', XS.float, DEFAULT_PREFIXES)).toBe(Number.POSITIVE_INFINITY);
    expect(contentFromText('a b', XS.token, DEFAULT_PREFIXES)).toBe('a b');
  });

  it('reads dates, times and durations as the classes that hold them, or undefined', () => {
    const leapDay = contentFromText('2024-02-29', XS.date, DEFAULT_PREFIXES);
    expect(leapDay).toBeInstanceOf(XMLGregorianCalendar);
    expect((leapDay as XMLGregorianCalendar).xmlSchemaType).toBe(XS.date);
    expect(contentFromText('2023-02-29', XS.date, DEFAULT_PREFIXES)).toBeUndefined();
    const span = contentFromText('P1D', XS.dayTimeDuration, DEFAULT_PREFIXES);
    expect(span).toBeInstanceOf(Duration);
    expect((span as Duration).xmlSchemaType).toBe(XS.dayTimeDuration);
    expect(contentFromText('P1D', XS.yearMonthDuration, DEFAULT_PREFIXES)).toBeUndefined();
  });

  it('binds no prefix by default but xml', () => {
    expect(DEFAULT_PREFIXES('')).toBe('');
    expect(DEFAULT_PREFIXES('xml')).toBe('http://www.w3.org/XML/1998/namespace');
    expect(DEFAULT_PREFIXES('p')).toBeUndefined();
  });
});
