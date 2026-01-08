/**
 * Control Bus Listeners for Workflow Runner
 *
 * Extracted from runner.ts to reduce file size and improve modularity.
 * Handles pause, skip, stop, and mode change events from the control bus.
 */

import { debug } from '../../shared/logging/logger.js';
import { getControlBus } from '../control/index.js';
import type { StateMachine } from '../state/index.js';

/**
 * Options for setting up control bus listeners
 */
export interface ListenerSetupOptions {
  machine: StateMachine;
  getAbortController: () => AbortController | null;
  setPauseRequested: (value: boolean) => void;
  setAutoMode: (enabled: boolean) => Promise<void>;
}

/**
 * Result of listener setup - includes cleanup function
 */
export interface ListenerSetupResult {
  cleanup: () => void;
}

/**
 * Set up control bus event listeners for workflow control
 *
 * @param options - Configuration for the listeners
 * @returns Object with cleanup function to remove listeners
 */
export function setupControlBusListeners(options: ListenerSetupOptions): ListenerSetupResult {
  const { machine, getAbortController, setPauseRequested, setAutoMode } = options;
  const controlBus = getControlBus();
  const unsubscribers: (() => void)[] = [];

  // Pause listener with error boundary
  unsubscribers.push(controlBus.on('pause', () => {
    try {
      debug('[Runner] Pause requested');
      setPauseRequested(true);
      getAbortController()?.abort();
    } catch (err) {
      debug('[Runner] Error in pause handler: %s', err);
    }
  }));

  // Skip listener with error boundary
  unsubscribers.push(controlBus.on('skip', () => {
    try {
      debug('[Runner] Skip requested');
      getAbortController()?.abort();
    } catch (err) {
      debug('[Runner] Error in skip handler: %s', err);
    }
  }));

  // Stop listener with error boundary
  unsubscribers.push(controlBus.on('stop', () => {
    try {
      debug('[Runner] Stop requested');
      getAbortController()?.abort();
      machine.send({ type: 'STOP' });
    } catch (err) {
      debug('[Runner] Error in stop handler: %s', err);
    }
  }));

  // Mode change listener with error boundary
  unsubscribers.push(controlBus.on('mode-change', async (data) => {
    try {
      debug('[Runner] Mode change: autoMode=%s', data.autonomousMode);
      // If in waiting state, let the provider's listener handle it
      // The provider will return __SWITCH_TO_AUTO__ or __SWITCH_TO_MANUAL__
      // and handleWaiting() will call setAutoMode()
      if (machine.state === 'waiting') {
        debug('[Runner] In waiting state, provider will handle mode switch');
        return;
      }
      // In other states (running, idle), set auto mode directly
      await setAutoMode(data.autonomousMode);
    } catch (err) {
      debug('[Runner] Error in mode change handler: %s', err);
    }
  }));

  // Return cleanup function
  const cleanup = () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };

  return { cleanup };
}

/**
 * Set up mode change listener for resume-with-input scenarios
 *
 * @param onModeChange - Callback when mode change is requested during execution
 * @returns Unsubscribe function
 */
export function setupModeChangeListener(
  getAbortController: () => AbortController | null,
  onModeChange: (mode: 'manual' | 'auto') => void
): () => void {
  const controlBus = getControlBus();

  return controlBus.on('mode-change', (data) => {
    debug('[Runner] Mode change during resumeWithInput: autoMode=%s', data.autonomousMode);
    onModeChange(data.autonomousMode ? 'auto' : 'manual');
    // Abort the current step execution
    getAbortController()?.abort();
  });
}
