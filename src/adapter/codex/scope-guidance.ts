/**
 * Provider-level scope discipline guidance for the Codex adapter.
 *
 * This module is applied ONLY when steps are executed via the Codex provider (OpenAI).
 * It MUST NOT be imported from the Claude adapter, the managed agent adapter, or any
 * shared/core module outside `src/adapter/codex/`.
 *
 * Design references: D1 (no step-level routing — injected unconditionally for all Codex steps),
 * D3 (single-source constant module, same pattern as completion-report-prompt.ts),
 * D7 (text taken verbatim from request.md).
 */

/**
 * Scope discipline guidance injected into every Codex adapter main work turn prompt.
 *
 * Codex provider-specific: applied unconditionally to all agent steps executed via this adapter.
 * Claude / managed adapter MUST NOT reference this constant or import this module.
 */
export const CODEX_SCOPE_GUIDANCE: string =
  `SpecRunner execution guidance:

- Do not invent requirements beyond the supplied request/spec/reviewer criteria.
- Prioritize issues that materially affect correctness or normal supported execution.
- Do not promote merely theoretical, extremely unlikely, or speculative edge cases to blocking findings.
- A finding must explain the concrete user/runtime impact that justifies changing the implementation.
- If an issue is technically possible but does not justify blocking completion, report it as an observation or omit it.
- Do not broaden the scope in order to make the implementation more defensive or general.`;
