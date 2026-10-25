import { db } from './database.js';
import { seedAll } from './seed/index.js';

await seedAll(db);
console.log('Datos de demostración creados.');
await db.destroy();
