/**
 * Numbers as English words, cardinal and ordinal, for the `w`, `W` and `Ww` tokens of
 * `format-integer` and `format-date`: `121` is `one hundred and twenty-one`, its ordinal
 * `one hundred and twenty-first`. Words are lower case; the caller applies the token's case.
 */

/** The words for zero to nineteen. */
const UNITS = (
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen ' +
  'eighteen nineteen'
).split(' ');

/** The words for the tens, from twenty, by their digit. */
const TENS = ['', '', ...'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ')];

/** The names of each power of a thousand, from a thousand itself. */
const SCALES =
  'thousand million billion trillion quadrillion quintillion sextillion septillion octillion nonillion decillion'.split(
    ' '
  );

/** Ordinals that do not just add `th`. */
const IRREGULAR_ORDINALS: Readonly<Record<string, string>> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

const TEN = 10n;
const HUNDRED = 100n;
const THOUSAND = 1000n;

/** The numbers below this have a word of their own in `UNITS`. */
const UNIT_WORDS = BigInt(UNITS.length);

/** Eleven to thirteen take `th`, whatever their last digit. */
const ELEVEN = 11n;
const THIRTEEN = 13n;

/** The suffixes of numbers ending in 1, 2 and 3; the rest take `th`. */
const SUFFIXES: Readonly<Record<string, string>> = { '1': 'st', '2': 'nd', '3': 'rd' };

/** The first number too large to name, a thousand decillions. */
const WORDS_LIMIT = THOUSAND ** BigInt(SCALES.length + 1);

/** The words for a number below a thousand. */
function belowThousand(value: bigint): string {
  if (value < UNIT_WORDS) return UNITS[Number(value)] as string;
  if (value < HUNDRED) {
    const tens = TENS[Number(value / TEN)] as string;
    return value % TEN === 0n ? tens : `${tens}-${UNITS[Number(value % TEN)] as string}`;
  }
  const hundreds = `${UNITS[Number(value / HUNDRED)] as string} hundred`;
  return value % HUNDRED === 0n ? hundreds : `${hundreds} and ${belowThousand(value % HUNDRED)}`;
}

/**
 * A non-negative number as cardinal words, or undefined when it is too large to name.
 *
 * @example
 * cardinalWords(2025n); // 'two thousand and twenty-five'
 */
export function cardinalWords(value: bigint): string | undefined {
  if (value >= WORDS_LIMIT) return undefined;
  if (value < THOUSAND) return belowThousand(value);
  const groups: string[] = [];
  let scale = -1;
  for (let rest = value; rest > 0n; rest /= THOUSAND) {
    const group = rest % THOUSAND;
    if (group !== 0n)
      groups.unshift(scale < 0 ? belowThousand(group) : `${belowThousand(group)} ${SCALES[scale] as string}`);
    scale++;
  }
  // A last group below a hundred joins the rest with `and`, as in `one thousand and one`.
  const last = value % THOUSAND;
  if (last > 0n && last < HUNDRED) return `${groups.slice(0, -1).join(' ')} and ${groups.at(-1) as string}`;
  return groups.join(' ');
}

/** The ordinal of a cardinal word: `one` to `first`, `twenty` to `twentieth`, `seven` to `seventh`. */
function ordinalOfWord(word: string): string {
  const irregular = IRREGULAR_ORDINALS[word];
  if (irregular !== undefined) return irregular;
  return word.endsWith('y') ? `${word.slice(0, -1)}ieth` : `${word}th`;
}

/**
 * A non-negative number as ordinal words, or undefined when it is too large to name.
 *
 * @example
 * ordinalWords(21n); // 'twenty-first'
 */
export function ordinalWords(value: bigint): string | undefined {
  const cardinal = cardinalWords(value);
  if (cardinal === undefined) return undefined;
  const wordStart = Math.max(cardinal.lastIndexOf(' '), cardinal.lastIndexOf('-')) + 1;
  return `${cardinal.slice(0, wordStart)}${ordinalOfWord(cardinal.slice(wordStart))}`;
}

/**
 * The English ordinal suffix of a number written in digits: `st`, `nd`, `rd` or `th`.
 *
 * @example
 * ordinalSuffix(22n); // 'nd'
 * ordinalSuffix(12n); // 'th'
 */
export function ordinalSuffix(value: bigint): string {
  const lastTwo = value % HUNDRED;
  if (lastTwo >= ELEVEN && lastTwo <= THIRTEEN) return 'th';
  return SUFFIXES[String(value % TEN)] ?? 'th';
}
