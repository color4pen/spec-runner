import * as manager from "../request/manager.js";
import { stdoutWrite } from "../../logger/stdout.js";

export async function executeList(cwd: string): Promise<number> {
  const requests = await manager.list(cwd);

  if (requests.length === 0) {
    stdoutWrite("(no active requests)\n");
    return 0;
  }

  const header = `${"SLUG".padEnd(24)}TYPE\n`;
  stdoutWrite(header);

  for (const req of requests) {
    const line = `${req.slug.padEnd(24)}${req.type}\n`;
    stdoutWrite(line);
  }

  return 0;
}
