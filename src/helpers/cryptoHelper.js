/**
 * AES-256-GCM application-level encryption for plain_password storage.
 * Key must be a 64-char hex string (32 bytes) stored in ENCRYPTION_KEY env var.
 *
 * Usage:
 *   const { encrypt, decrypt } = require('./cryptoHelper');
 *   const cipher = encrypt('myPlainPassword');   // store this in DB
 *   const plain  = decrypt(cipher);              // returns 'myPlainPassword'
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES  = 12; // 96-bit IV recommended for GCM
const TAG_BYTES = 16;

/**
 * Returns the 32-byte key derived from ENCRYPTION_KEY env var.
 * Throws on misconfiguration so the server fails fast at startup.
 */
const getKey = () => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
};

/**
 * Encrypt plaintext → "<iv_hex>:<tag_hex>:<ciphertext_hex>"
 * Returns null if plaintext is null/undefined.
 */
const encrypt = (plaintext) => {
  if (plaintext == null) return null;
  const key = getKey();
  const iv  = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypt "<iv_hex>:<tag_hex>:<ciphertext_hex>" → plaintext string.
 * Returns null if ciphertext is null/undefined.
 * Throws on tampered/corrupted data (GCM auth failure).
 */
const decrypt = (ciphertext) => {
  if (ciphertext == null) return null;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, tagHex, encHex] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
