import { RuleRegistry } from "../../core/validation/registry.js";
import type { ParsedRequestRaw, RequestMdViolation } from "./types.js";
import { titleRequired } from "./title-required.js";
import { typeRequired } from "./type-required.js";
import { typeKnown } from "./type-known.js";
import { slugRequired } from "./slug-required.js";
import { baseBranchRequired } from "./base-branch-required.js";
import { adrRequired } from "./adr-required.js";
import { adrValid } from "./adr-valid.js";

export function createRequestMdRegistry(): RuleRegistry<ParsedRequestRaw, RequestMdViolation> {
  const registry = new RuleRegistry<ParsedRequestRaw, RequestMdViolation>();
  registry.register(titleRequired);
  registry.register(typeRequired);
  registry.register(typeKnown);
  registry.register(slugRequired);
  registry.register(baseBranchRequired);
  registry.register(adrRequired);
  registry.register(adrValid);
  return registry;
}

export type { ParsedRequestRaw, RequestMdViolation };
