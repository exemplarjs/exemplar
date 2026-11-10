/** @exemplarjs/xinclude: XInclude 1.0, with XPointer's element() scheme and shorthand pointers. */
import type { XIncludeProcessor } from '@exemplarjs/xml';
import { inclusionKey } from './include.ts';
import { type XIncludeOptions, XIncludeReader } from './reader.ts';

export { IllegalStateError, InvalidArgumentError } from '@exemplarjs/xml';
export { XINCLUDE_NAMESPACE, type XIncludeOptions } from './reader.ts';

/** An XInclude processor for the factory's `xinclude` option; included elements get `xml:base` and `xml:lang` unless turned off. */
export function xincludeProcessor(options: XIncludeOptions = {}): XIncludeProcessor {
  const resolved = { fixupBaseURIs: options.fixupBaseURIs ?? true, fixupLanguage: options.fixupLanguage ?? true };
  return {
    createReader(source, opened, options, registry, input) {
      const uri = opened.systemId ?? opened.baseURI ?? '';
      const context = { settings: resolved, chain: [inclusionKey(uri, undefined)], async: input !== undefined };
      return new XIncludeReader(source, opened, options, registry, input, context);
    },
  };
}
