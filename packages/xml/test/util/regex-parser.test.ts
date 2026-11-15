import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { RegexError } from '@/util/regex-error';
import { type PatternOptions, translatePattern } from '@/util/regex-parser';

/** XPath with no flags. */
const XPATH: PatternOptions = {
  dialect: 'xpath',
  caseInsensitive: false,
  dotAll: false,
  multiline: false,
  ignoreWhitespace: false,
  literal: false,
};

/** The JavaScript expression a pattern translates to, with XPath and no flags unless overridden. */
function compile(pattern: string, options: Partial<PatternOptions> = {}): RegExp {
  return new RegExp(translatePattern(pattern, { ...XPATH, ...options }).source, 'v');
}

/** Whether a pattern matches somewhere in a string. */
function matches(input: string, pattern: string, options: Partial<PatternOptions> = {}): boolean {
  return compile(pattern, options).test(input);
}

/** The error translating a pattern throws. */
function failure(pattern: string, options: Partial<PatternOptions> = {}): RegexError {
  try {
    translatePattern(pattern, { ...XPATH, ...options });
  } catch (error) {
    if (error instanceof RegexError) return error;
    throw error;
  }
  throw new Error(`"${pattern}" translated`);
}

describe('translatePattern: branches, pieces and groups', () => {
  it.each([
    ['abc', 'xabcx', true],
    ['a|b', 'b', true],
    ['a|', '', true],
    ['', 'anything', true],
    ['ab?c', 'ac', true],
    ['ab*c', 'abbbc', true],
    ['ab+c', 'ac', false],
    ['a{2}', 'aa', true],
    ['^a{2}$', 'aaa', false],
    ['^a{2,}$', 'aaaa', true],
    ['^a{2,3}$', 'aaaa', false],
    ['^a{0,0}$', '', true],
    ['^(ab)+$', 'abab', true],
    ['^(?:ab)+$', 'abab', true],
    ['^()$', '', true],
  ])('translates %j to match %j: %s', (pattern, input, expected) => {
    expect(matches(input, pattern)).toBe(expected);
  });

  it('counts capturing groups by their opening parentheses, and not non-capturing ones', () => {
    expect(translatePattern('(a(b))(?:c)(d)', XPATH).groupCount).toBe(3);
    expect(compile('(a(b))(?:c)(d)').exec('abcd')?.slice(1)).toEqual(['ab', 'b', 'd']);
  });

  it('records the capturing group each group sits in, through non-capturing ones', () => {
    expect(translatePattern('(a(b(?:(c))))(d)', XPATH).groupParents).toEqual([0, 0, 1, 2, 0]);
    expect(translatePattern('(b)(x?)', XPATH).groupParents).toEqual([0, 0, 0]);
  });

  it('keeps reluctant quantifiers in XPath', () => {
    for (const quantifier of ['??', '*?', '+?', '{1}?', '{1,}?', '{1,3}?']) {
      expect(compile(`a${quantifier}`).source).toBe(`a${quantifier}`);
    }
    expect(compile('^(a+?)(a*)$').exec('aaa')?.slice(1)).toEqual(['a', 'aa']);
  });

  it('compares large quantifier bounds by value', () => {
    expect(matches('a', '^a{0,99999999999999999999}$')).toBe(true);
    expect(failure('a{99999999999999999999,1}').reason).toBe(
      "the quantifier's minimum 99999999999999999999 is above its maximum 1"
    );
  });

  it.each([
    ['*', 'the quantifier "*" has nothing to repeat', 0],
    ['a**', 'the quantifier "*" has nothing to repeat', 2],
    ['a*??', 'the quantifier "?" has nothing to repeat', 3],
    ['a{2}{3}', 'the quantifier "{" has nothing to repeat', 4],
    ['(+)', 'the quantifier "+" has nothing to repeat', 1],
    ['|?', 'the quantifier "?" has nothing to repeat', 1],
    ['a{', '"{" must start a quantifier such as "{2}", "{2,}" or "{2,5}"', 1],
    ['a{,2}', '"{" must start a quantifier such as "{2}", "{2,}" or "{2,5}"', 1],
    ['a{2,1}', "the quantifier's minimum 2 is above its maximum 1", 1],
    ['a{2', 'the quantifier has no "}" to close it', 1],
    ['a{2,3x}', 'the quantifier has no "}" to close it', 1],
    ['a}', String.raw`"}" must be escaped as "\}" outside a class`, 1],
    ['a]', String.raw`"]" must be escaped as "\]" outside a class`, 1],
    ['(a', 'this group has no ")" to close it', 0],
    ['a)', 'this ")" closes no group', 1],
    ['(?a)', '"(?" must start a non-capturing group "(?:"', 0],
    ['(?', '"(?" must start a non-capturing group "(?:"', 0],
    ['(?:a', 'this group has no ")" to close it', 0],
  ])('rejects %j: %s', (pattern, reason, index) => {
    const error = failure(pattern);
    expect([error.kind, error.reason, error.index]).toEqual(['invalid-pattern', reason, index]);
  });
});

describe('translatePattern: XPath anchors and the m flag (F&O 3.1 §5.6.1.1, §5.6.2)', () => {
  it('anchors at the ends of the whole string without m', () => {
    expect(matches('ab', '^a')).toBe(true);
    expect(matches('ba', '^a')).toBe(false);
    expect(matches('a\n', 'a$')).toBe(false);
    expect(matches('x\na', '^a')).toBe(false);
  });

  it('lets a quantifier follow an anchor', () => {
    expect(matches('a', '^*a$+')).toBe(true);
  });

  it('breaks lines at LF only with m', () => {
    expect(matches('x\na', '^a', { multiline: true })).toBe(true);
    expect(matches('a\nx', 'a$', { multiline: true })).toBe(true);
    for (const separator of ['\r', '\u2028', '\u2029', '\u0085']) {
      expect(matches(`x${separator}a`, '^a', { multiline: true })).toBe(false);
      expect(matches(`a${separator}x`, 'a$', { multiline: true })).toBe(false);
    }
  });

  it('matches no line start after, nor line end before, a final LF', () => {
    expect(matches('abcd\ndefg\n', '^$', { multiline: true })).toBe(false);
    expect(matches('\nabcd\ndefg\n', '^$', { multiline: true })).toBe(true);
    expect(matches('abcd\n\ndefg\n', '^$', { multiline: true })).toBe(true);
    expect(matches('', '^$', { multiline: true })).toBe(true);
    expect(compile('^.+$', { multiline: true, dotAll: false }).exec('ab\ncd\n')?.[0]).toBe('ab');
    const lineEnds = new RegExp(compile('$', { multiline: true }), 'gv');
    expect('ab\ncd\n'.match(lineEnds)?.length).toBe(2);
  });
});

describe('translatePattern: the dot and the s flag (F&O 3.1 §5.6.2)', () => {
  it('matches every character but LF and CR without s', () => {
    for (const char of ['a', '\u2028', '\u2029', '\u0085', '\u{1F600}']) expect(matches(char, '^.$')).toBe(true);
    expect(matches('\n', '.')).toBe(false);
    expect(matches('\r', '.')).toBe(false);
  });

  it('matches every character with s', () => {
    expect(matches('\n\r', '^..$', { dotAll: true })).toBe(true);
  });

  it('matches a character beyond the BMP as one', () => {
    expect(matches('\u{1F600}', '^.$')).toBe(true);
    expect(matches('\u{1F600}', '^\u{1F600}{2}$')).toBe(false);
    expect(matches('\u{1F600}\u{1F600}', '^\u{1F600}{2}$')).toBe(true);
  });
});

describe('translatePattern: escapes (XSD 1.1 Part 2 §G.4)', () => {
  it.each([
    [String.raw`\n`, '\n'],
    [String.raw`\r`, '\r'],
    [String.raw`\t`, '\t'],
    ...Array.from(String.raw`\|.?*+(){}-[]^$`, (char) => [`\\${char}`, char]),
  ])('reads %j as one character', (pattern, char) => {
    expect(matches(char, `^${pattern}$`)).toBe(true);
    expect(matches(char, `^[${pattern}]$`)).toBe(true);
  });

  it('reads characters JavaScript treats as syntax as themselves', () => {
    for (const char of ['/', '-', '&', '!', '#', '%', ',', ':', ';', '<', '=', '>', '@', '`', '~', '"', "'"]) {
      expect(matches(char, `^${char}$`)).toBe(true);
      expect(matches(char, `^[${char}]$`)).toBe(true);
      expect(matches(char + char, `^[${char}${char}]+$`)).toBe(true);
    }
    expect(matches('\u0001\u007F', '^[\u0001][\u007F]$')).toBe(true);
  });

  it.each([
    [String.raw`\a`, String.raw`"\a" is not an escape regular expressions allow`, 0],
    [String.raw`\0`, String.raw`"\0" is not an escape regular expressions allow`, 0],
    [String.raw`\b`, String.raw`"\b" is not an escape regular expressions allow`, 0],
    [String.raw`\u0041`, String.raw`"\u" is not an escape regular expressions allow`, 0],
    ['a\\', String.raw`the pattern ends with an unfinished escape "\"`, 1],
    ['[a\\', String.raw`the pattern ends with an unfinished escape "\"`, 2],
    [String.raw`[\1]`, String.raw`back-references such as "\1" are not allowed inside a class`, 1],
    [String.raw`[\a]`, String.raw`"\a" is not an escape regular expressions allow`, 1],
  ])('rejects %j: %s', (pattern, reason, index) => {
    const error = failure(pattern);
    expect([error.reason, error.index]).toEqual([reason, index]);
  });

  it.each([
    [String.raw`\s`, ' \t\n\r', '\u00A0\u2028\f\v'],
    [String.raw`\S`, 'a\u00A0\f', ' \t\n\r'],
    [String.raw`\d`, '0\u0660\u{1D7CE}', 'a\u00B2'],
    [String.raw`\D`, 'a\u00B2', '0\u0660'],
    [String.raw`\w`, 'a1\u00E9$+', '-._!\u00A0\u0001'],
    [String.raw`\W`, '-._!\u00A0\u0001', 'a1\u00E9$'],
    [String.raw`\i`, 'a:_\u00C0\u{10000}', '1-.\u00B7\u00D7'],
    [String.raw`\I`, '1-.\u00B7\u00D7', 'a:_'],
    [String.raw`\c`, 'a:_1-.\u00B7\u0300', ' \u00D7'],
    [String.raw`\C`, ' \u00D7', 'a1'],
  ])('reads %s as XSD defines it, outside and inside a class', (escape, members, others) => {
    for (const char of members) {
      expect(matches(char, `^${escape}$`)).toBe(true);
      expect(matches(char, `^[${escape}]$`)).toBe(true);
    }
    for (const char of others) {
      expect(matches(char, `^${escape}$`)).toBe(false);
      expect(matches(char, `^[${escape}]$`)).toBe(false);
    }
  });
});

describe('translatePattern: categories and blocks (XSD 1.1 Part 2 §G.4)', () => {
  it('reads general categories and their complements', () => {
    expect(matches('A', String.raw`^\p{Lu}$`)).toBe(true);
    expect(matches('a', String.raw`^\p{Lu}$`)).toBe(false);
    expect(matches('a', String.raw`^\P{Lu}$`)).toBe(true);
    expect(matches('\u0378', String.raw`^\p{Cn}$`)).toBe(true);
    expect(matches('x', String.raw`^[\p{N}\P{L}]$`)).toBe(false);
  });

  it('reads blocks, by their names without spaces', () => {
    expect(matches('~', String.raw`^\p{IsBasicLatin}$`)).toBe(true);
    expect(matches('\u00E9', String.raw`^\p{IsBasicLatin}$`)).toBe(false);
    expect(matches('\u00E9', String.raw`^\P{IsBasicLatin}$`)).toBe(true);
    expect(matches('\u00E9', String.raw`^[\p{IsLatin-1Supplement}]$`)).toBe(true);
    expect(matches('\u{1F600}', String.raw`^\p{IsEmoticons}$`)).toBe(true);
  });

  it('reads the block names XSD 1.0 used before Unicode renamed them', () => {
    expect(matches('\u03C0\u03E2', String.raw`^\p{IsGreek}+$`)).toBe(true);
    expect(matches('\u20D0', String.raw`^\p{IsCombiningMarksforSymbols}$`)).toBe(true);
    for (const char of ['\uE000', '\u{F0000}', '\u{10FFFD}'])
      expect(matches(char, String.raw`^\p{IsPrivateUse}$`)).toBe(true);
    expect(matches('a', String.raw`^\p{IsPrivateUse}$`)).toBe(false);
  });

  it('rejects an unknown block in XPath, but lets it match every character in XSD', () => {
    expect(failure(String.raw`\p{IsKlingon}`).reason).toBe('"Klingon" is not the name of a Unicode block');
    expect(failure(String.raw`\p{Isconstructor}`).reason).toBe('"constructor" is not the name of a Unicode block');
    const xsd = { dialect: 'xsd' } as const;
    expect(matches('\u{1F600}', String.raw`\p{IsKlingon}`, xsd)).toBe(true);
    expect(matches('a', String.raw`\P{IsKlingon}`, xsd)).toBe(false);
    expect(matches('a', String.raw`[\P{IsKlingon}a]`, xsd)).toBe(true);
  });

  it.each([
    [String.raw`\p{Xx}`, '"Xx" is neither a category nor "Is" and a block name'],
    [String.raw`\p{Cs}`, '"Cs" is neither a category nor "Is" and a block name'],
    [String.raw`\p{Is}`, '"Is" is neither a category nor "Is" and a block name'],
    [String.raw`\p{IsBasic Latin}`, '"IsBasic Latin" is neither a category nor "Is" and a block name'],
    [String.raw`\p{lu}`, '"lu" is neither a category nor "Is" and a block name'],
    [String.raw`\pL`, String.raw`"\p" must be followed by a name in braces`],
    [String.raw`\P`, String.raw`"\P" must be followed by a name in braces`],
    [String.raw`\p{L`, 'the category escape has no "}" to close it'],
  ])('rejects %j: %s', (pattern, reason) => {
    expect(failure(pattern).reason).toBe(reason);
    expect(failure(pattern, { dialect: 'xsd' }).reason).toBe(reason);
  });
});

describe('translatePattern: classes (XSD 1.1 Part 2 §G.4)', () => {
  it.each([
    ['[abc]', 'b', true],
    ['[^abc]', 'b', false],
    ['[^abc]', 'd', true],
    ['[a-z]', 'm', true],
    ['[a-z]', 'M', false],
    ['[^a-z]', '\n', true],
    ['[a^]', '^', true],
    ['[$]', '$', true],
    ['[.]', 'x', false],
    ['[-a]', '-', true],
    ['[a-]', '-', true],
    ['[a-z-]', '-', true],
    ['[^-a]', '-', false],
    ['[--]', '-', true],
    ['[+--]', ',', true],
    ['[a-c-e]', '-', true],
    ['[a-c-e]', 'd', false],
    [String.raw`[a-\}-]`, '}', true],
    [String.raw`[\[-\]]`, '\\', true],
    ['[\u{10000}-\u{10FFFF}]', '\u{1F600}', true],
    ['[\u{10000}-\u{10FFFF}]', '\uFFFD', false],
  ])('translates %j to match %j: %s', (pattern, input, expected) => {
    expect(matches(input, `^${pattern}$`)).toBe(expected);
  });

  it('subtracts classes, nested and complemented', () => {
    expect(compile('[a-z-[aeiou]]').source).toBe('[[a-z]--[aeiou]]');
    const consonant = '^[a-z-[aeiou]]$';
    expect([matches('b', consonant), matches('e', consonant)]).toEqual([true, false]);
    const nested = '^[a-z-[aeiou-[e]]]$';
    expect([matches('e', nested), matches('a', nested), matches('b', nested)]).toEqual([true, false, true]);
    const complemented = '^[^a-z-[0-9]]$';
    expect([matches('A', complemented), matches('5', complemented), matches('m', complemented)]).toEqual([
      true,
      false,
      false,
    ]);
    expect(matches('-', String.raw`^[a-d\--[bc]]$`)).toBe(true);
    expect(matches('x', String.raw`^[\w-[\d]]$`)).toBe(true);
  });

  it.each([
    ['[]', 'a class must hold at least one character, range or escape', 0],
    ['[^]', 'a class must hold at least one character, range or escape', 0],
    ['[a', 'this class has no "]" to close it', 0],
    ['[a[b]', String.raw`"[" must be escaped as "\[" inside a class`, 2],
    ['[-[a]]', 'a class must hold something before "-[" subtracts from it', 0],
    ['[a-[b]c]', 'a subtraction "-[...]" must end its class', 0],
    ['[z-a]', 'this range ends before it starts', 1],
    ['[a--b]', 'this range ends before it starts', 1],
    [String.raw`[a-\d]`, 'a range must end with a character, not a multi-character escape', 1],
    ['[a-\\', String.raw`the pattern ends with an unfinished escape "\"`, 3],
  ])('rejects %j: %s', (pattern, reason, index) => {
    const error = failure(pattern);
    expect([error.reason, error.index]).toEqual([reason, index]);
  });
});

describe('translatePattern: back-references (F&O 3.1 §5.6.1.4)', () => {
  it('matches what a closed group captured', () => {
    expect(matches('abab', String.raw`^(ab)\1$`)).toBe(true);
    expect(matches('abba', String.raw`^(ab)\1$`)).toBe(false);
    expect(matches('aa', String.raw`^(a)\1*$`)).toBe(true);
  });

  it('reads more digits only while they name a group that has opened', () => {
    expect(matches('#abc#1', String.raw`^(#)abc\11$`)).toBe(true);
    const tenGroups = '(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)';
    expect(matches('abcdefghijj', `^${tenGroups}\\10$`)).toBe(true);
    expect(matches('abcdefghija0', `^${tenGroups}\\10$`)).toBe(false);
    expect(matches('abcdefghia0', `^(a)(b)(c)(d)(e)(f)(g)(h)(i)\\10$`)).toBe(true);
  });

  it('rejects a reference to a group that does not exist or has not closed', () => {
    expect(failure(String.raw`(a)\2`).reason).toBe(String.raw`\2 refers to group 2, which does not exist`);
    expect(failure(String.raw`\1(a)`).reason).toBe(String.raw`\1 refers to group 1, which does not exist`);
    expect(failure(String.raw`(a\1)`).reason).toBe(String.raw`\1 refers to group 1 before it closes`);
    expect(failure(String.raw`(a)(b\2)`).index).toBe(5);
  });

  it('is not allowed in XSD', () => {
    expect(failure(String.raw`(a)\1`, { dialect: 'xsd' }).reason).toBe(
      String.raw`back-references such as "\1" are not allowed in an XSD pattern`
    );
  });
});

describe('translatePattern: the XSD dialect (XSD 1.1 Part 2 §G)', () => {
  const xsd = { dialect: 'xsd' } as const;

  it('matches the whole string', () => {
    expect(matches('abc', 'b', xsd)).toBe(false);
    expect(matches('b', 'b', xsd)).toBe(true);
    expect(matches('ab', 'a|ab', xsd)).toBe(true);
    expect(translatePattern('(a)|b', { ...XPATH, ...xsd }).groupCount).toBe(1);
  });

  it('reads ^ and $ as characters', () => {
    expect(matches('^a$', '^a$', xsd)).toBe(true);
    expect(matches('a', '^a$', xsd)).toBe(false);
  });

  it(String.raw`has no non-capturing groups, reluctant quantifiers or \$`, () => {
    expect(failure('(?:a)', xsd).reason).toBe('the quantifier "?" has nothing to repeat');
    expect(failure('a*?', xsd).reason).toBe('the quantifier "?" has nothing to repeat');
    expect(failure(String.raw`\$`, xsd).reason).toBe(String.raw`"\$" is not an escape regular expressions allow`);
    expect(failure(String.raw`[\$]`, xsd).reason).toBe(String.raw`"\$" is not an escape regular expressions allow`);
  });
});

describe('translatePattern: the i flag (F&O 3.1 §5.6.2)', () => {
  const caseInsensitive = { caseInsensitive: true } as const;

  it('matches characters and ranges with their case variants', () => {
    expect(matches('ABC', '^abc$', caseInsensitive)).toBe(true);
    expect(matches('\u212A', '^k$', caseInsensitive)).toBe(true);
    expect(matches('\u212A', '^[A-Z]$', caseInsensitive)).toBe(true);
    expect(matches('\u017F', '^[r-t]$', caseInsensitive)).toBe(true);
    expect(matches('\u0131', '^I$', caseInsensitive)).toBe(true);
    expect(matches('\u0130', '^i$', caseInsensitive)).toBe(false);
    expect(matches('1', '^1$', caseInsensitive)).toBe(true);
    expect(matches('\u{10428}', '^\u{10400}$', caseInsensitive)).toBe(true);
  });

  it('complements and subtracts after adding the variants', () => {
    expect(matches('q', '^[^Q]$', caseInsensitive)).toBe(false);
    expect(matches('i', '^[A-Z-[IO]]$', caseInsensitive)).toBe(false);
    expect(matches('b', '^[A-Z-[IO]]$', caseInsensitive)).toBe(true);
  });

  it('leaves categories and other escapes as they are', () => {
    expect(matches('m', String.raw`\p{Lu}`, caseInsensitive)).toBe(false);
    expect(matches('m', String.raw`\P{Lu}`, caseInsensitive)).toBe(true);
    expect(matches('a', String.raw`[\p{Lu}]`, caseInsensitive)).toBe(false);
  });

  it('compares back-references case-blind', () => {
    for (const word of ['Mum', 'mom', 'Dad', 'DUD']) {
      expect(matches(word, String.raw`^([md])[aeiou]\1$`, caseInsensitive)).toBe(true);
    }
    expect(matches('mud', String.raw`^([md])[aeiou]\1$`, caseInsensitive)).toBe(false);
  });
});

describe('translatePattern: the x flag (F&O 3.1 §5.6.2)', () => {
  const extended = { ignoreWhitespace: true } as const;

  it('ignores whitespace outside classes, even inside escapes and quantifiers', () => {
    expect(matches('helloworld', '^hello world$', extended)).toBe(true);
    expect(matches('hello world', String.raw`^hello\ sworld$`, extended)).toBe(true);
    expect(matches('aa', '^a{ 1 , 2 }$', extended)).toBe(true);
    expect(matches('A', String.raw`^\p{ L u }$`, extended)).toBe(true);
    expect(matches('aa', String.raw`^(a)\ 1$`, extended)).toBe(true);
    expect(matches('ab', '^( ?: a)b$', extended)).toBe(true);
    expect(matches('a', ' a\t\n\r', extended)).toBe(true);
  });

  it('keeps whitespace inside classes', () => {
    expect(matches('helloworld', '^hello[ ]world$', extended)).toBe(false);
    expect(matches('hello world', '^hello[ ]world$', extended)).toBe(true);
    expect(failure(String.raw`[\p{ L }]`, extended).reason).toBe(
      '" L " is neither a category nor "Is" and a block name'
    );
  });
});

describe('translatePattern: the q flag (F&O 3.1 §5.6.2)', () => {
  const literal = { literal: true } as const;

  it('reads every character as itself', () => {
    expect(matches(String.raw`a.b*(c)[d]{e}\$^`, String.raw`^a.b*(c)[d]{e}\$^`, literal)).toBe(false);
    expect(matches(String.raw`xa.b*(c)[d]{e}\$^y`, String.raw`a.b*(c)[d]{e}\$^`, literal)).toBe(true);
    expect(matches('axb', 'a.b', literal)).toBe(false);
    expect(translatePattern('(a)', { ...XPATH, ...literal }).groupCount).toBe(0);
  });

  it('still honours i', () => {
    expect(matches('Mr. B. Obama', 'B. OBAMA', { ...literal, caseInsensitive: true })).toBe(true);
  });
});

describe('translatePattern: properties', () => {
  /** Characters and escapes that are safe to repeat in a pattern. */
  const atom = fc.constantFrom(
    'a',
    'Z',
    '\u00E9',
    '\u{1F600}',
    String.raw`\.`,
    String.raw`\-`,
    String.raw`\d`,
    '[a-c]',
    '[^x]',
    '.',
    String.raw`\p{Lu}`
  );

  /** A string each atom matches. */
  const samples = new Map([
    [String.raw`\.`, '.'],
    [String.raw`\-`, '-'],
    [String.raw`\d`, '7'],
    ['[a-c]', 'b'],
    ['[^x]', 'y'],
    ['.', 'q'],
    [String.raw`\p{Lu}`, 'Q'],
  ]);

  test.prop([fc.array(atom, { maxLength: 6 })])('matches a sequence of atoms where each matches its own', (atoms) => {
    const input = atoms.map((piece) => samples.get(piece) ?? piece).join('');
    expect(matches(input, `^${atoms.join('')}$`)).toBe(true);
  });

  test.prop([fc.string({ unit: 'binary', maxLength: 12 })])('reads any string as itself under q', (text) => {
    const { source } = translatePattern(text, { ...XPATH, literal: true });
    expect(new RegExp(`^(?:${source})$`, 'v').test(text)).toBe(true);
  });
});
