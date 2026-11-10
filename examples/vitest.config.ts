import { createVitestConfig } from '@exemplarjs/build-config';

export default createVitestConfig({ test: { include: ['examples.test.ts'] } });
