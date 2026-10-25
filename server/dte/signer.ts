import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { CompactSign, compactVerify, decodeProtectedHeader, importPKCS8, importSPKI } from 'jose';
import { config } from '../config.js';
import { db as defaultDb } from '../db/database.js';
import type { AnyDb } from '../db/types.js';

/**
 * Firma JWS (RS256) con un certificado DE PRUEBAS autogenerado. La llave privada se guarda
 * cifrada en reposo con AES-256-GCM (RNF-SEG-02); la clave se deriva de CERT_SECRET.
 */
const aesKey = () => createHash('sha256').update(config.CERT_SECRET).digest();

export function encryptPrivateKey(pem: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', aesKey(), iv);
  const enc = Buffer.concat([c.update(pem, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join(':');
}

export function decryptPrivateKey(blob: string): string {
  const [iv, tag, enc] = blob.split(':').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', aesKey(), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(enc!), d.final()]).toString('utf8');
}

export type CertInfo = {
  sujeto: string;
  nit: string;
  emitido: string;
  vence: string;
  huella: string;
  nota: string;
};

export function generateTestCertificate(nit: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const now = new Date();
  const info: CertInfo = {
    sujeto: 'CN=Ciclo Andes S.A. de C.V. (PRUEBAS), O=Ciclo Andes, C=SV',
    nit,
    emitido: now.toISOString(),
    vence: new Date(now.getTime() + 365 * 86_400_000).toISOString(),
    huella: createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .toUpperCase()
      .match(/.{2}/g)!
      .slice(0, 16)
      .join(':'),
    nota: 'Certificado autogenerado de pruebas. No es un certificado emitido por el Ministerio de Hacienda.',
  };
  return { publicKey, privateKey, info };
}

type Loaded = { key: Awaited<ReturnType<typeof importPKCS8>>; publicPem: string; info: CertInfo };
let cache: Loaded | null = null;

export function resetSignerCache() {
  cache = null;
}

async function load(trx: AnyDb): Promise<Loaded> {
  if (cache) return cache;
  const rows = await trx
    .selectFrom('config')
    .select(['clave', 'valor'])
    .where('clave', 'in', ['CERT_PRIVATE_KEY_ENC', 'CERT_PUBLIC_KEY', 'CERT_INFO'])
    .execute();
  const get = (k: string) => rows.find((r) => r.clave === k)?.valor;
  const enc = get('CERT_PRIVATE_KEY_ENC');
  if (!enc) throw new Error('No hay certificado de pruebas. Ejecute npm run seed.');
  cache = {
    key: await importPKCS8(decryptPrivateKey(enc), 'RS256'),
    publicPem: get('CERT_PUBLIC_KEY')!,
    info: JSON.parse(get('CERT_INFO')!),
  };
  return cache;
}

export async function signJson(payload: unknown, trx: AnyDb = defaultDb): Promise<string> {
  const { key } = await load(trx);
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'RS256', typ: 'JWS' })
    .sign(key);
}

export async function certificateInfo(trx: AnyDb = defaultDb) {
  const { info, publicPem } = await load(trx);
  return { ...info, publicKey: publicPem };
}

/** Decodifica un JWS compacto en sus tres partes para la pestaña "Firma". */
export function decodeJws(jws: string) {
  const [h, p, s] = jws.split('.');
  return {
    header: decodeProtectedHeader(jws),
    payload: JSON.parse(Buffer.from(p!, 'base64url').toString('utf8')),
    signature: s!,
    headerB64: h!,
  };
}

export async function verifyJws(jws: string, publicPem: string): Promise<unknown> {
  const { payload } = await compactVerify(jws, await importSPKI(publicPem, 'RS256'));
  return JSON.parse(new TextDecoder().decode(payload));
}
