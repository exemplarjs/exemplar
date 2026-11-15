import { codeOf } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import { Duration, XdmAtomicValue, XMLGregorianCalendar, XS } from '@/index';
import { uncheckedAtomicValue } from '@/internal';

describe('XdmAtomicValue', () => {
  it('makes values of each kind with their types', () => {
    expect(XdmAtomicValue.string('a').type).toBe(XS.string);
    expect(XdmAtomicValue.string('a', XS.token).type).toBe(XS.token);
    expect(XdmAtomicValue.untypedAtomic('a').type).toBe(XS.untypedAtomic);
    expect(XdmAtomicValue.integer(5).value).toBe(5n);
    expect([XdmAtomicValue.integer(-5).value, XdmAtomicValue.integer(5000).value]).toEqual([-5n, 5000n]);
    expect(XdmAtomicValue.integer(5n, XS.byte).type).toBe(XS.byte);
    expect(XdmAtomicValue.float(0.1).value).toBe(Math.fround(0.1));
    expect(XdmAtomicValue.double(0.1).value).toBe(0.1);
  });

  it('shares the two booleans', () => {
    expect(XdmAtomicValue.boolean(true)).toBe(XdmAtomicValue.boolean(true));
    expect(XdmAtomicValue.boolean(false).value).toBe(false);
  });

  it('gives its string value and says whether it is an integer', () => {
    expect(XdmAtomicValue.double(1e6).stringValue).toBe('1.0E6');
    expect([XdmAtomicValue.integer(1n, XS.short).isInteger, XdmAtomicValue.double(1).isInteger]).toEqual([true, false]);
    expect(XdmAtomicValue.string('a"b').toString()).toBe(String.raw`xs:string("a\"b")`);
  });
});

describe('XdmAtomicValue checks what it is given', () => {
  it('accepts values a type can hold', () => {
    expect(XdmAtomicValue.integer(127n, XS.byte).value).toBe(127n);
    expect(XdmAtomicValue.string('item', XS.NCName).value).toBe('item');
    expect(XdmAtomicValue.string(' any\ttext ').value).toBe(' any\ttext ');
    expect(new XdmAtomicValue(XS.QName, new QName('urn:x', 'a')).type).toBe(XS.QName);
    expect(new XdmAtomicValue(XS.hexBinary, new Uint8Array([1])).type).toBe(XS.hexBinary);
  });

  it('raises FORG0001 for a value outside the type: an integer out of range, or text its rules refuse', () => {
    expect(codeOf(() => XdmAtomicValue.integer(300n, XS.byte))).toBe('FORG0001');
    expect(codeOf(() => XdmAtomicValue.integer(-1n, XS.unsignedInt))).toBe('FORG0001');
    expect(codeOf(() => XdmAtomicValue.string('a b', XS.NCName))).toBe('FORG0001');
    // Text must already be in the form the type's whitespace handling gives it.
    expect(codeOf(() => XdmAtomicValue.string(' token', XS.token))).toBe('FORG0001');
    expect(codeOf(() => XdmAtomicValue.string('a\tb', XS.normalizedString))).toBe('FORG0001');
  });

  it('raises XPTY0004 for content of the wrong kind, or an abstract type', () => {
    expect(codeOf(() => new XdmAtomicValue(XS.integer, 'five'))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.decimal, 1.5))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.float, 0.1))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.QName, 'a'))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.hexBinary, [1] as unknown as Uint8Array))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.anyAtomicType, 'x'))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.boolean, 1))).toBe('XPTY0004');
    expect(codeOf(() => XdmAtomicValue.integer(1.5))).toBe('XPTY0004');
  });

  it('refuses a type of the wrong kind at compile time, and at run time for JavaScript callers', () => {
    // @ts-expect-error -- the integer factory takes integer types only
    expect(codeOf(() => XdmAtomicValue.integer(5n, XS.string))).toBe('XPTY0004');
    // @ts-expect-error -- the string factory takes string types only
    expect(codeOf(() => XdmAtomicValue.string('5', XS.integer))).toBe('XPTY0004');
  });
});

describe('XdmAtomicValue with dates, times and durations', () => {
  it('makes values of the calendar or duration own type', () => {
    const stamp = XMLGregorianCalendar.parse('2024-02-29T12:00:00Z', XS.dateTimeStamp);
    const value = XdmAtomicValue.calendar(stamp);
    expect([value.type, value.value, value.stringValue]).toEqual([XS.dateTimeStamp, stamp, '2024-02-29T12:00:00Z']);
    const span = Duration.parse('P1Y', XS.yearMonthDuration);
    expect(XdmAtomicValue.duration(span).type).toBe(XS.yearMonthDuration);
    expect(XdmAtomicValue.duration(span).stringValue).toBe('P1Y');
  });

  it('raises XPTY0004 for content that is not of the type itself', () => {
    const leapDay = XMLGregorianCalendar.parse('2024-02-29', XS.date);
    expect(codeOf(() => new XdmAtomicValue(XS.dateTime, leapDay))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.date, '2024-02-29'))).toBe('XPTY0004');
    const dayTime = Duration.parse('P1D', XS.dayTimeDuration);
    expect(codeOf(() => new XdmAtomicValue(XS.duration, dayTime))).toBe('XPTY0004');
    expect(codeOf(() => new XdmAtomicValue(XS.dayTimeDuration, leapDay))).toBe('XPTY0004');
    expect(new XdmAtomicValue(XS.dayTimeDuration, dayTime).value).toBe(dayTime);
  });
});

describe('uncheckedAtomicValue', () => {
  it('makes a value without checking it, for code that knows it is valid', () => {
    const value = uncheckedAtomicValue(XS.byte, 300n);
    expect([value.type, value.value]).toEqual([XS.byte, 300n]);
    expect(value).toBeInstanceOf(XdmAtomicValue);
  });

  it('leaves checking on for the next value', () => {
    uncheckedAtomicValue(XS.byte, 300n);
    expect(codeOf(() => XdmAtomicValue.integer(300n, XS.byte))).toBe('FORG0001');
  });
});
