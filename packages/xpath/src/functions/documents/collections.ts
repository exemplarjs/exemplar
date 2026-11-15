import { isNode, type XdmItem, type XdmValue } from '@exemplarjs/xdm';
import type { CollectionMember } from '@/api/evaluation-options';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { absoluteURI } from '@/functions/core/uri-resolution';
import { anyURIResult, optionalString } from '@/functions/core/values';
import { type FunctionDefinition, pausing } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import type { DynamicContext } from '@/runtime/dynamic-context';
import { after, type Pausable } from '@/runtime/pausing';
import { documentAt, readingAs, resourceURI } from './documents.ts';

/** A collection's URI made absolute against the static base URI, undefined for the default; FODC0004 when it is not valid. */
function collectionURI(href: string | undefined, context: DynamicContext): string | undefined {
  return href === undefined ? undefined : resourceURI(href, context, XPathErrorCode.INVALID_COLLECTION_URI);
}

/** The members of a collection, its URIs made absolute against its own, or the static base URI's for the default; FODC0002 when no resolver knows it. */
function membersOf(href: string | undefined, context: DynamicContext): Pausable<CollectionMember[]> {
  const uri = collectionURI(href, context);
  const named = uri ?? 'the default collection';
  const resources = context.environment.resources;
  const members = readingAs(XPathErrorCode.RESOURCE_NOT_READ, `${named} cannot be read`, () =>
    resources.collection(uri)
  );
  return after(members, (found) => {
    if (found === undefined)
      return dynamicError(XPathErrorCode.RESOURCE_NOT_READ, `No collection resolver supplies ${named}`);
    const base = uri ?? context.environment.staticContext.baseURI;
    return found.map((member) => {
      if (typeof member !== 'string') return member;
      return absoluteURI(member, base) ?? member;
    });
  });
}

/** The URI a member gives `uri-collection`: its own, or a document's URI; undefined for an item without one. */
function memberURI(member: CollectionMember): string | undefined {
  if (typeof member === 'string') return member;
  if (!isNode(member)) return undefined;
  return member.documentURI ?? undefined;
}

/** `fn:collection` and `fn:uri-collection` (F&O §14.6), with and without a URI: the default collection without one. */
export const COLLECTION_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:collection() as item()*', (_, context) => collectionItems(undefined, context)),
  defineFunction('fn:collection($arg as xs:string?) as item()*', ([href], context) =>
    collectionItems(optionalString(href), context)
  ),
  defineFunction('fn:uri-collection() as xs:anyURI*', (_, context) => collectionURIs(undefined, context)),
  defineFunction('fn:uri-collection($arg as xs:string?) as xs:anyURI*', ([href], context) =>
    collectionURIs(optionalString(href), context)
  ),
].map((definition) => pausing(definition));

/** A collection's items: each URI member read as `fn:doc` reads it, each item member as it is. */
function collectionItems(href: string | undefined, context: DynamicContext): Pausable<XdmItem[]> {
  return after(membersOf(href, context), (members) => {
    const items = members.map((member) => (typeof member === 'string' ? documentAt(member, context) : member));
    // The documents are asked for together, so that they arrive together.
    if (!items.some((item) => item instanceof Promise)) return items as XdmItem[];
    return Promise.all(items.map(async (item) => item));
  });
}

/** A collection's URIs, as `fn:uri-collection` gives them. */
function collectionURIs(href: string | undefined, context: DynamicContext): Pausable<XdmValue> {
  return after(membersOf(href, context), (members) =>
    members.flatMap((member) => {
      const uri = memberURI(member);
      return uri === undefined ? [] : anyURIResult(uri);
    })
  );
}
