/** @exemplarjs/writer: the stream and event writers, following StAX, and their sinks. */
export { InvalidArgumentError } from '@exemplarjs/xml';
export { type Encoder, encoderFor } from './encoders.ts';
export { WriterError } from './error.ts';
export { type CharacterWriter, mapCharacters } from './escape.ts';
export { EventWriter } from './event-writer.ts';
export { type Destination, XMLOutputFactory } from './factory.ts';
export type { OutputOptions, ResolvedOutputOptions } from './options.ts';
export { WritingHandler } from './sax-handler.ts';
export { type ByteSink, BytesSink, type Sink, StringSink, WritableStreamSink } from './sinks.ts';
export type { WritableNode } from './node.ts';
export { StreamWriter } from './stream-writer.ts';
