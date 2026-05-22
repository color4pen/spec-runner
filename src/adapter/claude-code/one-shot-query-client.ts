/**
 * ClaudeCodeOneShotQueryClient: concrete implementation of OneShotQueryClient
 * for the local Claude Code runtime.
 *
 * Delegates to queryOneShot() — adapter-internal execution infrastructure.
 * Core layer never imports this class directly; it is injected at composition points.
 */
import type { OneShotQueryClient, OneShotQueryOptions, OneShotQueryResult } from "../../core/port/one-shot-query-client.js";
import { queryOneShot } from "./query-one-shot.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

export class ClaudeCodeOneShotQueryClient implements OneShotQueryClient {
  constructor(private readonly config: SpecRunnerConfig) {}

  async run(opts: OneShotQueryOptions): Promise<OneShotQueryResult> {
    return queryOneShot(opts, this.config);
  }
}
