import { SpecRunnerError } from "../../errors.js";
import * as manager from "../request/manager.js";
import type { OneShotQueryClient } from "../port/one-shot-query-client.js";
import { stderrWrite, logResult, logError } from "../../logger/stdout.js";

export async function executeCreate(
  text: string | null,
  opts: { stdin: boolean; cwd: string },
  client: OneShotQueryClient,
): Promise<number> {
  let resolvedText: string | null = text;

  // (b) Read from stdin if --stdin and no positional
  if (resolvedText === null && opts.stdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    resolvedText = Buffer.concat(chunks).toString("utf-8");
  }

  // (c) Error if neither text nor --stdin
  if (resolvedText === null) {
    logError(`テキスト引数（"<text>"）または --stdin フラグが必要です`);
    return 1;
  }

  // (d) Create request
  try {
    stderrWrite("Generating request.md...");
    const slug = await manager.create(resolvedText, opts.cwd, client);
    stderrWrite("✓ Generated " + slug);
    logResult(slug);
    return 0;
  } catch (err) {
    stderrWrite("✗ Failed: " + (err instanceof Error ? err.message : String(err)));
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
    } else {
      logError(err instanceof Error ? err.message : String(err));
    }
    return 1;
  }
}
