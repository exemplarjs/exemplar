import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fileResolver } from '@exemplarjs/xml/resolvers/file';
import { XPathCompiler } from '@/index';
import { directoryCollections } from '@/resolvers/directory';

// The directory resolver needs a file system, so these tests run on Node only.
describe('directoryCollections', () => {
  const parent = mkdtempSync(path.join(tmpdir(), 'exemplar-'));
  const root = path.join(parent, 'root');
  mkdirSync(path.join(root, 'books', 'nested'), { recursive: true });
  writeFileSync(path.join(root, 'books', 'b.xml'), '<b>2</b>');
  writeFileSync(path.join(root, 'books', 'a.xml'), '<a>1</a>');
  const resolver = directoryCollections({ root });
  const books = pathToFileURL(path.join(root, 'books')).href;

  it('lists the files in a directory below its root, in name order, leaving directories out', () => {
    expect(resolver.resolveCollection(`${books}/`)).toEqual([`${books}/a.xml`, `${books}/b.xml`]);
  });

  it('knows nothing outside its root, no default collection, other protocols, or URIs naming no directory', () => {
    expect(resolver.resolveCollection(pathToFileURL(parent).href)).toBeUndefined();
    expect(resolver.resolveCollection(undefined)).toBeUndefined();
    expect(resolver.resolveCollection('http://example.org/books/')).toBeUndefined();
    expect(resolver.resolveCollection(`${books}/a.xml`)).toBeUndefined();
    expect(resolver.resolveCollection('file:///%FF')).toBeUndefined();
    expect(resolver.resolveCollection(pathToFileURL(root).href)).toEqual([]);
  });

  it('lists directories anywhere below a root that is the file system root', () => {
    const everywhere = directoryCollections({ root: path.parse(root).root });
    expect(everywhere.resolveCollection(`${books}/`)).toEqual([`${books}/a.xml`, `${books}/b.xml`]);
  });

  it('keeps the files a pattern selects, the pattern of the URI before that of its options', () => {
    const mixed = pathToFileURL(path.join(root, 'mixed')).href;
    mkdirSync(path.join(root, 'mixed'));
    for (const name of ['a.xml', 'b.xhtml', 'c.xmlx', 'README.md', 'a+b.xml'])
      writeFileSync(path.join(root, 'mixed', name), '<a>1</a>');
    const xml = directoryCollections({ root, select: '*.xml' });
    expect(xml.resolveCollection(`${mixed}/`)).toEqual([`${mixed}/a+b.xml`, `${mixed}/a.xml`]);
    expect(xml.resolveCollection(`${mixed}/?select=*.(xml|xhtml)`)).toEqual([
      `${mixed}/a+b.xml`,
      `${mixed}/a.xml`,
      `${mixed}/b.xhtml`,
    ]);
    expect(resolver.resolveCollection(`${mixed}/?select=?.xml`)).toEqual([`${mixed}/a.xml`]);
    expect(resolver.resolveCollection(`${mixed}/?select=a%2Bb.xml`)).toEqual([`${mixed}/a+b.xml`]);
    const resources = { collectionResolver: resolver, uriResolver: fileResolver({ root }) };
    const count = new XPathCompiler().compile(`count(collection("${mixed}/?select=*.xml"))`);
    expect(count.evaluateNumber(null, { resources })).toBe(2);
  });

  it('serves fn:collection with a file resolver reading the files', () => {
    const resources = { collectionResolver: resolver, uriResolver: fileResolver({ root }) };
    const sum = new XPathCompiler().compile(`sum(collection("${books}/")/*)`);
    expect(sum.evaluateNumber(null, { resources })).toBe(3);
  });
});
