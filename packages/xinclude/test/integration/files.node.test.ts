import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '@exemplarjs/canonical';
import { DocumentBuilder } from '@exemplarjs/dom';
import { XMLInputFactory } from '@exemplarjs/xml';
import { fileResolver } from '@exemplarjs/xml/resolvers/file';
import { xincludeProcessor } from '@/index';

// Real files need a file system, so these tests run on Node only.
const ROOT = new URL('../fixtures/book/', import.meta.url);
const BOOK = new URL('book.xml', ROOT).href;

/** Canonical XML without the whitespace next to tags, so that how the fixtures are laid out does not matter. */
function withoutLayout(xml: string): string {
  return xml.replaceAll(/>\s+/g, '>').replaceAll(/\s+</g, '<');
}

/** A factory with XInclude on that reads files below the fixtures. */
function files(): XMLInputFactory {
  return new XMLInputFactory({
    xinclude: xincludeProcessor(),
    accessExternalEntities: ['file'],
    entityResolver: fileResolver({ root: fileURLToPath(ROOT) }),
  });
}

describe('XInclude over files', () => {
  it('includes documents, pointers, fallbacks and text in several encodings', () => {
    const reader = files().createStreamReader({ bytes: readFileSync(new URL(BOOK)), systemId: BOOK });
    expect(withoutLayout(canonicalize(reader, { method: 'exc-c14n' }))).toBe(
      '<book xml:lang="en">' +
        '<chapter xml:base="chapters/one.xml" xml:lang="fr"><title>Un</title></chapter>' +
        '<para xml:base="chapters/two.xml" xml:id="summary" xml:lang="">In short</para>' +
        '<missing></missing>' +
        '<latin>café</latin>' +
        '<utf16>naïve</utf16>' +
        '</book>'
    );
  });

  it('gives the DOM each included element’s file as its base URI', () => {
    const doc = new DocumentBuilder(files()).parse({ bytes: readFileSync(new URL(BOOK)), systemId: BOOK });
    expect(doc.getElementsByTagName('para').item(0)?.baseURI).toBe(new URL('chapters/two.xml', ROOT).href);
  });

  it('reads the document again from its file for an intra-document reference given as chunks', () => {
    const self = new URL('self.xml', ROOT);
    const reader = files().createStreamReader({ chunks: [readFileSync(self)], systemId: self.href });
    expect(withoutLayout(canonicalize(reader, { method: 'exc-c14n' }))).toBe('<r><x>X</x><x>X</x></r>');
  });
});
