import { buildDteJson, type BuildInput } from './common.js';

/** CCFE (03): receptor contribuyente con NIT/NRC (RF-CCFE-03). */
export const buildCcfe = (i: Omit<BuildInput, 'tipo'>) => buildDteJson({ ...i, tipo: '03' });
