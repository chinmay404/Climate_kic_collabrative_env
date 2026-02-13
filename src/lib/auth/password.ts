import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const normalized = password.normalize('NFKC');
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(normalized, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, storedKeyHex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !storedKeyHex) return false;

  const normalized = password.normalize('NFKC');
  const derivedKey = (await scrypt(normalized, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(storedKeyHex, 'hex');

  if (storedKey.length !== derivedKey.length) return false;
  return timingSafeEqual(storedKey, derivedKey);
}

