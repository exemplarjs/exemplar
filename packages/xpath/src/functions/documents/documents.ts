import { EMPTY_SEQUENCE, XdmDocumentBuilder, type XdmNode, type XdmValue } from '@exemplarjs/xdm';
import { AsyncReaderRequiredError, type ResolvedSource, type Source } from '@exemplarjs/xml';
import { startsWithDeclaration, WHITESPACE_CLASS } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode, XPathException } from '@/api/xpath-exception';
import { absoluteURI, parseUri } from '@/functions/core/uri-resolution';
import { booleanResult, optionalString } from '@/functions/core/values';
import { type FunctionDefinition, pausing, reading } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { after, attempt, type Pausable } from '@/runtime/pausing';
import { isEvaluationSignal } from '@/runtime/resources';

/** The builder for evaluations whose resources name none, made on first use. */
let defaultBuilder: XdmDocumentBuilder | undefined;

/** The builder an evaluation reads documents with: the one its resources name, or the default. */
function builderOf(context: DynamicContext): XdmDocumentBuilder {
  return context.environment.resources.settings.builder ?? (defaultBuilder ??= new XdmDocumentBuilder());
}

/** The reason an error gives, for the message of the error it becomes. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Raises an error reading met as an XPath error with a code, but for the evaluation's own signals and XPath errors, passed on. */
function readError(code: string, describe: string, error: unknown): never {
  if (isEvaluationSignal(error) || error instanceof XPathException) throw error;
  return dynamicError(code, `${describe}: ${reasonOf(error)}`);
}

/** Runs a step of reading, raising any error it throws or its promise rejects with as an XPath error with a code, but for the evaluation's own signals. */
export function readingAs<Value>(code: string, describe: string, read: () => Value): Value {
  return attempt(
    read,
    (value) => value,
    (error) => readError(code, describe, error)
  ) as Value;
}

/** A document parsed at once, or a promise of it parsed asynchronously when its DTDs or entities come from resolvers that answer with one. */
function parsedAtOnceOrLater(builder: XdmDocumentBuilder, input: Source): Pausable<XdmNode> {
  try {
    return builder.parse(input);
  } catch (error) {
    if (error instanceof AsyncReaderRequiredError) return builder.parseAsync(input);
    throw error;
  }
}

/** What the URI resolver supplies for an absolute URI; the code given when it cannot be read or no resolver supplies it. */
export function sourceAt(uri: string, code: string, context: DynamicContext): Pausable<ResolvedSource> {
  const resources = context.environment.resources;
  return after(
    readingAs(code, `${uri} cannot be read`, () => resources.source(uri)),
    (source) => source ?? dynamicError(code, `No resolver supplies ${uri}`)
  );
}

/** A URI made absolute against the static base URI; the invalid code for one that is not a URI, FODC0002 for a relative one with no base. */
export function resourceURI(href: string, context: DynamicContext, invalidCode: string): string {
  const uri = absoluteURI(href, context.environment.staticContext.baseURI);
  if (uri !== undefined) return uri;
  if (parseUri(href) === undefined) return dynamicError(invalidCode, `"${href}" is not a valid URI`);
  return dynamicError(
    XPathErrorCode.RESOURCE_NOT_READ,
    `"${href}" is relative, and there is no static base URI to resolve it against`
  );
}

/** Reads the document an absolute URI names: a preloaded one, or one the URI resolver supplies, parsed at once or, when it must wait, later. */
function readDocument(uri: string, context: DynamicContext): Pausable<XdmNode> {
  const preloaded = context.environment.resources.settings.documents?.get(uri);
  if (preloaded !== undefined) return preloaded;
  return after(sourceAt(uri, XPathErrorCode.RESOURCE_NOT_READ, context), (source) => {
    // The document takes the URI asked for, and its base URI is where it was read from.
    const readFrom = source.systemId;
    const moved = readFrom !== undefined && readFrom !== uri;
    const read = moved ? { baseURI: readFrom } : {};
    const input = { ...source, systemId: uri, ...read };
    return readingAs(XPathErrorCode.RESOURCE_NOT_READ, `${uri} is not a well-formed document`, () =>
      parsedAtOnceOrLater(builderOf(context), input)
    );
  });
}

/** The document a URI names, read once in an evaluation, so that every call with it gives the same document. */
export function documentAt(href: string, context: DynamicContext): Pausable<XdmNode> {
  const uri = resourceURI(href, context, XPathErrorCode.INVALID_DOCUMENT_URI);
  return context.environment.resources.answer(`document ${uri}`, () => readDocument(uri, context));
}

/** Whether a read succeeds rather than raising an XPath error, as a value; any other error is raised. */
export function isAvailable(read: () => Pausable<unknown>): Pausable<XdmValue> {
  return attempt(
    read,
    () => booleanResult(true),
    (error) => {
      if (error instanceof XPathException) return booleanResult(false);
      throw error;
    }
  );
}

/** A pseudo-attribute's equals sign with any whitespace around it. */
const EQUALS = `${WHITESPACE_CLASS}*=${WHITESPACE_CLASS}*`;

/** A text declaration, which an external parsed entity may begin with: an optional version, then an encoding. */
const TEXT_DECLARATION = new RegExp(
  String.raw`^<\?xml(?:${WHITESPACE_CLASS}+version${EQUALS}(["'])1\.\d+\1)?${WHITESPACE_CLASS}+encoding${EQUALS}` +
    String.raw`(["'])[A-Za-z][\w.-]*\2${WHITESPACE_CLASS}*\?>`
);

/** A fragment's content without its text declaration; FODC0006 when it begins with a declaration that is not one. */
function withoutTextDeclaration(text: string): string {
  if (!startsWithDeclaration(text)) return text;
  const declaration = TEXT_DECLARATION.exec(text);
  if (declaration === null)
    return dynamicError(
      XPathErrorCode.NOT_WELL_FORMED,
      'The fragment begins with an XML declaration that is not a text declaration'
    );
  return text.slice(declaration[0].length);
}

/** A string parsed as XML by a builder's step, the document's base URI the static base URI; FODC0006 when it is not well-formed. */
function parsedString(
  value: XdmValue | undefined,
  context: DynamicContext,
  parse: (text: string, builder: XdmDocumentBuilder, baseURI: string | undefined) => Pausable<XdmNode>
): Pausable<XdmValue> {
  const text = optionalString(value);
  if (text === undefined) return EMPTY_SEQUENCE;
  const baseURI = context.environment.staticContext.baseURI;
  const parsed = readingAs(XPathErrorCode.NOT_WELL_FORMED, 'The string is not well-formed XML', () =>
    parse(text, builderOf(context), baseURI)
  );
  return after(context.environment.resources.waitFor(parsed), (document) => [document]);
}

/** `fn:doc` and `fn:doc-available` (F&O §14.6), and `fn:parse-xml` and `fn:parse-xml-fragment` (§14.8). */
export const DOCUMENT_FUNCTIONS: readonly FunctionDefinition[] = [
  reading(
    defineFunction('fn:doc($uri as xs:string?) as document-node()?', ([uri], context) => {
      const href = optionalString(uri);
      return href === undefined ? EMPTY_SEQUENCE : after(documentAt(href, context), (document) => [document]);
    })
  ),
  reading(
    defineFunction('fn:doc-available($uri as xs:string?) as xs:boolean', ([uri], context) => {
      const href = optionalString(uri);
      return href === undefined ? booleanResult(false) : isAvailable(() => documentAt(href, context));
    })
  ),
  pausing(
    defineFunction('fn:parse-xml($arg as xs:string?) as document-node(element(*))?', ([text], context) =>
      parsedString(text, context, (xml, builder, baseURI) =>
        parsedAtOnceOrLater(builder, baseURI === undefined ? xml : { text: xml, baseURI })
      )
    )
  ),
  defineFunction('fn:parse-xml-fragment($arg as xs:string?) as document-node()?', ([text], context) =>
    parsedString(text, context, (xml, builder, baseURI) => builder.parseFragment(withoutTextDeclaration(xml), baseURI))
  ),
];
