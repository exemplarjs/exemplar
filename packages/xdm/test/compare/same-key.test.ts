import { decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import { type AtomicType, castAs, XdmAtomicValue, XS } from '@/index';
import { sameKeyOf, uncheckedAtomicValue } from '@/internal';

const value = (type: AtomicType, text: string): XdmAtomicValue => castAs(XdmAtomicValue.string(text), type);

/** Whether two values are the same key. */
function same(first: XdmAtomicValue, second: XdmAtomicValue): boolean {
  return sameKeyOf(first) === sameKeyOf(second);
}

describe('sameKeyOf', () => {
  it('keys strings, URIs and untyped values by their text', () => {
    expect(same(XdmAtomicValue.string('a'), XdmAtomicValue.untypedAtomic('a'))).toBe(true);
    expect(same(XdmAtomicValue.string('a'), value(XS.anyURI, 'a'))).toBe(true);
    expect(same(XdmAtomicValue.string('a'), XdmAtomicValue.string('A'))).toBe(false);
  });

  it('keys numbers by their value whatever their type', () => {
    const one = XdmAtomicValue.integer(1n);
    expect([
      same(one, decimal('1.0')),
      same(one, XdmAtomicValue.double(1)),
      same(one, XdmAtomicValue.float(1)),
    ]).toEqual([true, true, true]);
    expect(same(decimal('1.5'), XdmAtomicValue.double(1.5))).toBe(true);
    expect(same(one, XdmAtomicValue.double(1.5))).toBe(false);
    expect(same(one, XdmAtomicValue.string('1'))).toBe(false);
  });

  it('keys doubles and floats by their exact values, as their casts to decimals give them', () => {
    expect(same(XdmAtomicValue.double(1.1), decimal('1.1'))).toBe(false);
    expect(same(XdmAtomicValue.float(1.1), XdmAtomicValue.double(1.1))).toBe(false);
    const third = XdmAtomicValue.float(1 / 3);
    expect(same(third, castAs(third, XS.decimal))).toBe(true);
    expect(same(XdmAtomicValue.double(-0), XdmAtomicValue.integer(0n))).toBe(true);
  });

  it('keys NaN as equal to itself and the infinities by sign', () => {
    expect(same(XdmAtomicValue.double(Number.NaN), XdmAtomicValue.float(Number.NaN))).toBe(true);
    expect(same(XdmAtomicValue.double(Infinity), XdmAtomicValue.float(Infinity))).toBe(true);
    expect(same(XdmAtomicValue.double(Infinity), XdmAtomicValue.double(-Infinity))).toBe(false);
  });

  it('keys dates and times on the timeline only when they have a timezone', () => {
    expect(same(value(XS.dateTime, '2020-01-01T00:00:00Z'), value(XS.dateTime, '2020-01-01T01:00:00+01:00'))).toBe(
      true
    );
    expect(same(value(XS.date, '2020-01-01'), value(XS.date, '2020-01-01'))).toBe(true);
    expect(same(value(XS.date, '2020-01-01'), value(XS.date, '2020-01-01Z'))).toBe(false);
    expect(same(value(XS.date, '2020-01-01Z'), value(XS.dateTime, '2020-01-01T00:00:00Z'))).toBe(false);
  });

  it('keys durations by their months and seconds', () => {
    expect(same(value(XS.duration, 'P1Y'), value(XS.yearMonthDuration, 'P12M'))).toBe(true);
    expect(same(value(XS.duration, 'P1D'), value(XS.dayTimeDuration, 'PT24H'))).toBe(true);
    expect(same(value(XS.duration, 'P1M'), value(XS.duration, 'P30D'))).toBe(false);
  });

  it('keys names by namespace and local name, apart from notations', () => {
    const name = (prefix: string): XdmAtomicValue => new XdmAtomicValue(XS.QName, new QName('urn:x', 'a', prefix));
    expect(same(name('p'), name('q'))).toBe(true);
    const otherNamespace = new XdmAtomicValue(XS.QName, new QName('urn:y', 'a'));
    const notation = uncheckedAtomicValue(XS.NOTATION, new QName('urn:x', 'a'));
    expect([same(name('p'), otherNamespace), same(name('p'), notation)]).toEqual([false, false]);
  });

  it('keys binary values by their octets and type', () => {
    expect(same(value(XS.hexBinary, 'ff'), value(XS.hexBinary, 'FF'))).toBe(true);
    expect(same(value(XS.hexBinary, 'FF'), value(XS.base64Binary, '/w=='))).toBe(false);
  });

  it('keys booleans by their value', () => {
    expect(same(XdmAtomicValue.boolean(true), value(XS.boolean, '1'))).toBe(true);
    expect(same(XdmAtomicValue.boolean(true), XdmAtomicValue.string('true'))).toBe(false);
  });
});
