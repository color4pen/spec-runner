import { loadConfig } from "../../config/store.js";
import { SpecRunnerError } from "../../errors.js";
import * as manager from "../request/manager.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

export async function executeCreate(
  text: string | null,
  opts: { stdin: boolean; cwd: string },
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
    process.stderr.write(`Error: テキスト引数（"<text>"）または --stdin フラグが必要です\n`);
    return 1;
  }

  // (d) Load config
  let config: SpecRunnerConfig;
  try {
    config = await loadConfig();
  } catch {
    config = {} as SpecRunnerConfig;
  }

  // (e) Create request
  try {
    const slug = await manager.create(resolvedText, opts.cwd, config);
    process.stdout.write(`${slug}\n`);
    return 0;
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\nHint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    return 1;
  }
}
