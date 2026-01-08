/**
 * Clipboard Utilities
 *
 * Cross-platform clipboard support for copying text.
 * Supports macOS (osascript), Linux (wl-copy, xclip, xsel, clip.exe for WSL),
 * and Windows (PowerShell).
 */

/**
 * Get the clipboard copy method based on OS (lazy loaded)
 */
function getClipboardCopyMethod(): ((text: string) => Promise<void>) | null {
  const os = process.platform;

  if (os === 'darwin' && Bun.which('osascript')) {
    return async (text: string) => {
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await Bun.$`osascript -e 'set the clipboard to "${escaped}"'`.nothrow().quiet();
    };
  }

  if (os === 'linux') {
    if (process.env.WAYLAND_DISPLAY && Bun.which('wl-copy')) {
      return async (text: string) => {
        const proc = Bun.spawn(['wl-copy'], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
    }
    if (Bun.which('xclip')) {
      return async (text: string) => {
        const proc = Bun.spawn(['xclip', '-selection', 'clipboard'], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
    }
    if (Bun.which('xsel')) {
      return async (text: string) => {
        const proc = Bun.spawn(['xsel', '--clipboard', '--input'], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
    }
    if (Bun.which('clip.exe')) {
      return async (text: string) => {
        const proc = Bun.spawn(['clip.exe'], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
    }
  }

  if (os === 'win32' && Bun.which('powershell')) {
    return async (text: string) => {
      const escaped = text.replace(/"/g, '""');
      await Bun.$`powershell -command "Set-Clipboard -Value \"${escaped}\""`.nothrow().quiet();
    };
  }

  return null;
}

let clipboardMethod: ((text: string) => Promise<void>) | null | undefined;

/**
 * Copy text to the system clipboard
 *
 * @param text - The text to copy
 * @returns Promise that resolves when the copy is complete (or no-op if no clipboard available)
 */
export async function copyToSystemClipboard(text: string): Promise<void> {
  if (clipboardMethod === undefined) {
    clipboardMethod = getClipboardCopyMethod();
  }
  if (clipboardMethod) {
    await clipboardMethod(text);
  }
}

/**
 * Generate OSC52 escape sequence for terminal clipboard copy
 *
 * @param text - The text to copy
 * @returns The OSC52 escape sequence string
 */
export function generateOSC52Sequence(text: string): string {
  const base64 = Buffer.from(text).toString('base64');
  const osc52 = `\x1b]52;c;${base64}\x07`;
  // Wrap for tmux if needed
  return process.env.TMUX ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52;
}
