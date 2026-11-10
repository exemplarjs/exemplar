import type { XdmDocumentBuilder, XdmItem, XdmNode } from '@exemplarjs/xdm';
import type { URIResolver } from '@exemplarjs/xml';

/** The clock and timezone an evaluation runs with, which the date and time functions and comparisons read. */
export interface TemporalSettings {
  /** The current date and time, fixed for the whole evaluation; the moment the call starts by default. */
  readonly currentDateTime?: Date;
  /**
   * The timezone a date or time without one is taken to be in, and the one `current-dateTime()`
   * reports: minutes east of UTC, or an offset such as `'+01:00'`; the machine's offset by default.
   */
  readonly implicitTimezone?: number | string;
}

/** A member of a collection: a URI, read through the URI resolver as `doc` reads it, or an item given as it is. */
export type CollectionMember = string | XdmItem;

/** What a collection resolver answers: the members, undefined when it knows no such collection, or a promise of either. */
export type CollectionResolution =
  | readonly CollectionMember[]
  | undefined
  | Promise<readonly CollectionMember[] | undefined>;

/** Supplies the collections `fn:collection` and `fn:uri-collection` read, by absolute URI. */
export interface CollectionResolver {
  /** The members of the collection a URI names, or of the default collection when the URI is undefined. */
  resolveCollection(uri: string | undefined): CollectionResolution;
}

/**
 * Where an evaluation reads documents, text and collections from: `fn:doc`, `fn:unparsed-text`,
 * `fn:json-doc`, `fn:collection` and their kin. Nothing is read without a resolver: a URI that no
 * resolver or preloaded document supplies raises the function's error.
 *
 * A resolver that answers with a promise, such as `fetchResolver`, needs `evaluateAsync`, which
 * waits for it; `evaluate` raises a `TypeError` instead. Within one evaluation a URI always gives
 * the same document or text, read once.
 *
 * @example
 * executable.evaluate(null, { resources: { uriResolver: fileResolver({ root: '/data' }) } });
 */
export interface ResourceSettings {
  /** Supplies documents and text by absolute URI, such as `fileResolver` or `fetchResolver` from `@exemplarjs/xml`. */
  readonly uriResolver?: URIResolver;
  readonly collectionResolver?: CollectionResolver;
  /** Documents known in advance, by absolute URI, which `fn:doc` gives without asking the resolver. */
  readonly documents?: ReadonlyMap<string, XdmNode>;
  /** Builds the documents read, with its factory's settings; a new `XdmDocumentBuilder` by default. */
  readonly builder?: XdmDocumentBuilder;
}

/**
 * What one evaluation may set beyond the context item and the variables, the rest of XPath's
 * dynamic context. A call gives it in one object with the variables.
 *
 * @example
 * executable.evaluate(doc, { variables: { min: 10 }, temporal: { implicitTimezone: '+01:00' } });
 */
export interface EvaluationOptions {
  readonly temporal?: TemporalSettings;
  readonly resources?: ResourceSettings;
}
