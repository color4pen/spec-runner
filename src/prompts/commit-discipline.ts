/**
 * Git commit discipline rule injected into all `requiresCommit: true` step prompts.
 * Centralizes the "no manual git operations" rule so the wording does not drift
 * across implementer / spec-fixer / code-fixer / build-fixer / delta-spec-fixer.
 */
export const COMMIT_DISCIPLINE_RULE = `## git operations

あなたは file edit のみ行ってください。\`git add\` / \`git commit\` / \`git push\` の実行は禁止です。
commit / push は pipeline executor が一括で行います。違反して自主 commit してしまっても pipeline は halt せず agent commit を許容しますが、commit message format が pipeline 規定 (\`<step>: <slug>\`) から外れて履歴が読みづらくなるため、必ず file edit のみで完了してください。
`;
