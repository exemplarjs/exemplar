import { describe, expect, it } from 'vitest';
import * as internal from '@/internal';

describe('@exemplarjs/xdm/internal', () => {
  it("exports what exemplar's other packages share, and nothing more", () => {
    expect(Object.keys(internal).toSorted()).toEqual([
      'DAYS_PER_WEEK',
      'HOURS_PER_HALF_DAY',
      'MINUTES_PER_HOUR',
      'MINUTE_IN_SECONDS',
      'MONTHS_PER_YEAR',
      'NumericKind',
      'ROOT_NODE',
      'SECONDS_PER_MINUTE',
      'TIMEZONE_LIMIT',
      'absoluteDecimal',
      'adjustToTimezone',
      'attributePasses',
      'countAllowed',
      'dayNumber',
      'fieldsOf',
      'floorDivide',
      'floorModulo',
      'isStringLike',
      'isTextType',
      'isTimezone',
      'namespacePosition',
      'nodeListOnAxis',
      'numberAsBoolean',
      'numericKind',
      'orderSatisfies',
      'powerOfTen',
      'sameKeyOf',
      'scientific',
      'soleElement',
      'timezoneFromOption',
      'timezoneSeconds',
      'toDecimal',
      'treeNodePasses',
      'tryCastAs',
      'twoDigits',
      'uncheckedAtomicValue',
    ]);
  });
});
