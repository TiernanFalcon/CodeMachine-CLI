/**
 * Credential Storage Utilities
 *
 * Provides secure storage for sensitive credentials using:
 * - AES-256-GCM encryption with machine-derived key
 * - Restrictive file permissions (0600 on Unix)
 */

import * as crypto from 'node:crypto';
import { homedir, hostname, userInfo } from 'node:os';
import { writeFile, readFile, chmod, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derive an encryption key from machine-specific values
 * Uses hostname + username + home directory as entropy sources
 */
function deriveMachineKey(salt: Buffer): Buffer {
  const machineId = [
    hostname(),
    userInfo().username,
    homedir(),
    process.platform,
  ].join(':');

  return crypto.pbkdf2Sync(machineId, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt credential data
 * Returns base64-encoded string containing: salt + iv + authTag + ciphertext
 */
export function encryptCredential(plaintext: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveMachineKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt credential data
 * Expects base64-encoded string from encryptCredential()
 */
export function decryptCredential(encrypted: string): string {
  const combined = Buffer.from(encrypted, 'base64');

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveMachineKey(salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Write encrypted credential file with secure permissions
 */
export async function writeSecureCredential(
  filePath: string,
  data: Record<string, unknown>
): Promise<void> {
  const plaintext = JSON.stringify(data);
  const encrypted = encryptCredential(plaintext);

  // Write with restricted permissions
  await writeFile(filePath, encrypted, { encoding: 'utf8', mode: 0o600 });

  // Ensure permissions on Unix (writeFile mode may be masked by umask)
  if (process.platform !== 'win32') {
    await chmod(filePath, 0o600);
  }
}

/**
 * Read and decrypt credential file
 * Returns null if file doesn't exist or decryption fails
 */
export async function readSecureCredential(
  filePath: string
): Promise<Record<string, unknown> | null> {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const encrypted = await readFile(filePath, 'utf8');

    // Handle legacy plaintext files (migration path)
    if (encrypted.startsWith('{')) {
      // Already plaintext JSON - return as-is but log warning
      console.warn(`Warning: Legacy plaintext credential at ${filePath}. Run auth again to encrypt.`);
      return JSON.parse(encrypted);
    }

    const plaintext = decryptCredential(encrypted);
    return JSON.parse(plaintext);
  } catch {
    return null;
  }
}

/**
 * Check if credential file has secure permissions
 */
export async function hasSecurePermissions(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    // On Unix, check for 0600 (owner read/write only)
    if (process.platform !== 'win32') {
      const mode = stats.mode & 0o777;
      return mode === 0o600;
    }
    // On Windows, just check file exists
    return true;
  } catch {
    return false;
  }
}
