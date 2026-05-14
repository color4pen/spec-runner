import * as manager from "../request/manager.js";

export async function executeList(cwd: string): Promise<number> {
  const requests = await manager.list(cwd);

  if (requests.length === 0) {
    process.stdout.write("(no active requests)\n");
    return 0;
  }

  const header = `${"SLUG".padEnd(24)}${"TYPE".padEnd(14)}STATE\n`;
  process.stdout.write(header);

  for (const req of requests) {
    const line = `${req.slug.padEnd(24)}${req.type.padEnd(14)}${req.state}\n`;
    process.stdout.write(line);
  }

  return 0;
}
