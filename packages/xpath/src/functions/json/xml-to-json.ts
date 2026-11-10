import {
  type AtomicType,
  EMPTY_SEQUENCE,
  NodeKind,
  XdmAtomicValue,
  type XdmMap,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { tryCastAs } from '@exemplarjs/xdm/internal';
import { isAllWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { stringValueOf } from '@/functions/core/strings';
import { onlyItem, stringResult } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { booleanOption, defineWithOptions } from '@/functions/options';
import { FN_NAMESPACE } from '@/static/static-context';
import {
  ESCAPE_BODY,
  ESCAPED_CHARACTERS,
  escapeCharacter,
  joinedJSON,
  type Layout,
  quotedJSON,
} from './json-strings.ts';

/** In a string that holds escapes already: each escape, kept as it is, a backslash that starts none, and the quotes, solidi and controls beside them. */
const ESCAPE_OR_NEEDS_ESCAPE = new RegExp(String.raw`\\${ESCAPE_BODY}?|[${ESCAPED_CHARACTERS}]`, 'g');

/** The element names of the XML representation of JSON. */
const JSON_ELEMENTS = new Set(['map', 'array', 'string', 'number', 'boolean', 'null']);

/** Raises FOJS0006 for a document that is not the XML representation of JSON. */
function invalid(message: string): never {
  return dynamicError(XPathErrorCode.INVALID_JSON_XML, message);
}

/** Text as a JSON string; when it is marked as escaped, its escapes are kept, and must be valid (FOJS0007). */
function jsonString(text: string, escaped: boolean): string {
  if (!escaped) return quotedJSON(text);
  const kept = text.replaceAll(ESCAPE_OR_NEEDS_ESCAPE, (found) => {
    if (found === '\\')
      dynamicError(XPathErrorCode.INVALID_JSON_ESCAPE, `${JSON.stringify(text)} holds an escape that is not one`);
    return found.length > 1 ? found : escapeCharacter(found);
  });
  return `"${kept}"`;
}

/** Text cast to a type; FOJS0006, naming what the text is, when it is not a value of the type. */
function castText(text: string, type: AtomicType, what: string): XdmAtomicValue {
  return (
    tryCastAs(XdmAtomicValue.string(text), type) ?? invalid(`${what} must be an ${type.toString()}, not "${text}"`)
  );
}

/** The value of an `escaped` or `escaped-key` attribute: a boolean, false when absent; FOJS0006 for any other value. */
function flagAttribute(element: XdmNode, name: string): boolean {
  const attribute = element.attribute(name);
  return attribute !== undefined && castText(attribute, XS.boolean, `The attribute ${name}`).value === true;
}

/** Where an element of the representation is: a member of a map or an array, or the outermost, whose key is ignored. */
type Place = 'in a map' | 'in an array' | 'outermost';

/** Raises FOJS0006 for an attribute in no namespace the representation does not have there: `key` and `escaped-key` but in an array, `escaped` on strings. */
function checkAttributes(element: XdmNode, place: Place): void {
  for (const attribute of element.attributes()) {
    if (attribute.namespaceURI !== '') continue;
    const name = attribute.localName;
    const isKey = name === 'key' || name === 'escaped-key';
    const allowed = (isKey && place !== 'in an array') || (name === 'escaped' && element.localName === 'string');
    if (!allowed) invalid(`The attribute ${name} is not allowed on ${element.localName}`);
  }
}

/** An element's child elements, with only whitespace, comments and processing instructions beside them; FOJS0006 otherwise. */
function childElements(element: XdmNode): XdmNode[] {
  const children = element.children();
  if (children.some((child) => child.kind === NodeKind.TEXT && !isAllWhitespace(child.stringValue)))
    invalid(`A ${element.localName} element cannot hold text`);
  return children.filter((child) => child.kind === NodeKind.ELEMENT);
}

/** Raises FOJS0006 when an element that holds a value has element children. */
function checkNoElements(element: XdmNode): void {
  if (element.children().some((child) => child.kind === NodeKind.ELEMENT))
    invalid(`A ${element.localName} element cannot hold elements`);
}

/** A `map` element as a JSON object; FOJS0006 for a member without a key or a key given twice. */
function objectOf(element: XdmNode, layout: Layout, nested: Layout): string {
  const keys = new Set<string>();
  const members = childElements(element).map((child) => {
    const key = child.attribute('key');
    if (key === undefined) return invalid('Each member of a map must have a key');
    const written = jsonString(key, flagAttribute(child, 'escaped-key'));
    const unescaped = JSON.parse(written) as string;
    if (keys.has(unescaped)) invalid(`The map gives the key "${key}" twice`);
    keys.add(unescaped);
    return `${written}:${layout.indent ? ' ' : ''}${valueOf(child, nested, 'in a map')}`;
  });
  return joinedJSON(members, '{', '}', layout);
}

/** One element of the XML representation as JSON text. */
function valueOf(element: XdmNode, layout: Layout, place: Place): string {
  if (element.namespaceURI !== FN_NAMESPACE || !JSON_ELEMENTS.has(element.localName))
    return invalid(`${String(element.nodeName)} is not an element of the XML representation of JSON`);
  checkAttributes(element, place);
  const nested = { indent: layout.indent, depth: layout.depth + 1 };
  if (element.localName !== 'map' && element.localName !== 'array') checkNoElements(element);
  switch (element.localName) {
    case 'map': {
      return objectOf(element, layout, nested);
    }
    case 'array': {
      return joinedJSON(
        childElements(element).map((child) => valueOf(child, nested, 'in an array')),
        '[',
        ']',
        layout
      );
    }
    case 'string': {
      return jsonString(element.stringValue, flagAttribute(element, 'escaped'));
    }
    case 'null': {
      if (!isAllWhitespace(element.stringValue)) return invalid('A null element must be empty');
      return 'null';
    }
    default: {
      return atomicText(element, element.localName === 'number' ? XS.double : XS.boolean);
    }
  }
}

/** A `number` or `boolean` element's value, as its type writes it; FOJS0006 when it is not one, or for a number JSON cannot write, such as NaN. */
function atomicText(element: XdmNode, type: AtomicType): string {
  const value = castText(element.stringValue, type, `A ${element.localName} element`);
  if (typeof value.value === 'number' && !Number.isFinite(value.value))
    return invalid(`JSON has no number ${element.stringValue}`);
  return stringValueOf(value);
}

/** `fn:xml-to-json`, with and without options: a document or element in the XML representation of JSON as JSON text; the empty sequence for none. */
function xmlToJson(input: XdmValue, options: XdmMap): XdmValue {
  if (input.length === 0) return EMPTY_SEQUENCE;
  const node = onlyItem<XdmNode>(input);
  const layout = { indent: booleanOption(options, 'indent', false), depth: 0 };
  if (node.kind === NodeKind.ELEMENT) return stringResult(valueOf(node, layout, 'outermost'));
  if (node.kind !== NodeKind.DOCUMENT) return invalid('Only a document or an element can be turned into JSON');
  const elements = childElements(node);
  if (elements.length !== 1) return invalid('The document must have one element');
  return stringResult(valueOf(elements[0] as XdmNode, layout, 'outermost'));
}

export const XML_TO_JSON_FUNCTIONS: readonly FunctionDefinition[] = defineWithOptions(
  'fn:xml-to-json($input as node()?) as xs:string?',
  ([input = []], options) => xmlToJson(input, options)
);
