# Examples

Worked examples of exemplar, each in a folder of its own with:

- a `README.md` saying what the example does and how;
- `example.ts`, the code;
- `source.xml`, the file it reads;
- `expected.txt` or `expected.xml`, what it produces.

Each one starts where the one before left off.

| Example                                                             | What it shows                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Read a file](01-read-a-file)                                       | Reading a file with the cursor, one event at a time                |
| [Query with XPath](02-query-with-xpath)                             | Building an XDM tree and querying it with XPath 3.1                |
| [Drop content with a filter](03-drop-content-with-a-filter)         | Dropping comments and elements as they are read, before the tree   |
| [Change content with a delegate](04-change-content-with-a-delegate) | Converting units with stacked delegates, written as a new document |
| [One record at a time](05-one-record-at-a-time)                     | Building a tree per record, for files of any size                  |
| [Filter into a new document](06-filter-into-a-new-document)         | Filtering a document straight into a new one, with no tree         |
| [SAX filters into XPath](07-sax-filters-into-xpath)                 | SAX filters adding looked-up data, then an XDM tree and XPath      |
| [SAX filters into a file](08-sax-filters-into-a-file)               | SAX filters changing attributes, written as a new document         |
| [Change events with a generator](09-change-events-with-a-generator) | A generator changing event objects, then an XDM tree and XPath     |
| [Events into a file](10-events-into-a-file)                         | A generator renaming elements, written as a new document           |

## Running them

The examples need Node 24 or later, which runs TypeScript directly. Build the packages first, from the repository's
root:

```sh
pnpm compile
```

Then run any example from its folder, which prints its result:

```sh
cd examples/01-read-a-file
node example.ts
```

`pnpm test` in this folder checks every example's result against its expected file.
