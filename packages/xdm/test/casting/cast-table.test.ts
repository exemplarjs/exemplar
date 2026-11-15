import { codeOf, decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import { type AtomicType, castAs, Decimal, isCastable, XdmAtomicValue, XS } from '@/index';
import { tryCastAs, uncheckedAtomicValue } from '@/internal';

const string = (text: string): XdmAtomicValue => XdmAtomicValue.string(text);
const untyped = (text: string): XdmAtomicValue => XdmAtomicValue.untypedAtomic(text);

/** The canonical text of a value cast to a type. */
function cast(value: XdmAtomicValue, type: AtomicType): string {
  return castAs(value, type).stringValue;
}

describe('castAs from text', () => {
  it('reads each type from its lexical form, collapsing whitespace', () => {
    expect(cast(string(' 42 '), XS.integer)).toBe('42');
    expect(cast(untyped('1.50'), XS.decimal)).toBe('1.5');
    expect(cast(string('1e3'), XS.double)).toBe('1000');
    expect(cast(string('0.1'), XS.float)).toBe('0.1');
    expect(cast(string(' true '), XS.boolean)).toBe('true');
    expect(cast(string('0'), XS.boolean)).toBe('false');
    expect(cast(string('0aff'), XS.hexBinary)).toBe('0AFF');
    expect(cast(string('AQID'), XS.base64Binary)).toBe('AQID');
    expect(cast(string(' http://example.com/a b '), XS.anyURI)).toBe('http://example.com/a b');
  });

  it('keeps or normalizes whitespace as the string type asks, and checks names', () => {
    expect(cast(untyped(' a\tb '), XS.string)).toBe(' a\tb ');
    expect(cast(string(' a\tb '), XS.normalizedString)).toBe(' a b ');
    expect(cast(string(' a\t b '), XS.token)).toBe('a b');
    expect(cast(string(' item '), XS.NCName)).toBe('item');
    expect(castAs(string('item'), XS.ID).type).toBe(XS.ID);
    expect(codeOf(() => castAs(string('a:b'), XS.NCName))).toBe('FORG0001');
    expect(codeOf(() => castAs(string('a b'), XS.NMTOKEN))).toBe('FORG0001');
  });

  it('raises FORG0001 for text that is not a value of the type', () => {
    for (const [text, type] of [
      ['abc', XS.integer],
      ['1.5', XS.integer],
      ['yes', XS.boolean],
      ['1e', XS.double],
      ['abc', XS.hexBinary],
      ['300', XS.byte],
      ['-1', XS.unsignedInt],
    ] as const) {
      expect(codeOf(() => castAs(string(text), type))).toBe('FORG0001');
    }
  });

  it('resolves QName prefixes with the namespaces it is given, from strings and untyped text alike', () => {
    const bindings: Readonly<Record<string, string>> = { p: 'urn:p', '': '' };
    const resolvePrefix = (prefix: string): string | undefined => bindings[prefix];
    expect(castAs(string('p:item'), XS.QName, { resolvePrefix }).value).toEqual(new QName('urn:p', 'item', 'p'));
    expect(castAs(string('item'), XS.QName).value).toEqual(new QName('', 'item', ''));
    expect(codeOf(() => castAs(string('q:item'), XS.QName))).toBe('FONS0004');
    expect(castAs(untyped('xml:lang'), XS.QName).stringValue).toBe('xml:lang');
    expect(isCastable(untyped('a'), XS.QName)).toBe(true);
  });
});

describe('castAs to text', () => {
  it('writes each value in its canonical form', () => {
    expect(cast(XdmAtomicValue.double(1e6), XS.string)).toBe('1.0E6');
    expect(cast(decimal('-0.50'), XS.untypedAtomic)).toBe('-0.5');
    expect(cast(XdmAtomicValue.boolean(true), XS.string)).toBe('true');
    expect(castAs(XdmAtomicValue.integer(5n), XS.untypedAtomic).type).toBe(XS.untypedAtomic);
  });

  it('checks values written as text against string types', () => {
    expect(cast(XdmAtomicValue.integer(12n), XS.NMTOKEN)).toBe('12');
    expect(codeOf(() => castAs(XdmAtomicValue.integer(12n), XS.NCName))).toBe('FORG0001');
  });
});

describe('castAs among numbers and booleans', () => {
  it('truncates toward zero for integers, and checks their range', () => {
    expect([cast(XdmAtomicValue.double(2.9), XS.integer), cast(XdmAtomicValue.double(-2.9), XS.integer)]).toEqual([
      '2',
      '-2',
    ]);
    expect(cast(decimal('-7.9'), XS.long)).toBe('-7');
    expect(cast(XdmAtomicValue.float(3.5), XS.short)).toBe('3');
    expect(codeOf(() => castAs(XdmAtomicValue.integer(128n), XS.byte))).toBe('FORG0001');
    expect(codeOf(() => castAs(XdmAtomicValue.double(1e30), XS.long))).toBe('FORG0001');
    expect(cast(XdmAtomicValue.double(1e30), XS.integer)).toBe('1000000000000000019884624838656');
  });

  it('raises FOCA0002 for NaN or an infinity cast to a decimal or integer', () => {
    expect(codeOf(() => castAs(XdmAtomicValue.double(Number.NaN), XS.integer))).toBe('FOCA0002');
    expect(codeOf(() => castAs(XdmAtomicValue.float(Number.POSITIVE_INFINITY), XS.decimal))).toBe('FOCA0002');
  });

  it('rounds integers, decimals and text to the nearest float once, not through a double', () => {
    // 2^60 + 2^36 + 1 lies just above halfway between two floats; a double rounds it down to the halfway point.
    const justAboveHalf = 2n ** 60n + 2n ** 36n + 1n;
    const nearestFloat = Number(2n ** 60n + 2n ** 37n);
    const sources = [
      XdmAtomicValue.integer(justAboveHalf),
      XdmAtomicValue.decimal(Decimal.of(justAboveHalf)),
      string(justAboveHalf.toString()),
    ];
    expect(sources.map((source) => castAs(source, XS.float).value)).toEqual([nearestFloat, nearestFloat, nearestFloat]);
    expect(castAs(string('1.00000005960464477550461'), XS.float).value).toBe(1 + 2 ** -23);
  });

  it('reads floats at the edges of their range', () => {
    expect(castAs(string('-0'), XS.float).value).toBe(-0);
    expect(castAs(string('3.4028235e38'), XS.float).value).toBe((2 - 2 ** -23) * 2 ** 127);
    expect(castAs(string('3.5e38'), XS.float).value).toBe(Number.POSITIVE_INFINITY);
    expect(castAs(string('-1e400'), XS.float).value).toBe(Number.NEGATIVE_INFINITY);
    expect(castAs(string('1.4e-45'), XS.float).value).toBe(2 ** -149);
    expect(castAs(string('5e-46'), XS.float).value).toBe(0);
    expect(castAs(string('-1e-400'), XS.float).value).toBe(-0);
    // Far beyond a float's range, but within a double's.
    expect(['1e-100', '1e100', '-1e100'].map((text) => castAs(string(text), XS.float).value)).toEqual([
      0,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]);
    expect(castAs(XdmAtomicValue.integer(10n ** 50n), XS.float).value).toBe(Number.POSITIVE_INFINITY);
    expect(castAs(XdmAtomicValue.integer(0n), XS.float).value).toBe(0);
  });

  it('casts floats and doubles to the decimals they hold exactly, as the JDK does', () => {
    expect(cast(XdmAtomicValue.float(0.1), XS.decimal)).toBe('0.100000001490116119384765625');
    expect(cast(XdmAtomicValue.float(1 / 3), XS.decimal)).toBe('0.3333333432674407958984375');
    expect(cast(XdmAtomicValue.double(0.1), XS.decimal)).toBe(
      '0.1000000000000000055511151231257827021181583404541015625'
    );
    expect(cast(XdmAtomicValue.double(-0.5), XS.decimal)).toBe('-0.5');
    expect(cast(XdmAtomicValue.double(1e21), XS.decimal)).toBe('1000000000000000000000');
    expect(cast(XdmAtomicValue.double(5e-324), XS.decimal)).toMatch(/^0\.0{323}49406564584124654/);
  });

  it('converts between decimals, doubles and floats', () => {
    expect(cast(XdmAtomicValue.double(0.5), XS.decimal)).toBe('0.5');
    expect(cast(XdmAtomicValue.integer(7n), XS.decimal)).toBe('7');
    expect(castAs(XdmAtomicValue.integer(7n), XS.decimal).value.toString()).toBe('7');
    expect(cast(decimal('0.1'), XS.double)).toBe('0.1');
    expect(castAs(XdmAtomicValue.double(0.1), XS.float).value).toBe(Math.fround(0.1));
    expect(cast(XdmAtomicValue.integer(2n ** 60n), XS.double)).toBe('1.152921504606847E18');
  });

  it('turns numbers into booleans and booleans into numbers', () => {
    const toBoolean = (value: XdmAtomicValue): unknown => castAs(value, XS.boolean).value;
    expect(
      [XdmAtomicValue.integer(0n), XdmAtomicValue.integer(-3n), decimal('0.0'), decimal('0.5')].map((value) =>
        toBoolean(value)
      )
    ).toEqual([false, true, false, true]);
    expect(
      [XdmAtomicValue.double(Number.NaN), XdmAtomicValue.double(-0), XdmAtomicValue.float(2)].map((value) =>
        toBoolean(value)
      )
    ).toEqual([false, false, true]);
    expect([cast(XdmAtomicValue.boolean(true), XS.integer), cast(XdmAtomicValue.boolean(false), XS.double)]).toEqual([
      '1',
      '0',
    ]);
    expect(cast(XdmAtomicValue.boolean(true), XS.decimal)).toBe('1');
    expect([true, false].map((value) => castAs(XdmAtomicValue.boolean(value), XS.float).value)).toEqual([1, 0]);
    expect(castAs(XdmAtomicValue.boolean(true), XS.boolean).value).toBe(true);
  });
});

describe('castAs between other types', () => {
  it('converts between the binary types', () => {
    const base64 = castAs(string('AQID'), XS.base64Binary);
    const hex = castAs(string('010203'), XS.hexBinary);
    expect([cast(base64, XS.hexBinary), cast(hex, XS.base64Binary)]).toEqual(['010203', 'AQID']);
  });

  it('casts NOTATION values to QNames', () => {
    const notation = uncheckedAtomicValue(XS.NOTATION, new QName('urn:n', 'gif', 'n'));
    const qname = castAs(notation, XS.QName);
    expect([qname.type, qname.stringValue]).toEqual([XS.QName, 'n:gif']);
  });

  it('keeps the value when casting to the same primitive type', () => {
    const uri = castAs(string('urn:x'), XS.anyURI);
    expect(castAs(uri, XS.anyURI)).toBe(uri);
    const qname = castAs(string('a'), XS.QName);
    expect(castAs(qname, XS.QName)).toBe(qname);
  });

  it('raises XPTY0004 for pairs the cast table does not allow', () => {
    expect(codeOf(() => castAs(XdmAtomicValue.boolean(true), XS.hexBinary))).toBe('XPTY0004');
    expect(codeOf(() => castAs(castAs(string('urn:x'), XS.anyURI), XS.integer))).toBe('XPTY0004');
    expect(codeOf(() => castAs(castAs(string('a'), XS.QName), XS.base64Binary))).toBe('XPTY0004');
  });

  it('raises XPST0080 for an abstract target', () => {
    expect(codeOf(() => castAs(string('a'), XS.anyAtomicType))).toBe('XPST0080');
    expect(codeOf(() => castAs(string('a'), XS.NOTATION))).toBe('XPST0080');
  });
});

describe('castAs with dates, times and durations', () => {
  it('reads each date, time and duration type from text, collapsing whitespace', () => {
    expect(cast(string(' 2024-02-29 '), XS.date)).toBe('2024-02-29');
    expect(cast(untyped('2024-02-29T24:00:00+00:00'), XS.dateTime)).toBe('2024-03-01T00:00:00Z');
    expect(cast(string('2024-02-29T00:00:00-14:00'), XS.dateTimeStamp)).toBe('2024-02-29T00:00:00-14:00');
    expect(cast(string('-P0D'), XS.dayTimeDuration)).toBe('PT0S');
    expect(cast(string('P12M'), XS.yearMonthDuration)).toBe('P1Y');
    expect(cast(string('P1Y13M'), XS.duration)).toBe('P2Y1M');
  });

  it('raises FORG0001 for text that is not a value of the type', () => {
    for (const [text, type] of [
      ['2023-02-29', XS.date],
      ['2024-02-29T00:00:00', XS.dateTimeStamp],
      ['24:00:01', XS.time],
      ['P1D', XS.yearMonthDuration],
      ['PT', XS.duration],
    ] as const) {
      expect(codeOf(() => castAs(string(text), type))).toBe('FORG0001');
    }
  });

  it('writes dates, times and durations to text canonically', () => {
    const time = castAs(string('12:00:00.100+00:00'), XS.time);
    expect(cast(time, XS.string)).toBe('12:00:00.1Z');
    const dayTime = castAs(string('PT36H'), XS.dayTimeDuration);
    expect(castAs(dayTime, XS.untypedAtomic).value).toBe('P1DT12H');
  });

  it('casts among dates and times and among durations by the cast table', () => {
    const instant = castAs(string('2024-02-29T13:45:30Z'), XS.dateTime);
    expect(cast(instant, XS.gMonthDay)).toBe('--02-29Z');
    const span = castAs(string('P1Y2M3D'), XS.duration);
    expect(cast(span, XS.yearMonthDuration)).toBe('P1Y2M');
  });

  it('raises XPTY0004 for a date, time or duration cast to a type the table does not allow', () => {
    const time = castAs(string('12:00:00'), XS.time);
    expect(codeOf(() => castAs(time, XS.date))).toBe('XPTY0004');
    expect(codeOf(() => castAs(time, XS.integer))).toBe('XPTY0004');
    expect(codeOf(() => castAs(castAs(string('P1D'), XS.dayTimeDuration), XS.boolean))).toBe('XPTY0004');
    expect(codeOf(() => castAs(castAs(string('2024'), XS.gYear), XS.dayTimeDuration))).toBe('XPTY0004');
    expect(codeOf(() => castAs(XdmAtomicValue.integer(1n), XS.date))).toBe('XPTY0004');
  });
});

describe('tryCastAs', () => {
  it('gives the cast value, or undefined where the cast fails', () => {
    expect(tryCastAs(string('12'), XS.byte)?.value).toBe(12n);
    expect([tryCastAs(string('1200'), XS.byte), tryCastAs(XdmAtomicValue.boolean(true), XS.QName)]).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('still raises XPST0080 for an abstract target', () => {
    expect(codeOf(() => tryCastAs(string('a'), XS.anyAtomicType))).toBe('XPST0080');
  });
});

describe('isCastable', () => {
  it('says whether a cast would succeed', () => {
    expect([
      isCastable(string('12'), XS.byte),
      isCastable(string('1200'), XS.byte),
      isCastable(XdmAtomicValue.boolean(true), XS.QName),
    ]).toEqual([true, false, false]);
  });

  it('still raises XPST0080 for an abstract target', () => {
    expect(codeOf(() => isCastable(string('a'), XS.anyAtomicType))).toBe('XPST0080');
  });
});
