/**
 * Silent secret input reader.
 *
 * TTY mode: raw stdin, no echo, enter/EOT to confirm, Ctrl-C to abort.
 * Non-TTY mode: read stdin to EOF and trim (cron / script pipe).
 *
 * Streams are injected so the function is testable without real TTY.
 */

export interface SecretInputOptions {
  isTTY: boolean;
  input: NodeJS.ReadableStream & {
    setRawMode?: (mode: boolean) => void;
    resume?: () => void;
    pause?: () => void;
  };
  output: NodeJS.WritableStream;
}

/**
 * Read a secret from the given streams without echoing it to output.
 *
 * - TTY: enables raw mode, reads character-by-character, supports backspace,
 *   confirms on Enter (\r / \n) or EOT (0x04), aborts on Ctrl-C (0x03).
 *   Always restores raw mode to false before returning or throwing.
 * - Non-TTY: reads all available data, trims whitespace.
 *
 * @throws if the user presses Ctrl-C in TTY mode
 */
export async function readSecret(opts: SecretInputOptions): Promise<string> {
  const { isTTY, input, output } = opts;

  if (!isTTY) {
    return readNonTTY(input);
  }

  return readTTY(input, output);
}

// ---------------------------------------------------------------------------
// Non-TTY: read all stdin and trim
// ---------------------------------------------------------------------------

function readNonTTY(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    input.on("data", (chunk: Buffer) => chunks.push(chunk));
    input.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      resolve(raw.trim());
    });
    input.on("error", reject);
    // Resume in case stream was paused
    if (typeof (input as { resume?: () => void }).resume === "function") {
      (input as { resume: () => void }).resume();
    }
  });
}

// ---------------------------------------------------------------------------
// TTY: raw mode, char-by-char, no echo
// ---------------------------------------------------------------------------

function readTTY(
  input: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void },
  output: NodeJS.WritableStream,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chars: string[] = [];

    function cleanup(restoreRaw: boolean): void {
      input.removeAllListeners("data");
      input.removeAllListeners("error");
      if (restoreRaw && typeof input.setRawMode === "function") {
        try {
          input.setRawMode(false);
        } catch {
          // ignore
        }
      }
    }

    if (typeof input.setRawMode === "function") {
      input.setRawMode(true);
    }
    if (typeof (input as { resume?: () => void }).resume === "function") {
      (input as { resume: () => void }).resume();
    }

    input.on("data", (buf: Buffer) => {
      const str = buf.toString("utf-8");
      for (const ch of str) {
        const code = ch.charCodeAt(0);

        if (code === 0x03) {
          // Ctrl-C: abort
          cleanup(true);
          output.write("\n");
          reject(new Error("Aborted by user (Ctrl-C)"));
          return;
        }

        if (code === 0x04 || ch === "\r" || ch === "\n") {
          // EOT or Enter: confirm
          cleanup(true);
          output.write("\n");
          resolve(chars.join(""));
          return;
        }

        if (code === 0x7f || code === 0x08) {
          // Backspace / Delete
          if (chars.length > 0) {
            chars.pop();
          }
          return;
        }

        // Regular character — accumulate, do NOT echo
        chars.push(ch);
      }
    });

    input.on("error", (err) => {
      cleanup(true);
      reject(err);
    });
  });
}
