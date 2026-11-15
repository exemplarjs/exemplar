# exemplar roadmap

Enhancements that are planned and not yet built. Each says what it adds and what there is today.

## XPath

| Enhancement                         | What it adds                                                                                              | Today                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Number words in more languages      | `format-integer(21, 'Ww', 'de')` gives German words, and likewise for other languages.                    | Words are English only; another language gives English words.                            |
| Collections that read files by type | A directory collection gives each file as what it is: XML as a document, text as a string, JSON as a map. | Every selected file is parsed as XML; `select` keeps a collection to the files that are. |

## DOM

| Enhancement           | What it adds                                                      | Today                                                                        |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `children` on parents | A live collection of a node's element children, as browsers have. | `firstElementChild`, `nextElementSibling` and `childElementCount` walk them. |

## Performance

| Enhancement          | What it adds                                                                                   | Today                         |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| Hot internal methods | A pass over the internal methods called for every event, measuring other ways to declare them. | They are `#` private methods. |
