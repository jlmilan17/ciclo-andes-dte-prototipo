import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

export type Rol = 'CAJERO' | 'ADMIN';
export type TokenClaims = { sub: string; rol: Rol; tv: number };

const key = () => new TextEncoder().encode(config.JWT_SECRET);

export async function signToken(
  claims: TokenClaims,
  ttlMinutes = config.JWT_TTL_MINUTES,
): Promise<{ token: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + Math.round(ttlMinutes * 60);
  const token = await new SignJWT({ rol: claims.rol, tv: claims.tv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key());
  return { token, exp };
}

export async function verifyToken(token: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
  return { sub: String(payload.sub), rol: payload.rol as Rol, tv: Number(payload.tv) };
}
