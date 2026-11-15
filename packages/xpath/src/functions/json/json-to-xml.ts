import {
  AttributeFlag,
  EMPTY_SEQUENCE,
  NameTable,
  TreeBuilder,
  type XdmMap,
  XdmNode,
  type XdmValue,
} from '@exemplarjs/xdm';
import { ROOT_NODE } from '@exemplarjs/xdm/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { optionalString } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { booleanOption, choiceOption, defineWithOptions } from '@/functions/options';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { FN_NAMESPACE } from '@/static/static-context';
import { readJson } from './json-options.ts';
import type { JsonEntry, JsonValue } from './json-parser.ts';

/** The names of the XML representation of JSON, shared by every tree it makes. */
const JSON_NAMES = new NameTable();

/** The values of `json-to-xml`'s `duplicates` option. */
const DUPLICATE_CHOICES = ['reject', 'use-first', 'retain'] as const;

/** How the XML representation is written: the duplicates rule, and whether strings may hold escapes. */
interface XmlWriting {
  readonly builder: TreeBuilder;
  readonly duplicates: (typeof DUPLICATE_CHOICES)[number];
  readonly escaped: boolean;
}

/** Adds an attribute in no namespace. */
function addAttribute(writing: XmlWriting, name: string, value: string): void {
  writing.builder.attribute(writing.builder.names.code(name, ''), value, AttributeFlag.NONE);
}

/** An object's members, as the duplicates rule keeps them: all, the first of each key, or FOJS0003 for any key twice. */
function keptEntries(entries: readonly JsonEntry[], writing: XmlWriting): readonly JsonEntry[] {
  if (writing.duplicates === 'retain') return entries;
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!seen.has(entry.key)) {
      seen.add(entry.key);
      return true;
    }
    if (writing.duplicates === 'reject')
      dynamicError(XPathErrorCode.DUPLICATE_JSON_KEY, `The JSON object gives the key "${entry.key}" twice`);
    return false;
  });
}

/**
 * Writes one JSON value as an element of the XML representation (F&O §17.5.2), with its key when
 * it is in an object; the outermost element declares the namespace.
 */
function writeValue(value: JsonValue, key: string | undefined, writing: XmlWriting): void {
  const builder = writing.builder;
  const outermost = builder.current === ROOT_NODE;
  builder.startElement(builder.names.code(elementName(value), FN_NAMESPACE));
  if (outermost) builder.namespace('', FN_NAMESPACE);
  if (key !== undefined) {
    addAttribute(writing, 'key', key);
    if (writing.escaped && key.includes('\\')) addAttribute(writing, 'escaped-key', 'true');
  }
  writeContent(value, writing);
  builder.endElement();
}

/** The local name of the element a JSON value is written as. */
function elementName(value: JsonValue): string {
  return value.kind === 'object' ? 'map' : value.kind;
}

/** Writes what is inside a value's element: members, or text, none for null. */
function writeContent(value: JsonValue, writing: XmlWriting): void {
  if (value.kind === 'object') {
    for (const entry of keptEntries(value.entries, writing)) writeValue(entry.value, entry.key, writing);
  } else if (value.kind === 'array') {
    for (const member of value.members) writeValue(member, undefined, writing);
  } else if (value.kind === 'string') {
    if (writing.escaped && value.text.includes('\\')) addAttribute(writing, 'escaped', 'true');
    writing.builder.text(value.text);
  } else if (value.kind !== 'null') {
    writing.builder.text(value.kind === 'boolean' ? String(value.value) : value.text);
  }
}

/** `fn:json-to-xml`, with and without options: JSON text as a document holding its XML representation, with the static base URI; the empty sequence for none. */
function jsonToXml(text: string | undefined, options: XdmMap, context: DynamicContext): XdmValue {
  if (text === undefined) return EMPTY_SEQUENCE;
  const duplicates = choiceOption(options, 'duplicates', DUPLICATE_CHOICES, 'retain');
  if (booleanOption(options, 'validate', false))
    return dynamicError(
      XPathErrorCode.JSON_VALIDATION_UNSUPPORTED,
      'Validating the XML representation of JSON needs a schema'
    );
  const escaped = booleanOption(options, 'escape', false);
  const json = readJson(text, options);
  // The tree starts at its least and grows as needed, as nodes per character of JSON vary widely.
  const builder = new TreeBuilder({ names: JSON_NAMES, expectedNodes: 0 });
  builder.startDocument(null);
  const baseURI = context.environment.staticContext.baseURI;
  if (baseURI !== undefined) builder.setBaseURI(ROOT_NODE, baseURI);
  writeValue(json, undefined, { builder, duplicates, escaped });
  builder.endDocument();
  return [XdmNode.of(builder.finish(), ROOT_NODE)];
}

export const JSON_TO_XML_FUNCTIONS: readonly FunctionDefinition[] = defineWithOptions(
  'fn:json-to-xml($json-text as xs:string?) as document-node()?',
  ([text], options, context) => jsonToXml(optionalString(text), options, context)
);
