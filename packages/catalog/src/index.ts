import { InvalidArgumentError } from '@exemplarjs/xml';
/** @exemplarjs/catalog: OASIS XML Catalogs 1.1. */
import type { CatalogResolution } from '@exemplarjs/xml';
import { ErrorFactory, hasScheme } from '@exemplarjs/xml/internal';
import { type CatalogReader, CatalogResolver } from './catalog.ts';
import { readLocalFile } from './read.ts';

export { InvalidArgumentError } from '@exemplarjs/xml';
export type { CatalogResolution } from '@exemplarjs/xml';
export { type CatalogReader, CatalogResolver } from './catalog.ts';
export { CATALOG_NAMESPACE } from './normalize.ts';

/** Settings for `catalogResolver`, named after `javax.xml.catalog`'s features. */
export interface CatalogOptions {
  /** The catalog files to search, in order, as absolute URIs. */
  readonly files: readonly string[];
  /** Whether public entries count when a system identifier is given too; `public` by default. */
  readonly prefer?: 'public' | 'system';
  /** Whether delegated and next catalogs are read only once they are needed; true by default. */
  readonly defer?: boolean;
  /** What happens when nothing matches; `strict` by default. */
  readonly resolution?: CatalogResolution;
  /** Reads catalog files and the resources they map to; by default `file:` URIs, where the runtime has files. */
  readonly read?: CatalogReader;
}

/** A catalog resolver for the factory's `catalog` option, which can also serve as an entity or URI resolver itself. */
export function catalogResolver(options: CatalogOptions): CatalogResolver {
  for (const file of options.files) {
    if (!hasScheme(file))
      throw ErrorFactory.create(InvalidArgumentError, `The catalog file ${file} is not an absolute URI`);
  }
  const prefer = options.prefer ?? 'public';
  if (prefer !== 'public' && prefer !== 'system')
    throw ErrorFactory.create(InvalidArgumentError, `prefer must be public or system, not ${prefer}`);
  const resolution = options.resolution ?? 'strict';
  if (!['strict', 'continue', 'ignore'].includes(resolution)) {
    throw ErrorFactory.create(InvalidArgumentError, `resolution must be strict, continue or ignore, not ${resolution}`);
  }
  return new CatalogResolver({
    files: options.files,
    preferPublic: prefer === 'public',
    defer: options.defer ?? true,
    resolution,
    read: options.read ?? readLocalFile,
  });
}
