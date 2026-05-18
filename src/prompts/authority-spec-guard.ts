/**
 * Authority spec edit guard rule injected into agent step prompts.
 * Centralizes the "no direct authority spec edits" rule.
 */
export const AUTHORITY_SPEC_GUARD_RULE = `## authority spec の編集禁止

\`specrunner/specs/\` 配下のファイルを直接編集してはならない（MUST NOT）。
spec の変更は delta spec（\`specrunner/changes/<slug>/specs/<capability>/spec.md\`）を作成・編集する。
authority spec への直接編集は executor が commit 前に検出し、ステップを halt する。
`;
