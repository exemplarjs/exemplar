/**
 * Translates an XPath or XSD regular expression into the source of a JavaScript `v`-mode one,
 * checking it against the grammar as it goes (F&O 3.1 §5.6.1, XSD 1.1 Part 2 §G). A recursive
 * descent over the pattern's characters writes each construct's JavaScript equivalent:
 * `[a-z-[aeiou]]` becomes `[[a-z]--[aeiou]]`, `\i` the class of XML name-start characters, and
 * under the `i` flag `k` becomes `[kK\u{212a}]`. The translation never uses JavaScript's own
 * flags, whose `i`, `m` and `s` differ from XPath's in which characters they treat alike.
 */

import { caseVariants, caseVariantsInRange } from '@/util/case-variants';
import { Char, isAsciiDigit } from '@/util/chars';
import { ErrorFactory } from '@/util/errors';
import { Radix } from '@/util/numbers';
import { RegexError } from '@/util/regex-error';
import {
  blockRanges,
  classChar,
  classRange,
  isBlockName,
  isCategory,
  multiCharEscape,
  patternChar,
} from '@/util/regex-sets';

/** Which grammar a pattern follows: XPath's (F&O 3.1 §5.6.1) or XML Schema's (XSD 1.1 Part 2 §G). */
export type RegexDialect = 'xpath' | 'xsd';

/** The dialect and the XPath flags (F&O 3.1 §5.6.2) a pattern is translated with. */
export interface PatternOptions {
  readonly dialect: RegexDialect;
  /** `i`: characters match their case variants. */
  readonly caseInsensitive: boolean;
  /** `s`: `.` matches every character, LF and CR too. */
  readonly dotAll: boolean;
  /** `m`: `^` and `$` match at the starts and ends of lines. */
  readonly multiline: boolean;
  /** `x`: whitespace outside classes is ignored. */
  readonly ignoreWhitespace: boolean;
  /** `q`: every character stands for itself. */
  readonly literal: boolean;
}

/** A translated pattern: the JavaScript source, for the `v` flag only, and how many groups capture. */
export interface TranslatedPattern {
  readonly source: string;
  readonly groupCount: number;
  /** Each capturing group's enclosing capturing group, by number, 0 for none; index 0 is unused. */
  readonly groupParents: readonly number[];
}

/** The whitespace the `x` flag ignores: tab, LF, CR and space. */
const IGNORABLE_WHITESPACE = new Set(['\t', '\n', '\r', ' ']);

/** The reason for a pattern that ends in the middle of an escape. */
const UNFINISHED_ESCAPE = String.raw`the pattern ends with an unfinished escape "\"`;

/** The code points single-character escapes such as `\n` or `\*` stand for, by the escaped letter. */
const SINGLE_CHAR_ESCAPES: ReadonlyMap<string, number> = new Map([
  ['n', Char.LINE_FEED],
  ['r', Char.CARRIAGE_RETURN],
  ['t', Char.TAB],
  ...Array.from(String.raw`\|.?*+(){}-[]^`, (char) => [char, char.codePointAt(0) as number] as const),
]);

/** `.` without the `s` flag: everything but LF and CR. */
const DOT = String.raw`[^\n\r]`;
/** `.` with the `s` flag: everything. */
const DOT_ALL = '[^]';
/** `^` with the `m` flag: the start, or after an LF that does not end the string (F&O 3.1 §5.6.2). */
const LINE_START = String.raw`(?:^|(?<=\n)(?!$))`;
/** `$` with the `m` flag: before an LF, or the end when the string does not end with one (F&O 3.1 §5.6.2). */
const LINE_END = String.raw`(?:(?=\n)|$(?<!\n))`;

/** One part of a class: its class items, and the character it stands for when it is a single one. */
interface ClassPart {
  readonly source: string;
  readonly char?: number;
}

/** Translates a pattern, throwing a `RegexError` for one the dialect does not allow. */
export function translatePattern(pattern: string, options: PatternOptions): TranslatedPattern {
  return new PatternTranslator(pattern, options).translate();
}

/** The translation of one pattern: a cursor over its characters, and the groups seen so far. */
class PatternTranslator {
  readonly #pattern: string;
  readonly #chars: readonly string[];
  readonly #options: PatternOptions;
  readonly #xpath: boolean;
  #index = 0;
  /** How many classes the cursor is inside, where the `x` flag keeps whitespace. */
  #classDepth = 0;
  /** How many capturing groups have opened. */
  #groupCount = 0;
  /** The capturing groups open at the cursor, innermost last. */
  readonly #openGroups: number[] = [];
  /** Each capturing group's enclosing capturing group, 0 for none. */
  readonly #groupParents: number[] = [0];

  constructor(pattern: string, options: PatternOptions) {
    this.#pattern = pattern;
    this.#chars = Array.from(pattern);
    this.#options = options;
    this.#xpath = options.dialect === 'xpath';
  }

  /** The whole pattern's JavaScript source; an XSD pattern must match the whole string. */
  translate(): TranslatedPattern {
    const source = this.#options.literal ? this.#literalPattern() : this.#regExp();
    if (this.#peek() !== undefined) this.#fail('this ")" closes no group');
    return {
      source: this.#xpath ? source : `^(?:${source})$`,
      groupCount: this.#groupCount,
      groupParents: this.#groupParents,
    };
  }

  /** The pattern under the `q` flag, every character standing for itself. */
  #literalPattern(): string {
    const source = this.#chars.map((char) => this.#literal(char.codePointAt(0) as number)).join('');
    this.#index = this.#chars.length;
    return source;
  }

  /** regExp: branches separated by `|`. */
  #regExp(): string {
    const branches = [this.#branch()];
    while (this.#peek() === '|') {
      this.#index++;
      branches.push(this.#branch());
    }
    return branches.join('|');
  }

  /** branch: pieces up to the next `|`, the `)` that closes the group, or the end. */
  #branch(): string {
    let source = '';
    for (let char = this.#peek(); char !== undefined && char !== '|' && char !== ')'; char = this.#peek()) {
      source += this.#piece();
    }
    return source;
  }

  /** piece: an atom, then any quantifier; a bare anchor is grouped so that JavaScript lets it be quantified. */
  #piece(): string {
    const atom = this.#atom();
    const quantifier = this.#quantifier();
    const isQuantifiedAnchor = quantifier !== '' && (atom === '^' || atom === '$');
    return isQuantifiedAnchor ? `(?:${atom})${quantifier}` : atom + quantifier;
  }

  /** atom: a character, a class, a group, an escape, or in XPath an anchor or a back-reference. */
  #atom(): string {
    const start = this.#index;
    const char = this.#next() as string;
    switch (char) {
      case '(': {
        return this.#group();
      }
      case '[': {
        return this.#classExpression();
      }
      case '\\': {
        return this.#escape();
      }
      case '.': {
        return this.#options.dotAll ? DOT_ALL : DOT;
      }
      case '?':
      case '*':
      case '+':
      case '{': {
        return this.#fail(`the quantifier "${char}" has nothing to repeat`, start);
      }
      case ']':
      case '}': {
        return this.#fail(`"${char}" must be escaped as "\\${char}" outside a class`, start);
      }
      default: {
        return this.#xpath ? this.#xpathChar(char) : this.#literal(char.codePointAt(0) as number);
      }
    }
  }

  /** An XPath atom that is a character: `^` and `$` are anchors there. */
  #xpathChar(char: string): string {
    if (char === '^') return this.#options.multiline ? LINE_START : '^';
    if (char === '$') return this.#options.multiline ? LINE_END : '$';
    return this.#literal(char.codePointAt(0) as number);
  }

  /** A group, after its `(`: capturing, or in XPath non-capturing when it starts `?:`. */
  #group(): string {
    const start = this.#index - 1;
    if (this.#xpath && this.#peek() === '?') {
      this.#index++;
      if (this.#next() !== ':') this.#fail('"(?" must start a non-capturing group "(?:"', start);
      return `(?:${this.#regExpUntilClose(start)})`;
    }
    const number = ++this.#groupCount;
    this.#groupParents[number] = this.#openGroups.at(-1) ?? 0;
    this.#openGroups.push(number);
    const source = this.#regExpUntilClose(start);
    this.#openGroups.pop();
    return `(${source})`;
  }

  /** A group's regExp, then the `)` that closes the group opened at `start`. */
  #regExpUntilClose(start: number): string {
    const source = this.#regExp();
    if (this.#next() !== ')') this.#fail('this group has no ")" to close it', start);
    return source;
  }

  /** quantifier: `?`, `*`, `+` or `{...}`, and in XPath a `?` after it that makes it reluctant. */
  #quantifier(): string {
    const char = this.#peek();
    let quantifier: string;
    if (char === '?' || char === '*' || char === '+') {
      this.#index++;
      quantifier = char;
    } else if (char === '{') {
      this.#index++;
      quantifier = `{${this.#quantity()}}`;
    } else {
      return '';
    }
    if (this.#xpath && this.#peek() === '?') {
      this.#index++;
      quantifier += '?';
    }
    return quantifier;
  }

  /** quantity, after the `{`: `n`, `n,` or `n,m` with n no more than m, then the `}`. */
  #quantity(): string {
    const start = this.#index - 1;
    const min = this.#digits();
    if (min === '') this.#fail('"{" must start a quantifier such as "{2}", "{2,}" or "{2,5}"', start);
    let quantity = min;
    if (this.#peek() === ',') {
      this.#index++;
      const max = this.#digits();
      if (max !== '' && BigInt(min) > BigInt(max)) {
        this.#fail(`the quantifier's minimum ${min} is above its maximum ${max}`, start);
      }
      quantity += `,${max}`;
    }
    if (this.#next() !== '}') this.#fail('the quantifier has no "}" to close it', start);
    return quantity;
  }

  /** The decimal digits at the cursor, empty for none. */
  #digits(): string {
    let digits = '';
    for (let char = this.#peek(); char !== undefined && isAsciiDigit(char); char = this.#peek()) {
      digits += char;
      this.#index++;
    }
    return digits;
  }

  /** An escape outside a class, after its `\`. */
  #escape(): string {
    const start = this.#index - 1;
    const letter = this.#next();
    if (letter === undefined) return this.#fail(UNFINISHED_ESCAPE, start);
    if (this.#xpath && isAsciiDigit(letter) && letter !== '0') return this.#backReference(letter, start);
    const escaped = this.#singleCharEscape(letter);
    return escaped === undefined ? this.#setEscape(letter, start) : this.#literal(escaped);
  }

  /**
   * A back-reference, after its `\` and first digit. More digits join the number only while it
   * names a group that has opened, so with fewer than ten groups `\10` is `\1` then `0`.
   */
  #backReference(firstDigit: string, start: number): string {
    let number = Number(firstDigit);
    for (let char = this.#peek(); char !== undefined && isAsciiDigit(char); char = this.#peek()) {
      const longer = number * Radix.DECIMAL + Number(char);
      if (longer > this.#groupCount) break;
      number = longer;
      this.#index++;
    }
    if (number > this.#groupCount) this.#fail(`\\${number} refers to group ${number}, which does not exist`, start);
    if (this.#openGroups.includes(number)) this.#fail(`\\${number} refers to group ${number} before it closes`, start);
    // The group keeps a digit that follows out of the number; under `i` the reference compares case-blind.
    return this.#options.caseInsensitive ? `(?i:\\${number})` : `(?:\\${number})`;
  }

  /** The character a single-character escape stands for, such as LF for `\n`; undefined for another letter. */
  #singleCharEscape(letter: string): number | undefined {
    const escaped = SINGLE_CHAR_ESCAPES.get(letter);
    if (escaped !== undefined) return escaped;
    // XPath also escapes `$`, its end anchor.
    if (this.#xpath && letter === '$') return letter.codePointAt(0);
    return undefined;
  }

  /** A multi-character or category escape such as `\d` or `\p{Lu}`, after its `\`; anything else is an error. */
  #setEscape(letter: string, start: number): string {
    const set = multiCharEscape(letter);
    if (set !== undefined) return set;
    if (letter === 'p' || letter === 'P') return this.#property(letter === 'P', start);
    // An XPath back-reference outside a class never reaches here.
    if (isAsciiDigit(letter) && letter !== '0') {
      const where = this.#classDepth > 0 ? 'inside a class' : 'in an XSD pattern';
      return this.#fail(`back-references such as "\\${letter}" are not allowed ${where}`, start);
    }
    return this.#fail(`"\\${letter}" is not an escape regular expressions allow`, start);
  }

  /** A category escape, after its `\p` or `\P`: `{`, a category or `Is` and a block name, then `}`. */
  #property(complement: boolean, start: number): string {
    if (this.#next() !== '{') this.#fail(`"\\${complement ? 'P' : 'p'}" must be followed by a name in braces`, start);
    let name = '';
    for (let char = this.#next(); char !== '}'; char = this.#next()) {
      if (char === undefined) this.#fail('the category escape has no "}" to close it', start);
      name += char;
    }
    if (isCategory(name)) return complement ? String.raw`\P{${name}}` : String.raw`\p{${name}}`;
    const block = name.startsWith('Is') ? name.slice('Is'.length) : '';
    if (!isBlockName(block)) return this.#fail(`"${name}" is neither a category nor "Is" and a block name`, start);
    return this.#blockEscape(block, complement, start);
  }

  /** A block escape such as `\p{IsBasicLatin}`, by the block's name, as the class of the block's ranges. */
  #blockEscape(block: string, complement: boolean, start: number): string {
    const ranges = blockRanges(block);
    if (ranges === undefined) {
      if (this.#xpath) this.#fail(`"${block}" is not the name of a Unicode block`, start);
      // XSD 1.1 lets a block name it does not know match every character.
      return complement ? '[]' : '[^]';
    }
    const items = ranges.map(([first, last]) => classRange(first, last)).join('');
    return complement ? `[^${items}]` : `[${items}]`;
  }

  /** A class expression, after its `[`: `^` to complement it, its parts, then any subtraction and the `]`. */
  #classExpression(): string {
    const start = this.#index - 1;
    this.#classDepth++;
    const complement = this.#chars[this.#index] === '^';
    if (complement) this.#index++;
    const parts: string[] = [];
    let subtracted: string | undefined;
    for (;;) {
      const char = this.#chars[this.#index];
      if (char === undefined) this.#fail('this class has no "]" to close it', start);
      if (char === ']') {
        if (parts.length === 0) this.#fail('a class must hold at least one character, range or escape', start);
        this.#index++;
        break;
      }
      if (char === '-' && this.#chars[this.#index + 1] === '[') {
        subtracted = this.#subtraction(parts.length, start);
        break;
      }
      parts.push(this.#classPart());
    }
    this.#classDepth--;
    const union = complement ? `[^${parts.join('')}]` : `[${parts.join('')}]`;
    return subtracted === undefined ? union : `[${union}--${subtracted}]`;
  }

  /** A subtraction, at its `-[`: the class subtracted, which must end the enclosing class. */
  #subtraction(partCount: number, start: number): string {
    if (partCount === 0) this.#fail('a class must hold something before "-[" subtracts from it', start);
    this.#index += '-['.length;
    const subtracted = this.#classExpression();
    if (this.#chars[this.#index] !== ']') this.#fail('a subtraction "-[...]" must end its class', start);
    this.#index++;
    return subtracted;
  }

  /**
   * A class part: a character, an escape such as `\d`, or a range such as `a-z` when a character
   * and a hyphen are followed by another character (XSD 1.1 Part 2 §G.4), so `[a-c-e]` holds a
   * range, a hyphen and `e`.
   */
  #classPart(): string {
    const start = this.#index;
    const part = this.#classAtom();
    if (part.char === undefined || this.#chars[this.#index] !== '-') return part.source;
    // A hyphen before `]` or `-[` is a character of its own, not the middle of a range.
    const after = this.#chars[this.#index + 1];
    if (after === ']' || after === '[' || after === undefined) return part.source;
    this.#index++;
    const last = this.#classAtom().char;
    if (last === undefined) return this.#fail('a range must end with a character, not a multi-character escape', start);
    if (last < part.char) this.#fail('this range ends before it starts', start);
    return this.#literalRange(part.char, last);
  }

  /** A class character or escape, which may then start a range; an unescaped `-` is a character like any other. */
  #classAtom(): ClassPart {
    const start = this.#index;
    const char = this.#chars[this.#index++] as string;
    if (char === '[') return this.#fail(String.raw`"[" must be escaped as "\[" inside a class`, start);
    if (char !== '\\') {
      const codePoint = char.codePointAt(0) as number;
      return { source: this.#classLiteral(codePoint), char: codePoint };
    }
    const letter = this.#chars[this.#index++];
    if (letter === undefined) return this.#fail(UNFINISHED_ESCAPE, start);
    const escaped = this.#singleCharEscape(letter);
    if (escaped !== undefined) return { source: this.#classLiteral(escaped), char: escaped };
    return { source: this.#setEscape(letter, start) };
  }

  /** A character outside a class, with its case variants under the `i` flag. */
  #literal(codePoint: number): string {
    const hasVariants = this.#options.caseInsensitive && caseVariants(codePoint).length > 0;
    return hasVariants ? `[${this.#classLiteral(codePoint)}]` : patternChar(codePoint);
  }

  /** A character inside a class, with its case variants under the `i` flag. */
  #classLiteral(codePoint: number): string {
    return classChar(codePoint) + this.#variants(() => caseVariants(codePoint));
  }

  /** A range inside a class, with the case variants of its characters under the `i` flag. */
  #literalRange(first: number, last: number): string {
    return classRange(first, last) + this.#variants(() => caseVariantsInRange(first, last));
  }

  /** Class items for the case variants a lookup gives under the `i` flag, and none without it. */
  #variants(lookup: () => readonly number[]): string {
    if (!this.#options.caseInsensitive) return '';
    return lookup()
      .map((variant) => classChar(variant))
      .join('');
  }

  /** The character at the cursor, past whitespace the `x` flag ignores outside classes; undefined at the end. */
  #peek(): string | undefined {
    if (this.#options.ignoreWhitespace && this.#classDepth === 0) {
      while (IGNORABLE_WHITESPACE.has(this.#chars[this.#index] as string)) this.#index++;
    }
    return this.#chars[this.#index];
  }

  /** The character at the cursor, as `#peek` finds it, and moves past it. */
  #next(): string | undefined {
    const char = this.#peek();
    if (char !== undefined) this.#index++;
    return char;
  }

  /** Throws the error for a pattern the dialect does not allow, at the character where the problem starts. */
  #fail(reason: string, index = this.#index): never {
    throw ErrorFactory.create(RegexError, 'invalid-pattern', reason, this.#pattern, index);
  }
}
