import { fileURLToPath } from 'node:url';
import { type OutputChunk, rolldown } from 'rolldown';
import { describe, expect, it } from 'vitest';

/** The xpath package's source folder, which the bundled entries import from. */
const SOURCE = fileURLToPath(new URL('../../src/', import.meta.url));

/** A signature string from each group's definitions, which only a bundle carrying the group holds. */
const MARKERS: Readonly<Record<string, string>> = {
  'date-time': 'fn:parse-ietf-date(',
  formatting: 'fn:format-number(',
  regex: 'fn:matches(',
  'higher-order': 'fn:fold-left(',
  maps: 'map:merge(',
  arrays: 'array:flatten(',
  json: 'fn:xml-to-json(',
  resources: 'fn:unparsed-text(',
  serialization: 'fn:serialize(',
};

/** The chunks a bundler makes of an entry module's text, read from the package's sources, minified. */
async function bundle(entry: string): Promise<OutputChunk[]> {
  const build = await rolldown({
    input: 'entry',
    logLevel: 'silent',
    resolve: { conditionNames: ['exemplar-source', 'import', 'default'] },
    plugins: [
      {
        name: 'entry',
        resolveId: (id) => (id === 'entry' ? id : null),
        load: (id) => (id === 'entry' ? entry.replaceAll('@/', SOURCE) : null),
      },
    ],
  });
  const { output } = await build.generate({ format: 'esm', minify: true });
  return output.filter((part): part is OutputChunk => part.type === 'chunk');
}

/** The groups whose code a piece of bundled code holds. */
function groupsIn(code: string): string[] {
  return Object.entries(MARKERS)
    .filter(([, marker]) => code.includes(marker))
    .map(([group]) => group);
}

// Bundling needs a file system, so these tests run on Node only.
describe('the lean bundle', () => {
  it('carries no group it is not given, and loads each from a chunk of its own', async () => {
    const chunks = await bundle(`export { XPathCompiler } from '@/lean';`);
    const entry = chunks.find((chunk) => chunk.isEntry) as OutputChunk;
    expect(groupsIn(entry.code)).toEqual([]);
    const loaded = chunks.filter((chunk) => !chunk.isEntry).flatMap((chunk) => groupsIn(chunk.code));
    expect(loaded.toSorted()).toEqual(Object.keys(MARKERS).toSorted());
  }, 30_000);

  it('carries the groups it imports, and only those, in its entry', async () => {
    const chunks = await bundle(
      `export { XPathCompiler } from '@/lean';\nexport { regexFunctions } from '@/groups/regex';`
    );
    const entry = chunks.find((chunk) => chunk.isEntry) as OutputChunk;
    expect(groupsIn(entry.code)).toEqual(['regex']);
  }, 30_000);
});
