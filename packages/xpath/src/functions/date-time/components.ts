import {
  Decimal,
  type Duration,
  EMPTY_SEQUENCE,
  XdmAtomicValue,
  type XdmValue,
  type XMLGregorianCalendar,
} from '@exemplarjs/xdm';
import { propagatingEmpty, integerResult } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { timezoneDuration } from './timezones.ts';

/** A component of a date or time: its result type, and how a value gives it. */
type CalendarComponent = readonly [result: string, part: (calendar: XMLGregorianCalendar) => XdmValue];

/** A field of a date or time as an integer. */
function field(name: 'year' | 'month' | 'day' | 'hour' | 'minute'): CalendarComponent {
  return ['xs:integer', (calendar) => integerResult(calendar[name] as number)];
}

/** The components of dates and times by the name before `-from-`: seconds with their fraction, the timezone as a duration. */
const CALENDAR_COMPONENTS: Readonly<Record<string, CalendarComponent>> = {
  year: field('year'),
  month: field('month'),
  day: field('day'),
  hours: field('hour'),
  minutes: field('minute'),
  seconds: [
    'xs:decimal',
    (calendar) => [
      XdmAtomicValue.decimal(Decimal.of(BigInt(calendar.second as number)).add(calendar.fractionalSecond as Decimal)),
    ],
  ],
  timezone: [
    'xs:dayTimeDuration',
    (calendar) => (calendar.timezone === undefined ? EMPTY_SEQUENCE : timezoneDuration(calendar.timezone)),
  ],
};

/** The components each date and time type has. */
const COMPONENTS_OF = {
  dateTime: ['year', 'month', 'day', 'hours', 'minutes', 'seconds', 'timezone'],
  date: ['year', 'month', 'day', 'timezone'],
  time: ['hours', 'minutes', 'seconds', 'timezone'],
} as const;

/** The integer components of a duration, each with the duration's sign. */
const DURATION_COMPONENTS = ['years', 'months', 'days', 'hours', 'minutes'] as const;

/** A function of an optional argument that is empty for an empty argument. */
function ofOptional<T>(part: (content: T) => XdmValue): (args: readonly XdmValue[]) => XdmValue {
  return propagatingEmpty((value) => part(value.value as T));
}

/** The functions that take dates, times and durations apart (F&O §8.2 and §9.5). */
export const COMPONENT_FUNCTIONS: readonly FunctionDefinition[] = [
  ...DURATION_COMPONENTS.map((name) =>
    defineFunction(
      `fn:${name}-from-duration($arg as xs:duration?) as xs:integer?`,
      ofOptional<Duration>((duration) => integerResult(duration.sign * duration[name]))
    )
  ),
  defineFunction(
    'fn:seconds-from-duration($arg as xs:duration?) as xs:decimal?',
    ofOptional<Duration>((duration) => [
      XdmAtomicValue.decimal(duration.sign < 0 ? duration.seconds.negate() : duration.seconds),
    ])
  ),
  ...Object.entries(COMPONENTS_OF).flatMap(([type, names]) =>
    names.map((name) => {
      const [result, part] = CALENDAR_COMPONENTS[name] as CalendarComponent;
      return defineFunction(`fn:${name}-from-${type}($arg as xs:${type}?) as ${result}?`, ofOptional(part));
    })
  ),
];
