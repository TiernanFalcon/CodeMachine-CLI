/**
 * Test Setup
 *
 * This file is preloaded before running tests.
 * It sets up environment variables and other test configuration.
 */

// Enable mock engine for testing
process.env.CODEMACHINE_ENABLE_MOCK_ENGINE = '1';

// Set test environment
process.env.NODE_ENV = 'test';
