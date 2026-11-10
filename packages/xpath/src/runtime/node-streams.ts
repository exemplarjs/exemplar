import {
  ANY_KIND,
  ANY_NAME,
  type NodeIterator,
  NO_NODE,
  NodeKind,
  type NodeTest,
  type Tree,
  type XdmItem,
  XdmNode,
} from '@exemplarjs/xdm';
import { attributePasses } from '@exemplarjs/xdm/internal';
import type { ItemStream } from './item-streams.ts';

/** The nodes an axis iterator gives, each made as it is asked for; counted without making them. */
export class AxisStream implements ItemStream {
  readonly #tree: Tree;
  readonly #nodes: NodeIterator;

  constructor(tree: Tree, nodes: NodeIterator) {
    this.#tree = tree;
    this.#nodes = nodes;
  }

  next(): XdmItem | undefined {
    const node = this.#nodes.next();
    return node === NO_NODE ? undefined : XdmNode.of(this.#tree, node);
  }

  count(): number {
    let count = 0;
    while (this.#nodes.next() !== NO_NODE) count++;
    return count;
  }
}

/** The nodes of a list of node numbers, each made as it is asked for; counted without making them. */
export class NumberStream implements ItemStream {
  readonly #tree: Tree;
  readonly #numbers: readonly number[];
  #index = 0;

  constructor(tree: Tree, numbers: readonly number[]) {
    this.#tree = tree;
    this.#numbers = numbers;
  }

  next(): XdmItem | undefined {
    const node = this.#numbers[this.#index++];
    return node === undefined ? undefined : XdmNode.of(this.#tree, node);
  }

  count(): number {
    const left = this.#numbers.length - this.#index;
    this.#index = this.#numbers.length;
    return Math.max(left, 0);
  }
}

/**
 * The attributes in runs of attribute numbers that pass a test, each made as it is asked for: the
 * runs are pairs of a first number and the number after the last. Counted without making them when
 * the test keeps every attribute.
 */
export class AttributeStream implements ItemStream {
  readonly #tree: Tree;
  readonly #runs: readonly number[];
  readonly #test: NodeTest;
  readonly #keepsAll: boolean;
  #runIndex = 0;
  #nextAttribute: number;

  constructor(tree: Tree, runs: readonly number[], test: NodeTest) {
    this.#tree = tree;
    this.#runs = runs;
    this.#test = test;
    this.#keepsAll = test.name === ANY_NAME && (test.kind === ANY_KIND || test.kind === NodeKind.ATTRIBUTE);
    this.#nextAttribute = runs[0] ?? 0;
  }

  next(): XdmItem | undefined {
    const runs = this.#runs;
    while (this.#runIndex < runs.length) {
      const limit = runs[this.#runIndex + 1] as number;
      while (this.#nextAttribute < limit) {
        const attribute = this.#nextAttribute++;
        if (this.#keepsAll || attributePasses(this.#tree, attribute, this.#test))
          return new XdmNode(this.#tree, NodeKind.ATTRIBUTE, attribute);
      }
      this.#runIndex += 2;
      this.#nextAttribute = runs[this.#runIndex] ?? 0;
    }
    return undefined;
  }

  count(): number {
    let count = 0;
    if (!this.#keepsAll) {
      while (this.next() !== undefined) count++;
      return count;
    }
    const runs = this.#runs;
    while (this.#runIndex < runs.length) {
      count += (runs[this.#runIndex + 1] as number) - this.#nextAttribute;
      this.#runIndex += 2;
      this.#nextAttribute = runs[this.#runIndex] ?? 0;
    }
    return count;
  }
}

/** The items of a stream that pass a test. */
export class FilteredStream implements ItemStream {
  readonly #source: ItemStream;
  readonly #keep: (item: XdmItem) => boolean;

  constructor(source: ItemStream, keep: (item: XdmItem) => boolean) {
    this.#source = source;
    this.#keep = keep;
  }

  next(): XdmItem | undefined {
    for (let item = this.#source.next(); item !== undefined; item = this.#source.next()) {
      if (this.#keep(item)) return item;
    }
    return undefined;
  }
}
