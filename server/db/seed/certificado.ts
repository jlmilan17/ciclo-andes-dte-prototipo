import { EMISOR, MH_API_KEY } from '../../dte/emisor.js';
import { encryptPrivateKey, generateTestCertificate, resetSignerCache } from '../../dte/signer.js';
import type { AnyDb } from '../types.js';

/**
 * Genera el certificado de pruebas, guarda la llave privada cifrada y "registra" al emisor
 * y el padrón en el simulador del MH (equivalente al alta del contribuyente ante el MH).
 */
export async function seedCertificado(db: AnyDb) {
  const cert = generateTestCertificate(EMISOR.nit);
  await db
    .insertInto('config')
    .values([
      { clave: 'CERT_PRIVATE_KEY_ENC', valor: encryptPrivateKey(cert.privateKey) },
      { clave: 'CERT_PUBLIC_KEY', valor: cert.publicKey },
      { clave: 'CERT_INFO', valor: JSON.stringify(cert.info) },
    ])
    .execute();
  resetSignerCache();
  await db
    .withSchema('mh_sim')
    .insertInto('emisor')
    .values({
      nit: EMISOR.nit,
      nrc: EMISOR.nrc,
      nombre: EMISOR.nombre,
      clave_api: MH_API_KEY,
      public_key_pem: cert.publicKey,
    })
    .execute();
  const padron = await db.selectFrom('padron_nrc').select(['nrc', 'activo']).execute();
  if (padron.length) await db.withSchema('mh_sim').insertInto('padron').values(padron).execute();
}
