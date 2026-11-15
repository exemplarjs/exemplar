import { decimal } from '@test/helpers/values';
import { describe, expect, it } from 'vitest';
import { QName } from '@exemplarjs/xml';
import { canonicalString } from '@/casting/cast-to-string';
import { Duration, XdmAtomicValue, XMLGregorianCalendar, XS } from '@/index';

describe('canonicalString', () => {
  it('writes each primitive type canonically', () => {
    const values = [
      XdmAtomicValue.boolean(false),
      XdmAtomicValue.integer(-12n),
      decimal('2.50'),
      XdmAtomicValue.double(1e-7),
      XdmAtomicValue.float(0.1),
      new XdmAtomicValue(XS.QName, new QName('urn:x', 'item', 'x')),
      new XdmAtomicValue(XS.hexBinary, new Uint8Array([255])),
      new XdmAtomicValue(XS.base64Binary, new Uint8Array([1])),
      XdmAtomicValue.string('text', XS.token),
    ];
    expect(values.map((value) => canonicalString(value))).toEqual([
      'false',
      '-12',
      '2.5',
      '1.0E-7',
      '0.1',
      'x:item',
      'FF',
      'AQ==',
      'text',
    ]);
  });

  it('writes dates, times and durations in their own canonical forms', () => {
    const values = [
      XdmAtomicValue.calendar(XMLGregorianCalendar.parse('2024-02-29T12:00:00.500+00:00', XS.dateTime)),
      XdmAtomicValue.calendar(XMLGregorianCalendar.parse('--02-29', XS.gMonthDay)),
      XdmAtomicValue.duration(Duration.parse('-P0Y0M', XS.yearMonthDuration)),
      XdmAtomicValue.duration(Duration.parse('PT90M', XS.dayTimeDuration)),
    ];
    expect(values.map((value) => canonicalString(value))).toEqual([
      '2024-02-29T12:00:00.5Z',
      '--02-29',
      'P0M',
      'PT1H30M',
    ]);
  });
});
