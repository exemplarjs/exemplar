import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** An example's module: `run` takes the path of its source file and returns what the example produces. */
interface Example {
  run(sourcePath: string): string | Promise<string>;
}

const ROOT = import.meta.dirname;
const EXAMPLES = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d\d-/.test(entry.name))
  .map((entry) => entry.name);

/** The one `expected.*` file in an example's folder. */
function expected(folder: string): string {
  const name = readdirSync(path.join(ROOT, folder)).find((file) => file.startsWith('expected.'));
  if (name === undefined) throw new Error(`${folder} has no expected result`);
  return readFileSync(path.join(ROOT, folder, name), 'utf8');
}

describe('examples', () => {
  it.each(EXAMPLES)('%s gives its expected result', async (folder) => {
    const example = (await import(/* @vite-ignore */ path.join(ROOT, folder, 'example.ts'))) as Example;
    const result = await example.run(path.join(ROOT, folder, 'source.xml'));
    expect(`${result.trimEnd()}\n`).toBe(expected(folder));
  });
});
