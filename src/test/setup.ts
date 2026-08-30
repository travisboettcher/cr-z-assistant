import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Testing Library registers its own cleanup only when Vitest runs with
 * `globals: true`. This project uses explicit imports instead, so without this
 * every render would leave its tree in the document and the next query would
 * match twice.
 */
afterEach(cleanup);
