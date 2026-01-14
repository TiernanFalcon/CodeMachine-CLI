import { rm, mkdir } from 'node:fs/promises';

import { resolveGeminiConfigDir, getApiKeyPath } from './config.js';
import { metadata } from './metadata.js';
import { writeSecureCredential, readSecureCredential } from '../../../../shared/utils/credentials.js';

export interface GeminiAuthOptions {
  configDir?: string;
}

/**
 * Get API key from environment or config file
 */
export async function getApiKey(options?: GeminiAuthOptions): Promise<string | null> {
  // Check environment variable first
  if (process.env.GOOGLE_API_KEY) {
    return process.env.GOOGLE_API_KEY;
  }

  // Alternative env var name
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  // Check config file (encrypted)
  const configDir = resolveGeminiConfigDir(options);
  const apiKeyPath = getApiKeyPath(configDir);

  try {
    const config = await readSecureCredential(apiKeyPath);
    return (config?.apiKey as string) || null;
  } catch {
    return null;
  }
}

/**
 * Check if Gemini is authenticated
 */
export async function isAuthenticated(options?: GeminiAuthOptions): Promise<boolean> {
  const apiKey = await getApiKey(options);
  return apiKey !== null && apiKey.length > 0;
}

/**
 * Validate API key by making a test request
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    // Make a lightweight request to validate the key
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure Gemini is authenticated
 */
export async function ensureAuth(options?: GeminiAuthOptions): Promise<boolean> {
  // Check if already authenticated
  const existingKey = await getApiKey(options);
  if (existingKey) {
    return true;
  }

  if (process.env.CODEMACHINE_SKIP_AUTH === '1') {
    // Create a placeholder for testing/dry-run mode
    const configDir = resolveGeminiConfigDir(options);
    await mkdir(configDir, { recursive: true });
    const apiKeyPath = getApiKeyPath(configDir);
    await writeSecureCredential(apiKeyPath, { apiKey: 'test-key' });
    return true;
  }

  // Interactive setup - prompt for API key
  console.log(`\n────────────────────────────────────────────────────────────`);
  console.log(`  🔑 ${metadata.name} Authentication Setup`);
  console.log(`────────────────────────────────────────────────────────────`);
  console.log(`\nTo use ${metadata.name}, you need a Google AI API key.`);
  console.log(`Get one at: https://aistudio.google.com/app/apikey\n`);

  // Read API key from stdin with timeout
  process.stdout.write('Enter your Google AI API key: ');

  const STDIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const apiKey = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.stdin.removeAllListeners('data');
      process.stdin.pause();
      reject(new Error('Authentication timed out - no input received within 5 minutes.'));
    }, STDIN_TIMEOUT_MS);

    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      clearTimeout(timeout);
      resolve(data.toString().trim());
    });
    process.stdin.resume();
  });

  if (!apiKey) {
    console.error('\n❌ No API key provided.\n');
    throw new Error('API key is required for Gemini authentication.');
  }

  // Validate the key
  console.log('\nValidating API key...');
  const isValid = await validateApiKey(apiKey);

  if (!isValid) {
    console.error('\n❌ Invalid API key. Please check and try again.\n');
    throw new Error('Invalid Gemini API key.');
  }

  // Save the key (encrypted)
  const configDir = resolveGeminiConfigDir(options);
  await mkdir(configDir, { recursive: true });
  const apiKeyPath = getApiKeyPath(configDir);
  await writeSecureCredential(apiKeyPath, { apiKey });

  console.log(`\n✅ API key saved securely to: ${apiKeyPath}`);
  console.log(`────────────────────────────────────────────────────────────\n`);

  return true;
}

/**
 * Clear Gemini authentication data
 */
export async function clearAuth(options?: GeminiAuthOptions): Promise<void> {
  const configDir = resolveGeminiConfigDir(options);
  const apiKeyPath = getApiKeyPath(configDir);

  try {
    await rm(apiKeyPath, { force: true });
  } catch {
    // Ignore removal errors
  }
}

/**
 * Returns the next auth menu action based on current auth state
 */
export async function nextAuthMenuAction(options?: GeminiAuthOptions): Promise<'login' | 'logout'> {
  return (await isAuthenticated(options)) ? 'logout' : 'login';
}
