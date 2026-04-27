import { registerCustomTool } from "./registry.js";
import { registerBranchTool } from "./register-branch.js";

/**
 * Bootstrap: register all custom tools.
 * Must be called during app startup (init and run commands).
 */
export function bootstrapTools(): void {
  registerCustomTool(registerBranchTool);
}

export { getDefinitions, getHandler } from "./registry.js";
export { registerBranchTool } from "./register-branch.js";
