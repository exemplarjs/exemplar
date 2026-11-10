import { describe, expect, it } from 'vitest';
import {
  atomicType,
  derivesFrom,
  isCalendarType,
  isDurationType,
  isIntegerType,
  isNumericType,
  XS,
  XS_NAMESPACE,
} from '@/index';

describe('the built-in atomic types', () => {
  it('names each type in the XML Schema namespace', () => {
    expect(XS.integer.name.namespaceURI).toBe(XS_NAMESPACE);
    expect(XS.integer.toString()).toBe('xs:integer');
    expect(XS.NCName.name.localName).toBe('NCName');
  });

  it('gives each type its primitive type', () => {
    expect([XS.byte.primitive, XS.ID.primitive, XS.untypedAtomic.primitive, XS.anyAtomicType.primitive]).toEqual([
      XS.decimal,
      XS.string,
      XS.untypedAtomic,
      XS.anyAtomicType,
    ]);
    expect(XS.double.primitive).toBe(XS.double);
  });

  it('knows which types derive from which', () => {
    expect(derivesFrom(XS.byte, XS.integer)).toBe(true);
    expect(derivesFrom(XS.unsignedByte, XS.nonNegativeInteger)).toBe(true);
    expect(derivesFrom(XS.integer, XS.byte)).toBe(false);
    expect(derivesFrom(XS.string, XS.anyAtomicType)).toBe(true);
    expect(derivesFrom(XS.anyURI, XS.string)).toBe(false);
  });

  it('marks the abstract types', () => {
    expect([XS.anyAtomicType.abstract, XS.NOTATION.abstract, XS.string.abstract]).toEqual([true, true, false]);
  });

  it('finds types by local name', () => {
    expect(atomicType('positiveInteger')).toBe(XS.positiveInteger);
    expect(atomicType('dateTime')).toBe(XS.dateTime);
    expect(atomicType('dayTimeDuration')?.primitive).toBe(XS.duration);
    expect(atomicType('noSuchType')).toBeUndefined();
  });

  it('tells integer and numeric types apart', () => {
    expect([isIntegerType(XS.short), isIntegerType(XS.decimal), isIntegerType(XS.double)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([isNumericType(XS.float), isNumericType(XS.long), isNumericType(XS.string)]).toEqual([true, true, false]);
  });

  it('places the date, time and duration types in the hierarchy', () => {
    expect([XS.dateTimeStamp.base, XS.dateTimeStamp.primitive]).toEqual([XS.dateTime, XS.dateTime]);
    expect([XS.yearMonthDuration.primitive, XS.dayTimeDuration.base]).toEqual([XS.duration, XS.duration]);
    expect([XS.date.primitive, XS.gMonthDay.primitive, XS.duration.base]).toEqual([
      XS.date,
      XS.gMonthDay,
      XS.anyAtomicType,
    ]);
    expect(derivesFrom(XS.dayTimeDuration, XS.yearMonthDuration)).toBe(false);
    expect(atomicType('dateTimeStamp')).toBe(XS.dateTimeStamp);
  });

  it('tells date and time types and duration types apart', () => {
    const calendarTypes = [
      XS.dateTime,
      XS.dateTimeStamp,
      XS.date,
      XS.time,
      XS.gYearMonth,
      XS.gYear,
      XS.gMonthDay,
      XS.gDay,
      XS.gMonth,
    ];
    expect(calendarTypes.every((type) => isCalendarType(type))).toBe(true);
    expect([isCalendarType(XS.duration), isCalendarType(XS.string)]).toEqual([false, false]);
    expect([XS.duration, XS.yearMonthDuration, XS.dayTimeDuration].every((type) => isDurationType(type))).toBe(true);
    expect([isDurationType(XS.dateTime), isDurationType(XS.decimal)]).toEqual([false, false]);
  });
});
