/** An entity being expanded: the node its content goes into, and whether it was read from its own URI. */
interface OpenEntity {
  readonly parent: number;
  readonly external: boolean;
}

/**
 * The entities being expanded as a tree is built, innermost last. A node at the top of an external
 * entity, directly or through internal ones, takes the entity's URI as its base URI, as XDM says.
 */
export class OpenEntities {
  readonly #entities: OpenEntity[] = [];

  /** How many entities are being expanded. */
  get length(): number {
    return this.#entities.length;
  }

  /** Notes an entity's expansion starting, its content going into `parent`. */
  start(parent: number, external: boolean): void {
    this.#entities.push({ parent, external });
  }

  /** Notes the innermost expansion ending. */
  end(): void {
    this.#entities.pop();
  }

  /** Whether a node added to `parent` sits at the top of an external entity, directly or through internal ones. */
  atTopOfExternal(parent: number): boolean {
    const entities = this.#entities;
    for (let i = entities.length - 1; i >= 0 && (entities[i] as OpenEntity).parent === parent; i--) {
      if ((entities[i] as OpenEntity).external) return true;
    }
    return false;
  }

  /** Forgets every expansion, for a new document. */
  clear(): void {
    this.#entities.length = 0;
  }
}
