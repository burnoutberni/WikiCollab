import path from 'node:path';

import dotenv from 'dotenv';

// Imported before server modules that read process.env during ESM evaluation.
dotenv.config({ path: path.resolve(import.meta.dirname, '../../../.env') });
