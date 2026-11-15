import type { CollectionMember, CollectionResolver } from '@/api/evaluation-options';

/**
 * A collection resolver over fixed lists of members by absolute URI, each a URI to read as `fn:doc`
 * reads it or an item; the default collection is the one `defaultURI` names, if any.
 *
 * @example
 * const collectionResolver = collectionMap({ 'urn:books': ['https://example.org/a.xml', 'https://example.org/b.xml'] });
 */
export function collectionMap(
  collections: Readonly<Record<string, readonly CollectionMember[]>>,
  defaultURI?: string
): CollectionResolver {
  const byURI = new Map(Object.entries(collections));
  return {
    resolveCollection: (uri) => {
      const named = uri ?? defaultURI;
      return named === undefined ? undefined : byURI.get(named);
    },
  };
}
