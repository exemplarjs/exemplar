import { mapCharacters } from '@exemplarjs/writer';
import type { XdmNode, XdmValue } from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { stringResult } from '@/functions/core/values';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineWithLast } from '@/functions/signatures';
import { adaptiveOutput } from './adaptive-output.ts';
import { jsonOutput } from './json-output.ts';
import { markupOutput } from './markup-output.ts';
import { normalizedSequence, type OutputPart } from './sequence-normalization.ts';
import {
  type OutputMethod,
  type SerializationParameters,
  serializationParameters,
} from './serialization-parameters.ts';
import { normalizedText, xmlOutput } from './xml-output.ts';

/** A normalized sequence written by the text method: its text and the string values of its nodes, joined. */
function textOutput(parts: readonly OutputPart[], parameters: SerializationParameters): string {
  const text = parts.map((part) => (typeof part === 'string' ? part : part.stringValue)).join('');
  return mapCharacters(normalizedText(text, parameters), parameters.characterMap);
}

/** How nodes inside JSON and adaptive output are written: by a method, with the XML declaration left out. */
function nodeWriter(parameters: SerializationParameters, method: OutputMethod): (node: XdmNode) => string {
  const inner = { ...parameters, omitXMLDeclaration: true };
  return (node) => serializeWith(normalizedSequence([node], undefined), method, inner);
}

/** A normalized sequence written by one of the methods that take one: XML or text; SEPM0016 for one not supported. */
function serializeWith(
  parts: readonly OutputPart[],
  method: OutputMethod,
  parameters: SerializationParameters
): string {
  if (method === 'xml') return xmlOutput(parts, parameters);
  if (method === 'text') return textOutput(parts, parameters);
  if (method === 'html' || method === 'xhtml') return markupOutput(parts, parameters, method);
  return dynamicError(XPathErrorCode.INVALID_SERIALIZATION_VALUE, `The ${method} output method is not supported here`);
}

/** A value serialized as the parameters ask. */
function serialized(value: XdmValue, parameters: SerializationParameters): string {
  const { method } = parameters;
  if (method === 'json') return jsonOutput(value, parameters, nodeWriter(parameters, parameters.jsonNodeOutputMethod));
  if (method === 'adaptive') return adaptiveOutput(value, parameters, nodeWriter(parameters, 'xml'));
  return serializeWith(normalizedSequence(value, parameters.itemSeparator), method, parameters);
}

/** `fn:serialize` (F&O §14.4), with and without parameters: a value as the string a serializer writes for it. */
export const SERIALIZE_FUNCTIONS: readonly FunctionDefinition[] = defineWithLast(
  'fn:serialize($arg as item()*) as xs:string',
  '$params as item()?',
  ([value = []], params) => stringResult(serialized(value, serializationParameters(params)))
);
