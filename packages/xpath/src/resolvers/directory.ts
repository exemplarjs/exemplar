/// <reference types="node" />
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { byCodePoint } from '@exemplarjs/xml/internal';
import type { CollectionResolver } from '@/api/evaluation-options';

/** Settings for `directoryCollections`. */
export interface DirectoryCollectionsOptions {
  /** The directory below which directories can be collections; nothing outside it is listed. */
  readonly root: string;
  /**
   * Which files a collection holds, by name: a pattern where `*` stands for any characters, `?` for
   * one, and `(a|b)` for either, such as `*.xml` or `*.(xml|xhtml)`. Every file by default.
   */
  readonly select?: string;
}

/** The characters of a pattern that a regular expression takes literally only when escaped. */
const LITERAL_IN_PATTERN = /[.+^${}[\]\\]/g;

/** A test of file names for a pattern, in which `*` is any characters, `?` any one, and `(a|b)` either. */
function nameTest(pattern: string): RegExp {
  const source = pattern
    .replaceAll(LITERAL_IN_PATTERN, String.raw`\$&`)
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return new RegExp(`^(?:${source})$`, 'u');
}

/**
 * A collection resolver that takes the `file:` URI of a directory below a root as the collection of
 * the files in it, in name order, for Node and Bun; reading them takes a URI resolver that
 * reads files, such as `fileResolver`. It knows no default collection. A URI can choose the files
 * itself, as in `collection('file:///data/books/?select=*.xml')`, which the `select` option
 * otherwise does.
 *
 * @example
 * const resources = { collectionResolver: directoryCollections({ root }), uriResolver: fileResolver({ root }) };
 * compiler.compile('count(collection("file:///data/books/"))').evaluateNumber(null, { resources });
 */
export function directoryCollections(options: DirectoryCollectionsOptions): CollectionResolver {
  const root = path.resolve(options.root);
  return {
    resolveCollection(uri): string[] | undefined {
      if (!uri?.startsWith('file:')) return;
      let directory: string;
      let select: string | undefined;
      try {
        const address = new URL(uri);
        select = address.searchParams.get('select') ?? options.select;
        address.search = '';
        directory = path.resolve(fileURLToPath(address));
      } catch {
        // A URI that is malformed, or has an escape that is not UTF-8, names no directory.
        return;
      }
      const relative = path.relative(root, directory);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
      try {
        const selected = select === undefined ? undefined : nameTest(select);
        const files = readdirSync(directory, { withFileTypes: true }).filter(
          (entry) => entry.isFile() && (selected === undefined || selected.test(entry.name))
        );
        return files.map((entry) => pathToFileURL(path.join(directory, entry.name)).href).toSorted(byCodePoint);
      } catch {
        return;
      }
    },
  };
}
