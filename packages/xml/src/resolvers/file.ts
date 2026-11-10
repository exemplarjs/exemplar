/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveURI } from '@/util/uri';
import {
  type AccessList,
  checkAccess,
  type EntityResolver,
  type ResolvedSource,
  type URIResolver,
} from './resolver.ts';

/** Settings for `fileResolver`. */
export interface FileResolverOptions {
  /** The directory the resolver reads below; nothing outside it is read. */
  readonly root: string;
}

/** Reads `file:` entities, DTDs and other resources below a root directory, as the access list allows, for Node, Deno and Bun. */
export function fileResolver(options: FileResolverOptions): EntityResolver & URIResolver {
  const root = path.resolve(options.root);
  /** The file a URI names below the root, read, or undefined. */
  const read = (request: { readonly access?: AccessList }, uri: string | undefined): ResolvedSource | undefined => {
    if (!uri?.startsWith('file:')) return;
    checkAccess(request, uri);
    let file: string;
    try {
      file = path.resolve(fileURLToPath(uri));
    } catch {
      // A URI with an escape that is not UTF-8 names no file.
      return;
    }
    const relative = path.relative(root, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
    try {
      return { systemId: pathToFileURL(file).href, bytes: readFileSync(file) };
    } catch {
      return;
    }
  };
  return {
    resolveEntity: (request) => read(request, resolveURI(request.systemId, request.baseURI)),
    resolve: (href, base, request = {}) => read(request, resolveURI(href, base)),
  };
}
