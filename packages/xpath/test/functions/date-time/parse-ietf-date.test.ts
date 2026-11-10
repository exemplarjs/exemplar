import { describe, expect, it } from 'vitest';
import { errorCode, evaluate } from '../../helpers/evaluate.ts';

/** Text as an XPath string literal, its whitespace kept as it is. */
const literal = (text: string): string => `"${text.replaceAll('"', '""')}"`;

/** The result of `fn:parse-ietf-date` on a string, as its type and canonical text. */
function parsed(text: string): string[] {
  return evaluate(`parse-ietf-date(${literal(text)})`);
}

/** The error `fn:parse-ietf-date` raises for a string. */
function failure(text: string): string | undefined {
  return errorCode(`parse-ietf-date(${literal(text)})`);
}

describe('fn:parse-ietf-date (F&O §9.8.4)', () => {
  it('reads the examples of the specification', () => {
    expect(parsed('Wed, 06 Jun 1994 07:29:35 GMT')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
    expect(parsed('Wed, 6 Jun 94 07:29:35 GMT')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
    expect(parsed('Wed Jun 06 11:54:45 EST 2013')).toEqual(['xs:dateTime 2013-06-06T11:54:45-05:00']);
    expect(parsed('Sunday, 06-Nov-94 08:49:37 GMT')).toEqual(['xs:dateTime 1994-11-06T08:49:37Z']);
    expect(parsed('Wed, 6 Jun 94 07:29:35 +0500')).toEqual(['xs:dateTime 1994-06-06T07:29:35+05:00']);
  });

  it('reads the day first, the month first, or the asctime form with the year last', () => {
    expect(parsed('6 Jun 1994 07:29:35 GMT')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
    expect(parsed('Jun 6 1994 07:29:35 GMT')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
    expect(parsed('Jun-06-1994 07:29:35')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
    expect(parsed('Jun 6 07:29:35 1994')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
  });

  it('reads two-digit years in the twentieth century', () => {
    expect(parsed('1 Jan 00 00:00 GMT')).toEqual(['xs:dateTime 1900-01-01T00:00:00Z']);
    expect(parsed('1 Jan 99 00:00 GMT')).toEqual(['xs:dateTime 1999-01-01T00:00:00Z']);
  });

  it('reads times without seconds, single-digit hours and fractions of a second', () => {
    expect(parsed('6 Jun 1994 7:29 GMT')).toEqual(['xs:dateTime 1994-06-06T07:29:00Z']);
    expect(parsed('6 Jun 1994 07:29:35.25 GMT')).toEqual(['xs:dateTime 1994-06-06T07:29:35.25Z']);
  });

  it('reads each timezone name', () => {
    const zones = ['UT', 'UTC', 'GMT', 'EST', 'EDT', 'CST', 'CDT', 'MST', 'MDT', 'PST', 'PDT'];
    expect(zones.map((zone) => parsed(`6 Jun 1994 12:00 ${zone}`)[0]?.slice(-6))).toEqual([
      '00:00Z',
      '00:00Z',
      '00:00Z',
      '-05:00',
      '-04:00',
      '-06:00',
      '-05:00',
      '-07:00',
      '-06:00',
      '-08:00',
      '-07:00',
    ]);
  });

  it('reads offsets with and without a colon or minutes, and a timezone name in parentheses after one', () => {
    expect(parsed('6 Jun 1994 12:00 -5')).toEqual(['xs:dateTime 1994-06-06T12:00:00-05:00']);
    expect(parsed('6 Jun 1994 12:00 +05:30')).toEqual(['xs:dateTime 1994-06-06T12:00:00+05:30']);
    expect(parsed('6 Jun 1994 12:00 -530')).toEqual(['xs:dateTime 1994-06-06T12:00:00-05:30']);
    expect(parsed('6 Jun 1994 12:00+0000 (GMT)')).toEqual(['xs:dateTime 1994-06-06T12:00:00Z']);
    expect(parsed('6 Jun 1994 12:00 -0500 ( EST )')).toEqual(['xs:dateTime 1994-06-06T12:00:00-05:00']);
  });

  it('ignores case and the whitespace around the date', () => {
    expect(parsed('  wednesday, 06 JUN 1994 07:29:35 gmt \n')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
    expect(parsed('Wed,\t06\tJun 1994 07:29:35')).toEqual(['xs:dateTime 1994-06-06T07:29:35Z']);
  });

  it('gives the empty sequence for the empty sequence', () => {
    expect(evaluate('parse-ietf-date(())')).toEqual([]);
  });

  it('raises FORG0010 for text outside the grammar', () => {
    for (const text of [
      '',
      'Wed,06 Jun 1994 07:29:35 GMT',
      '06 Jun 1994',
      '06 June 1994 07:29:35',
      '06 Jun 994 07:29:35',
      '06 Jun 1994 07:29:35 XYZ',
      '06 Jun 1994 07:29:35 GMT (GMT)',
      'Jun 06 1994 07:29:35 1994',
    ]) {
      expect(failure(text)).toBe('FORG0010');
    }
  });

  it('raises FORG0010 for dates and times that do not exist', () => {
    for (const text of [
      '31 Feb 2013 00:00 GMT',
      '29 Feb 1900 00:00 GMT',
      '0 Jan 2013 00:00',
      '6 Jun 1994 25:00',
      '6 Jun 1994 12:60',
      '6 Jun 1994 12:00 +1500',
    ]) {
      expect(failure(text)).toBe('FORG0010');
    }
  });
});
