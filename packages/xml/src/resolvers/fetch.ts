import { resolveURI } from '@/util/uri';
import {
  checkAccess,
  type EntityResolver,
  type ResolvedSource,
  type ResolveRequest,
  type URIResolver,
} from './resolver.ts';

/** Settings for `fetchResolver`. */
export interface FetchResolverOptions {
  /** The `fetch` to use; the global one by default. */
  readonly fetch?: typeof fetch;
}

/** What a fetch is asked with: the access list and the headers XInclude passes. */
type FetchRequest = Pick<ResolveRequest, 'access' | 'accept' | 'acceptLanguage'>;

/** Reads `http:` and `https:` entities, DTDs and other resources with `fetch`, as the access list allows; only asynchronous readers can use it. */
export function fetchResolver(options: FetchResolverOptions = {}): EntityResolver & URIResolver {
  const get = options.fetch ?? fetch;
  /** The resource an absolute URI names, fetched, or undefined. */
  const read = async (request: FetchRequest, uri: string | undefined): Promise<ResolvedSource | undefined> => {
    if (uri === undefined || !/^https?:/i.test(uri)) return;
    checkAccess(request, uri);
    // XInclude's accept and accept-language become the request's headers.
    const { accept, acceptLanguage } = request;
    const headers = {
      ...(accept !== undefined && { Accept: accept }),
      ...(acceptLanguage !== undefined && { 'Accept-Language': acceptLanguage }),
    };
    const response = await get(uri, { headers });
    if (!response.ok) return;
    // An HTTP charset, quoted or not, is an encoding supplied from outside (RFC 7303).
    const charset = /charset=\s*"?([^";]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]?.trim();
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { systemId: response.url || uri, bytes, ...(charset !== undefined && { encoding: charset }) };
  };
  return {
    resolveEntity: (request) => read(request, resolveURI(request.systemId, request.baseURI)),
    resolve: (href, base, request = {}) => read(request, resolveURI(href, base)),
  };
}
