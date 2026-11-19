# exemplar design

How exemplar is built, and why. What it does, as its users see it, is in the
[documentation](https://github.com/io-timeout/exemplar-docs); how the repository is built, its conventions and how to
measure a change are in [development.md](development.md), and the tests in [testing.md](testing.md).

exemplar aims to be the most conformant XML library for JavaScript, the fastest, and as capable as the Java XML stack.
Most of what follows serves the second aim without giving up the first: every check the specifications ask for stays on,
so speed comes from how the work is laid out.

## Terms

| Term               | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Scanner            | The loops that look at every character: they find where markup starts, spot CR and check characters |
| Tokenizer          | Turns what the scanner finds into tokens, as offsets into the buffer; the scanner runs inside it    |
| Cursor             | The pull reader, `StreamReader`. Every other API reads through one                                  |
| Sliced string      | V8's representation of `s.slice(a, b)` of 13 or more characters: a view that keeps all of `s` alive |
| Node number        | A node's index in an XDM tree's arrays, which is its place in document order                        |
| End                | The number of the first node after a node's subtree                                                 |
| Name code          | A small integer for a prefix, namespace URI and local name, given out by a `NameTable`              |
| View               | An `XdmNode`: a tree, a node number and a kind, made when asked for                                 |
| Evaluator          | A compiled XPath expression: a function from the dynamic context to its value                       |
| Stream form        | An evaluator's items handed out one at a time, as a consumer asks for them                          |
| Pausable evaluator | An evaluator that may give a promise, because something inside it may wait for a resource           |

## Packages

```
                     ┌──────── sax, validation, xinclude, catalog, encodings-cjk (plug into the factory)
                     │
 @exemplarjs/xml ────┼──────── writer ──── dom
 (reading)           │            │
                     ├──────── canonical   │
                     │                     │
                     └──────── xdm ──────── xpath (uses writer for serialization)
```

Every package builds on `@exemplarjs/xml` and names the `@exemplarjs` packages it uses as peer dependencies, so an
application holds one copy of each. Packages reach each other's internals through `internal` entry points:
`@exemplarjs/xml/internal` shares the cursor's symbol-keyed hooks, such as `CREATE_READER`, and the helpers in
`src/util`; `@exemplarjs/xdm/internal` shares unchecked value construction, the tree's raw navigation and the value
helpers XPath builds on; and `@exemplarjs/xpath/internal` shares the parser. They are not public API, and two copies of
a package would not share their symbols, so the packages are released together at one version.

A feature with a package of its own loads only when the caller imports it and passes it to a factory: the reader knows a
validator, an XInclude processor or a catalog only by an interface.

## Reading

```
 Uint8Array / stream ─► encoding detection ─► decoder ─┐
 string ───────────────────────────────────────────────┤
                                                       ▼
                      tokenizer: one pass of the scanner's loops (tokens as offsets, no strings)
                                                       │
            catalogs ─► resolvers ◄──► entity stack ◄──► DTD parser
                                                       │
                          namespaces, defaults, xml:id: worked out by the cursor at each start tag
                                                       │
                          validator, entity boundaries, coalescing, filters: inside the cursor's next()
                                                       │
       ┌───────────────┬───────────────┬───────────────┼────────────────┬───────────────┐
    cursor API    event reader     SAX push      async iterators,   DOM builder    XDM builder
                                                 web streams
```

### Run-time structure

Each concern is its own module, but at run time a document has one cursor. The validator, entity boundaries, coalescing
and user filters each intercept the cursor's `next()`, once per event, and may drop, change or add events; XInclude
overrides it in a subclass. Accessors such as `name()` and `attributeValue(i)` are the cursor's own methods and read its
state directly, never through a chain of readers that forward to one another.

V8 inlines a call only while its call site has seen at most four object shapes, and a layer that wraps the cursor and
forwards its accessors would make each accessor a real call through every layer, on every event. So the cursor is made
of parts it owns and calls directly, each holding one concern's state, and no part forwards another's accessors:

| Part                 | File                     | Holds                                                                                   |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `StreamReader`       | `stream-reader.ts`       | The public API                                                                          |
| `EventCore`          | `event-core.ts`          | Turning tokens into events, and the current event: its token, offset and text           |
| `ElementStack`       | `element-stack.ts`       | The open elements: where each name is, the name once sliced, and whether the root ended |
| `NamespaceScopes`    | `namespace-scopes.ts`    | The namespaces in scope, each element's declarations, and the binding of its prefix     |
| `AttributeCollector` | `attribute-collector.ts` | The current start tag's attributes: their checks, namespaces, DTD defaults and `xml:id` |
| `EntityStack`        | `entity-stack.ts`        | The document and the entities expanded in it, the one being read, and locations in them |
| `EntityExpander`     | `entity-expander.ts`     | Expanding references in content and attribute values, its limits, and external entities |
| `ErrorReporter`      | `error-reporter.ts`      | Errors as the error handler receives them, some held back while a DTD is read again     |
| `DtdLoader`          | `dtd-loader.ts`          | Reading the DOCTYPE's internal and external subsets                                     |
| `AsyncInput`         | `async-input.ts`         | What an asynchronous reader waits for and is fed                                        |
| `EventProcessing`    | `event-processing.ts`    | The optional steps after the tokens: entity boundaries, coalescing, validation, filters |

`navigation.ts` builds `nextTag()`, `elementText()` and `forEachEvent()` on the public methods, and `token-values.ts`
works out the current token's values, such as normalized text. Event processing makes each event current on the event
core, so that filters and the validator read the cursor as callers do.

The sync and async readers are one class at run time, so code that reads either stays monomorphic; only their types
differ. exemplar keeps one small reader over a string and one over bytes alive, so that a garbage collection between
documents does not discard the readers' optimized code.

**Private members.** Private state and methods are `#private`, except where the class check a `#private` method costs
stops V8 inlining: the private methods of `Tokenizer`, `EventCore` and `StreamReader` are keyed by symbols each module
keeps to itself, which subclasses such as XInclude's cannot clash with. Every class keeps `#` fields. Members other
classes read, such as the DOM nodes' links, are named with `_` and tagged `@internal`.

### Scanning and tokens

The scanner's loops read characters with `charCodeAt` and look each up in a class table, a `Uint8Array` indexed by code
unit for ASCII; a character above U+007F takes one branch that checks surrogates, U+FFFE, U+FFFF and the name ranges.
XML 1.1 documents have a table of their own. The text and attribute-value loops first test a character against one
constant table of the characters every table treats as ordinary, so the common test reads no per-document state.

In XML 1.0 documents, text and attribute values are scanned a run at a time with sticky regular expressions that match
the characters needing no check, and the character loop takes only where a run stops. V8 runs those expressions slowly
on one-byte strings, so in a buffer that has held no character above U+00FF, `indexOf` finds the next `<`, `&` and `]]>`
instead, each position cached until the scan passes it, and one expression checks the run for forbidden characters.

The tokenizer records each token as offsets in reused typed arrays: its kind, name span, attribute spans and text span.
It makes no strings, decodes no references and knows nothing of namespaces. Beside it, `ChunkReader` decides when an
unfinished token is scanned again, `LineCounter` counts lines, `DoctypeToken` reads a DOCTYPE's identifiers and
`SearchCache` keeps the native searches' positions.

- **Chunks.** A token cut off by the end of the buffer is scanned again once the buffer has doubled, or once a chunk
  brings a character that could end it, which keeps the cost linear at any chunk size. The test reads each chunk, not
  the buffer, which V8 would flatten on every append.
- **Line ends.** JavaScript strings are immutable and values are slices, so nothing is rewritten in place: the loops
  stop at CR, mark the value they are in, and a marked value is normalized when it is read. A CR at the end of a piece
  is scanned again when the next arrives, so a split CR LF counts once.
- **Checks.** `]]>` is looked for only when the text loop stops at `]`; an end tag is compared with the open tag's span
  character by character, with no string; duplicate attributes are found by comparing spans pair by pair, and by a hash
  of the names in a tag with more than 16.
- **Locations.** Lines are counted only when a location is asked for, from a checkpoint that only moves forward, with
  `indexOf`. Before the buffer drops text the checkpoint moves past it, so a stream is counted once in all.

### Values

Names, attribute values, text and namespace URIs stay spans of the source until asked for, and plain text, with nothing
to normalize, is sliced in `text()` itself. A name the buffer is about to drop is sliced first. Event objects and
`copyStrings` copy instead, by appending a character, reading one so that the engine writes the joined string into
memory of its own, and slicing the character off again. Strings of every length are copied, since JavaScriptCore keeps
even a short slice as a view of its parent.

A start tag whose element has declared attributes, or whose values refer to entities, is read into a list of strings;
any other is read from spans of the buffer. A start tag with no attributes and no prefix needs no namespace work, and
the namespace scope is saved only for an element that declares namespaces. `xml:id` is found while the start tag's
namespaces are sorted out, so a document full of IDs reads as fast as one without.

### DTDs and entities

`DtdParser` (`parser.ts`) reads each kind of declaration through `DtdInput` (`input.ts`), which keeps a stack of frames,
one for each subset or parameter entity being read, expands parameter-entity references and counts them against the
limits. `content-model.ts` reads content models, `entity-value.ts` builds replacement text and `DeclarationStore`
(`store.ts`) keeps what was declared. Attribute declarations are built in one property order, so that they share a
hidden class. A location needs its line's start, so the parser finds one only for an error.

An entity's replacement text is tokenized again at each reference, by a tokenizer kept from the last entity that ended,
so a reference allocates almost nothing; replacement text without `<` or `&` becomes one `CHARACTERS` event without
being tokenized. Entity boundaries are kept for limits, locations and `reportEntityBoundaries`, whose events the cursor
queues where it tells SAX of them. Limits are counted as expansion happens.

An async reader whose resolver answers with a promise reads the DTD again from its start after each answer, holding its
recoverable errors back until it has been read in full, and keeps each answer, so no resolver is asked twice.

### Validation

The cursor calls the validator inside its own `next()`, before any filter, through an interface that gives it the
declarations, the start tag's attributes and the document's `standalone` value. With a validator present, every start
tag's attributes are listed, and with `replaceEntityReferences` off the cursor still expands each reference for the
validator alone. The DTD parser reports the constraints that need its view of parameter entities; the validator checks
the rest of the declarations once the DTD has been read, and IDREFs once the document ends.

Content models become Glushkov position automata, made deterministic as children arrive: each state is a set of
positions, and each transition by element name is worked out once and kept.

### Other readers

- **Event reader.** One class serves every kind of event, so switching on `type` stays monomorphic. Element names are
  shared: one `QName` per name and namespace, and an end tag reuses its start tag's. An event keeps its offset and the
  line segment it falls in, and finds its line by binary search when asked.
- **SAX.** The push parser runs a cursor and calls the handler. `Attributes` reads the cursor directly. The DTD parser
  records declarations, PIs and comments as it reads, for the DTD handler; `startEntity` and `endEntity` for general
  entities come from a hook the cursor calls as it enters and leaves an entity.
- **Filters** are predicates the cursor runs inside `next()`. `StreamReaderDelegate` forwards every call, for code that
  overrides accessors. `XMLFilterImpl` chains are the SAX form.
- **XInclude** extends the cursor (`SplicingReader`, `XIncludeReader`), so the included document's events come from the
  one cursor. It streams and buffers nothing: a pointer into another document skips events up to its target. The two
  cases that need content already gone past, an intra-document reference and a multi-part pointer whose later part
  matches earlier, read the document again.

## Trees

### DOM

Nodes are linked: each holds its parent, siblings and, if it can hold children, its first and last child. Node runs V8
without pointer compression, so every field costs 8 bytes, and the nodes keep their fields few:

- fields are declared and set once in the constructor, not as class fields;
- a node's booleans share one field of bits;
- nodes that cannot hold children read null child links from their prototype;
- what few nodes have lives in side tables: user data, child arrays and live lists while in use, attribute maps, and the
  base URI of an element read from an external entity;
- an attribute's value stays a string until its children are asked for.

`childNodes`, `attributes`, `entities` and `notations` hold their nodes as their own index properties, so `list[i]`
reads as fast as an array. A change at the end of a child list updates it; any other drops the index properties and puts
a Proxy in the prototype chain, which copies the children back at the next read, so a run of changes copies them once.

`src/nodes` holds one file per node class. Each imports its base class and `node.ts` imports no subclass, so the files
load in any order.

### XDM

The XDM tree is for reading, not changing, so it holds its nodes in arrays, in document order, numbered so that each
node's subtree is the run of numbers up to its end, as in the pre/size encodings of XML databases.

- **Columns.** Each node has an entry in six columns: kind (a byte), parent, end, name code, text offset and attribute
  offset, 21 bytes a node. The first child of `n` is `n + 1` when that is below its end, its next sibling is its end
  when that is below its parent's end, and its descendants are the numbers up to its end. The columns of a tree share
  one ArrayBuffer, and small trees share 64 KB buffers, as V8's ArrayBuffers are slow to allocate and collect. They are
  sized from the source's length and copied to their exact size when much is left unused.
- **Text.** All of a tree's text is one string. A node's text offset is how much text comes before it, so the string
  value of an element is one slice. Pieces are joined in chunks as the tree is built, so the input slices they often are
  can be collected young. Names, values, comments and instructions are copied, so a tree never holds its input.
- **Other tables.** An element's attributes are numbered from its attribute offset, in a table of owner, name code,
  flags and value. Namespace declarations sit in a table sorted by element, found by binary search; the namespaces in
  scope are gathered when asked for. Comments, PIs and base URIs live in maps.
- **Names.** The trees one builder makes share a `NameTable` until it holds more than 65,536 names. The table keeps one
  copy of each namespace URI, so URIs compare by identity. A node test is a kind and an expanded-name id; when only one
  name code has that expanded name, the forward axes compare codes directly.
- **Navigation.** `axisIterator(tree, node, axis, test)` gives node numbers on any axis, with no object per node, and
  `XdmNode` is a view made when asked for, so views of one node are different objects.
- **Values.** One `XdmAtomicValue` class serves every type, so code that handles values stays monomorphic. Integers are
  bigints, decimals a bigint of digits and a scale, so integer and decimal arithmetic is exact. Casting and arithmetic
  make values through an unchecked constructor, as they have already checked them.

`XdmDocumentBuilder` reads the cursor's events into a `TreeBuilder`, which takes calls such as `startElement` and `text`
and knows nothing of the reader, so `analyze-string` and `json-to-xml` build their trees through it too.

## XPath

An expression is parsed, its names resolved and its parts compiled into closures; running it is then a chain of direct
calls, with no tree to walk.

| Folder               | Holds                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/syntax`         | The lexer, the token stream, the syntax tree's types and the parser                                  |
| `src/static`         | The static context, name resolution, sequence types compiled into matchers, and subtyping            |
| `src/compile`        | The compiler, one module per family of expression                                                    |
| `src/runtime`        | The dynamic context, atomization, document order, equality, node tests, item streams, function items |
| `src/functions`      | The function library, signatures, argument conversion, the core functions, and one folder per group  |
| `src/serialization`  | `serialize` and its output methods                                                                   |
| `src/api`            | The compilers, `XPathExecutable`, typed variables, converters and `XPathException`                   |
| `src/groups`, `lean` | The function groups as the lean compiler takes them, and the index of which group holds a function   |

### Parsing

The lexer leaves keywords as names, as XPath reserves none: only the parser knows whether `div` is an operator or an
element name. The binary operators, from `or` to `except`, are read by one loop that takes each by how tightly it binds,
so an operand passes through one function for all nine levels. The syntax tree is a discriminated union with a span per
node; names stay as written, and abbreviations are expanded.

### Compiling

Each kind of expression compiles into an `Evaluator`. The dynamic context holds the focus, the variables by slot and the
environment; every binding and declared variable gets a slot at compile time, so a variable reference reads an array.
Names resolve against the static context as they compile, and each sequence type becomes a matcher that also keeps its
type's shape, for subtyping.

The compiler does at compile time what does not depend on the focus:

- a predicate that is a literal integer picks its item, and `last()` the last;
- a predicate that reads nothing of the focus is evaluated once per value filtered, and a general comparison with one
  such operand, as in `[@id = $person/@id]`, evaluates that operand once and keeps its string values;
- a cast of a literal is cast once, its error kept for evaluation;
- a general comparison with a range compares with the range's bounds.

`predicate-analysis.ts` says what a predicate reads: whether it depends on position, reads the focus or gives a number.

### Paths

- **`//name`** compiles as `descendant::name` when no predicate of the child step depends on position, which gives the
  same nodes without sorting. When one does, as in `//x[last()]`, the path walks `descendant::x` once and filters the
  nodes grouped by parent, and `//@a[p]` reads each element's attributes in one walk.
- **Steps.** An axis step compiles once into its parts (`StepParts`): its axis and test, and its predicates as
  conditions that read no position, as a literal position, or as general predicates. The step's evaluator, its stream
  and a path's node-number pipeline are all made from those parts.
- **Node numbers.** A path whose steps after the first are axis steps with no predicates, conditions, or one literal
  position runs on node numbers (`number-paths.ts`): each step's numbers come from the numbers before, put in document
  order by sorting the numbers, and only the last step's nodes are made, as they are read. `//@a` reads the run of
  attribute numbers each subtree holds, and `//x[n]` the nth `x` child of every node in one walk that counts each open
  parent's children. A short path that would gain nothing steps node by node.
- **Order.** Path steps and the set operations sort into document order and remove duplicates only after a check that
  the nodes are not in order already; a step from one node needs neither.

### Streams

An evaluator can carry a stream form (`withStream`), made when a consumer first asks. Functions defined with
`defineLazyFunction` read only the first items of their argument, or its count: `exists`, `empty`, `head`, `boolean`,
`not`, `zero-or-one`, `exactly-one` and `count`. Effective boolean values, the bindings of `some` and `every`, and
filters by a literal position read streams too. Axis steps, paths, filters by conditions and sequences give streams; any
other evaluator's stream is its value read in turn. An item stream of node numbers counts without making nodes.

### Pausing

One evaluator serves `evaluate` and `evaluateAsync`. The compiler marks what may pause: calls to functions that read
resources or take function arguments, dynamic calls, and every construct with one of those inside. Everything else
compiles to plain synchronous evaluators. A marked construct has a pausable form, which gives its value at once when
nothing is pending and a promise only when something is; `for`, `let`, quantifiers, conditionals, logic, paths,
predicates and `!` have forms of their own, and any other construct waits for its operands through one generic form.
Promises through every call would cost every step, and awaiting a promise alone never lets the event loop run, so
nothing is gained by making all of it asynchronous.

The resource pool (`resources.ts`) keeps each answer, or pending promise, by URI for the evaluation, and asks for the
resources an expression names as literals together before it runs.

### Functions

A function is its F&O signature and an implementation: `defineFunction('fn:substring($s as xs:string?, ...)', ...)`.
Signatures are parsed with the parser's own sequence types, and arguments converted by the function conversion rules
before the implementation sees them. Function items keep a copy of the variables in scope when made, so recursion
through a function passed to itself cannot overwrite a caller's parameters.

The functions beyond the core are in groups, each a module the lean compiler takes; `compileAsync` finds the functions
an expression names in an index that loads no group, and imports the groups it lacks together. Regular expressions are
translated to JavaScript ones with the `v` flag, through the translator in `@exemplarjs/xml`'s utilities, and cached by
pattern and flags. The XML serialization method writes through `@exemplarjs/writer`; HTML and XHTML share a writer of
their own, as HTML's syntax is not XML's.

## Writing

`StreamWriter` (`stream-writer.ts`) keeps where the document is and writes its markup; `Output` (`output.ts`) gathers it
into chunks of about 64 K characters, each an array of pieces joined once, and encodes them for a byte sink.
`NamespaceBindings` keeps the bindings in scope, and `ContextNode` the element whose start tag is open, with its
attributes for the duplicate and binding checks. `escape.ts` escapes and writes CDATA sections; its test for anything to
escape includes a character map's characters, so text without them is written as fast as without a map. Whether an
element writes CDATA sections or adds no indentation is decided when its start tag closes. `EventWriter` writes events
through a stream writer, `reader-copy.ts` writes what a reader reads, and `node.ts` writes DOM nodes.

Canonicalization writes from a cursor of its own with each method's escaping, ordering and namespace rules, reading the
whole DTD and its entities.

## Errors

Every error exemplar raises on purpose is built by `ErrorFactory.create`, without a stack trace: a trace would list only
exemplar's own frames, and capturing one is costly in documents that raise thousands of recoverable errors. A `catch`
that handles some classes of error passes the rest on with `ErrorFactory.expect`, and a test fails on any error built or
rethrown another way. Each error has a stable code, named for what it means.
