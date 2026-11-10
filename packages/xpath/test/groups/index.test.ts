import { describe, expect, it } from 'vitest';
import { ALL_GROUPS } from '@/groups/index';
import { GROUP_FUNCTIONS, GROUP_MODULES, type GroupModule } from '@/lean/group-index';
import { DEFAULT_NAMESPACES } from '@/static/static-context';

/** A function as the index names it: by local name in the fn namespace, by prefix and local name otherwise. */
function indexName(namespaceURI: string, localName: string): string {
  const prefix = Object.entries(DEFAULT_NAMESPACES).find(([, uri]) => uri === namespaceURI)?.[0];
  return prefix === 'fn' ? localName : `${prefix ?? namespaceURI}:${localName}`;
}

describe('the function groups', () => {
  it('have names of their own, and every function in one group only', () => {
    expect(new Set(ALL_GROUPS.map((group) => group.name)).size).toBe(ALL_GROUPS.length);
    const keys = ALL_GROUPS.flatMap((group) => [
      ...new Set(group.functions.map((f) => `{${f.namespaceURI}}${f.localName}`)),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('are listed in the lean index exactly, function by function', () => {
    const fromGroups = Object.fromEntries(
      ALL_GROUPS.map((group) => [
        group.name,
        [...new Set(group.functions.map((f) => indexName(f.namespaceURI, f.localName)))],
      ])
    );
    expect(fromGroups).toEqual(GROUP_FUNCTIONS);
  });

  it('each load from their own module by name, under the export name the index gives', async () => {
    for (const group of ALL_GROUPS) {
      const { exportName, load } = GROUP_MODULES[group.name] as GroupModule;
      expect(await load()).toBe(group);
      expect(exportName).toMatch(/^[a-z][A-Za-z]+Functions$/);
    }
  });
});
