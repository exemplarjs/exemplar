import { AttributeFlag, NameTable, TreeBuilder, XdmNode, type XdmValue } from '@exemplarjs/xdm';
import { ROOT_NODE } from '@exemplarjs/xdm/internal';
import type { TranslatedRegex } from '@exemplarjs/xml/internal';
import type { FunctionDefinition } from '@/functions/function-library';
import { FN_NAMESPACE } from '@/static/static-context';
import { defineWithFlags, segments } from './compiled-regex.ts';

/** A group that took part in a match: its number and the span it matched. */
interface MatchedGroup {
  readonly number: number;
  readonly start: number;
  readonly end: number;
  readonly children: MatchedGroup[];
}

/**
 * The groups of a match nested as the pattern nests them. Groups that matched nothing are left
 * out; a group that matched sits in groups that all matched too.
 */
function nestedGroups(match: RegExpExecArray, parents: readonly number[]): MatchedGroup[] {
  const top: MatchedGroup[] = [];
  const made = new Map<number, MatchedGroup>();
  for (let number = 1; number < parents.length; number++) {
    const span = match.indices?.[number];
    if (span === undefined) continue;
    const parent = parents[number] as number;
    const group: MatchedGroup = { number, start: span[0], end: span[1], children: [] };
    (made.get(parent)?.children ?? top).push(group);
    made.set(number, group);
  }
  return top;
}

/** The names of the result vocabulary, shared by every result tree. */
const RESULT_NAMES = new NameTable();

/** Writes the analyze-string result elements, all in the `fn` namespace. */
class ResultWriter {
  // Results are mostly small: the tree starts at its least and grows as needed.
  readonly builder = new TreeBuilder({ names: RESULT_NAMES, expectedNodes: 0 });
  readonly #names = this.builder.names;

  /** Starts an element of the result vocabulary. */
  start(localName: string): void {
    this.builder.startElement(this.#names.code(`fn:${localName}`, FN_NAMESPACE));
  }

  /** A stretch of the input, with the groups within it as `fn:group` elements. */
  content(input: string, start: number, end: number, groups: readonly MatchedGroup[]): void {
    let from = start;
    for (const group of groups) {
      this.builder.text(input.slice(from, group.start));
      this.start('group');
      this.builder.attribute(this.#names.code('nr', ''), String(group.number), AttributeFlag.NONE);
      this.content(input, group.start, group.end, group.children);
      this.builder.endElement();
      from = group.end;
    }
    this.builder.text(input.slice(from, end));
  }

  /** A `fn:non-match` element for a stretch of the input between matches, unless it is empty. */
  nonMatch(input: string, start: number, end: number): void {
    if (start >= end) return;
    this.start('non-match');
    this.builder.text(input.slice(start, end));
    this.builder.endElement();
  }
}

/**
 * `fn:analyze-string` (F&O §5.6.6): the input split into `fn:match` and `fn:non-match` elements,
 * the groups of each match as nested `fn:group` elements numbered by `nr`, all under one
 * `fn:analyze-string-result` element with no parent.
 */
function analyzeString(input: string, translated: TranslatedRegex): XdmValue {
  const writer = new ResultWriter();
  writer.start('analyze-string-result');
  writer.builder.namespace('fn', FN_NAMESPACE);
  for (const { from, match } of segments(translated, input)) {
    writer.nonMatch(input, from, match?.index ?? input.length);
    if (match === undefined) break;
    writer.start('match');
    writer.content(input, match.index, match.index + match[0].length, nestedGroups(match, translated.groupParents));
    writer.builder.endElement();
  }
  writer.builder.endElement();
  return [XdmNode.of(writer.builder.finish(), ROOT_NODE)];
}

/** `fn:analyze-string`, with and without flags. */
export const ANALYZE_STRING_FUNCTIONS: readonly FunctionDefinition[] = defineWithFlags(
  'fn:analyze-string($input as xs:string?, $pattern as xs:string) as element(fn:analyze-string-result)',
  'refused',
  ([input], regex) => analyzeString(input, regex)
);
