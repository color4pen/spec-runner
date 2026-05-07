# Spec Review Result: branch-jobid-collision-fix

- **reviewer**: spec-reviewer
- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-07

## Summary

仕様は request の要件を正確に網羅し、既存コードとの整合性を十分に検証している。design.md の 5 つの判断はすべて合理的で、tasks.md の実装指示は既存コード構造と一致する。delta spec 4 本も対象 base spec の責務・スコープに適合している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | tasks.md:34 | T2.2 の説明で「executor.ts line 163-165 で buildMessage が呼ばれる」と記載しているが、実際には adapter layer（`agent-runner.ts:105` / `:309`）で呼ばれる。executor.ts 自身に buildMessage 呼び出しはない | T2.2 の説明を「adapter の runner.run() 内で step.buildMessage が呼ばれる」に修正。実装指示自体（propose.ts の buildMessage を修正する）は正しいので影響は軽微 |
| 2 | LOW | completeness | tasks.md:T4.4 | 既存テストの branch 名アサーション更新が「確認し、必要に応じて」と曖昧。executor.test.ts に `feat/${slug}` を assert するテストが存在する場合、更新が必須になる | `tests/unit/step/executor.test.ts` 内の setsBranch テストを具体的に特定し、新フォーマットへの更新を明示指示にする |
| 3 | LOW | consistency | specs/step-execution-architecture/spec.md:17-24 | Scenario 2 で `{{BRANCH}}` placeholder と記載しているが、実際の propose-system.ts テンプレートの placeholder 表記と一致するか未検証（LOW — delta spec は意図の記述であり実装差異は implementer が吸収する） | 実装時に propose-system.ts のテンプレート変数名と照合すれば十分 |

## Assessment

### completeness: PASS
- request の全 7 要件（branch 名変更・slug 逆算修正 4 箇所・delta spec 4 本・テスト）が tasks.md に網羅されている
- 受け入れ基準 6 項目すべてに対応するタスクが存在する

### consistency: PASS
- delta spec 4 本が各 base spec の責務範囲に整合
- `stripJobIdSuffix` を `job-slug.ts` に集約する設計は既存の `stripBranchPrefix` と同一モジュールで一貫性あり
- 後方互換性（suffix なし branch で no-op）が全 delta spec で明示されている

### feasibility: PASS
- 実装変更は 5-6 ファイル、コア修正は正規表現 1 本 + 消費箇所 3-4 行の pipe 追加
- `state.jobId` が `buildMessage` の `state` 引数経由でアクセス可能であることを確認済み
- 型チェック・テストで漏れを検出可能な変更スコープ
