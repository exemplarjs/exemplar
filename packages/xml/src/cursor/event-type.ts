/** The events a reader reports, numbered as StAX's `XMLStreamConstants` are. */
export const EventType = {
  START_ELEMENT: 1,
  END_ELEMENT: 2,
  PROCESSING_INSTRUCTION: 3,
  CHARACTERS: 4,
  COMMENT: 5,
  SPACE: 6,
  START_DOCUMENT: 7,
  END_DOCUMENT: 8,
  ENTITY_REFERENCE: 9,
  ATTRIBUTE: 10,
  DTD: 11,
  CDATA: 12,
  NAMESPACE: 13,
  NOTATION_DECLARATION: 14,
  ENTITY_DECLARATION: 15,
  /** An asynchronous reader needs more input before it can go on; await `fill()`. */
  NEED_INPUT: 257,
  /** With `reportEntityBoundaries`: an expanded entity starts here; `name()` gives its name. */
  START_ENTITY: 258,
  /** With `reportEntityBoundaries`: the expanded entity named by `name()` ends here. */
  END_ENTITY: 259,
} as const;

// Module-level constants, so V8 can inline them; an object's members are read again on every use.
const { CHARACTERS, SPACE, CDATA } = EventType;

/** One of the event types. */
export type EventType = (typeof EventType)[keyof typeof EventType];

/** Whether an event is character data: text, CDATA or ignorable whitespace. */
export function isCharacterData(event: EventType): boolean {
  return event === CHARACTERS || event === CDATA || event === SPACE;
}
