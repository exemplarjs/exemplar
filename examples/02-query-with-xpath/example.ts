import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XdmDocumentBuilder } from '@exemplarjs/xdm';
import { XPathCompiler } from '@exemplarjs/xpath';

/** Answers questions about a catalog file with XPath. */
export function run(path: string): string {
  const catalog = new XdmDocumentBuilder().parse({ systemId: pathToFileURL(path).href, bytes: readFileSync(path) });
  const compiler = new XPathCompiler();

  const fiction = compiler.compile("//book[@genre = 'fiction']/title");
  // A typed variable: the compiler checks the type, and TypeScript checks the value you pass.
  const cheaper = compiler.compile('//book[xs:decimal(price) lt $limit]/title', { variables: { limit: 'xs:decimal' } });
  const authors = compiler.compile('distinct-values(//author)');
  // Prices are text; as decimals, their sum is exact.
  const total = compiler.compile('sum(//price ! xs:decimal(.))');
  const dearest = compiler.compile('//book[xs:decimal(price) = max(//price ! xs:decimal(.))]/title');

  return [
    `Fiction: ${fiction.evaluateStrings(catalog).join(', ')}`,
    `Under 12: ${cheaper.evaluateStrings(catalog, { variables: { limit: 12 } }).join(', ')}`,
    `Authors: ${authors.evaluateStrings(catalog).join(', ')}`,
    `Total: ${total.evaluateString(catalog)}`,
    `Most expensive: ${dearest.evaluateString(catalog)}`,
  ].join('\n');
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
