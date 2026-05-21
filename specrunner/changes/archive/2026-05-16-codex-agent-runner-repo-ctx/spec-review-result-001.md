# Spec Review Result: codex-agent-runner-repo-ctx

- **verdict**: needs-fix

## Summary

設計判断・伝搬経路の分析・スコープ外の切り分けは的確。ソースコードの行番号も全て正確。ただし spec authority の更新漏れが 1 件あり、テスト影響範囲の列挙が大幅に不足している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | specrunner/changes/codex-agent-runner-repo-ctx/request.md (要件9) | `specrunner/specs/step-execution-architecture/spec.md` が `StepContext` の定義 (L319: `repo: OriginInfo`) とシナリオ (L336, L354) で `repo` を明示参照している。request は `agent-runner-port/spec.md` と `spec-review-session/spec.md` のみ調査対象としており、この spec を見落としている。design.md の "Not Changed" セクションも「該当 spec に記述なし。MODIFIED 不要」と誤記。 | 要件 9 の調査対象に `specrunner/specs/step-execution-architecture/spec.md` を追加し、MODIFIED delta で `repo: OriginInfo` を StepContext 定義・シナリオから削除する旨を記述する。design.md の "Not Changed" から該当行を "Affected Files" に移動する。 |
| 2 | MEDIUM | completeness | specrunner/changes/codex-agent-runner-repo-ctx/tasks.md (Task 10) | テスト fixture 更新対象が 6 ファイルしか列挙されていないが、実際には `tests/unit/step/` 配下だけで 13 ファイル (executor.test.ts, review-exit-contract.test.ts, code-review.test.ts, build-fixer.test.ts, spec-fixer.test.ts, code-fixer.test.ts, implementer.test.ts, verification.test.ts, pr-create.test.ts, code-review-verdict.test.ts, commit-and-push.test.ts, spec-review-lightweight.test.ts) + `tests/spec-review-step.test.ts` が `repo:` を含む fixture を持つ。design.md Affected Files も同様に不足。 | Task 10 のファイルリストを `grep -rn "repo:" tests/` の実結果で網羅的に更新する。または「`bun run typecheck` で検出される全 fixture を対象とする」と明示し、列挙を省略する方針に切り替える。 |
| 3 | LOW | accuracy | specrunner/changes/codex-agent-runner-repo-ctx/design.md (Affected Files) | design.md Affected Files に `tests/unit/step/` 配下のテストが一切含まれていない。tasks.md 側で列挙する方針であっても、design の影響範囲表にテストディレクトリ丸ごと欠落は読み手を誤解させる。 | Affected Files に `tests/unit/step/*.test.ts` (fixture `repo:` 削除) を 1 行追加する。 |
