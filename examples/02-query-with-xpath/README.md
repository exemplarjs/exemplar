# Query with XPath

Builds an XDM tree from an XML file and answers questions about it with XPath 3.1.

`XdmDocumentBuilder` reads the file into a compact tree made for querying. `XPathCompiler` compiles each expression
once; an executable can then be evaluated as often as needed, against any tree.

- `evaluateStrings` and `evaluateString` give the results as JavaScript strings. Other methods give numbers, booleans,
  nodes or exact XDM values.
- `$limit` is a typed variable. The compiler checks the expression against its type, `xs:decimal`, and TypeScript checks
  the value passed to `evaluateStrings`.
- Element text is untyped. `xs:decimal(.)` makes each price a decimal, so the sum is exact rather than a floating-point
  approximation.

## Files

- [`source.xml`](source.xml): a shop's catalog of three books.
- [`example.ts`](example.ts): the code.
- [`expected.txt`](expected.txt): what it prints.

Run it with `node example.ts`.
