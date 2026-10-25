import { buildDteJson, type BuildInput } from './common.js';

/** FCFE (01): sin datos de contribuyente ni retención (PRT-DTE-01, ZG-02). */
export const buildFcfe = (i: Omit<BuildInput, 'tipo'>) => buildDteJson({ ...i, tipo: '01' });
