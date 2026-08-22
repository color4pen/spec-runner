/**
 * Rollover continuation prompt for ClaudeCodeRunner fresh-session rollover.
 *
 * Pure module — no I/O, no SDK imports, no src/ module imports (adapter-local pattern).
 * Follows the same design philosophy as completion-directive.ts.
 *
 * Design D5 (design.md): rollover prompt instructs the fresh agent to:
 * 1. Check git status / git diff to see existing changes in the worktree
 * 2. Check tasks.md to identify incomplete tasks
 * 3. Preserve existing changes (do NOT revert) and continue implementation
 * 4. Produce the normal completion report after all tasks are done
 *
 * COMMIT_DISCIPLINE: must never instruct the agent to run git add / git commit / git push.
 * The executor handles commit after the agent session completes successfully.
 */

/**
 * Build the rollover continuation section for a fresh session prompt.
 *
 * @param input.attempt     - 1-based rollover attempt number.
 * @param input.maxRollovers - Maximum number of rollovers allowed.
 * @returns Japanese-language section string to inject into the fresh session prompt.
 */
export function buildRolloverContinuationSection(input: {
  attempt: number;
  maxRollovers: number;
}): string {
  const { attempt, maxRollovers } = input;
  return `
<rollover-context>
前のセッション（ロールオーバー ${attempt}/${maxRollovers}）がコンテキストウィンドウを使い切ったため、新しいセッションで作業を継続しています。

worktree には前のセッションが書き出した未コミットの変更が存在する可能性があります。それらの変更は作業の正本であり、revert せずにそのまま保持してください。変更が無ければそのまま作業を続けてください。

作業を再開する手順:
1. git status および git diff を確認し、worktree 上の既存変更を把握する
2. tasks.md を確認し、未完了のタスクを特定する
3. 既存の変更を保持したまま、未完了タスクの続きを実装する
4. 全タスクが完了したら、通常どおり completion report を返す

注意: git commit を実行しないでください。git push も実行しないでください。commit は pipeline が行います。
</rollover-context>`;
}
