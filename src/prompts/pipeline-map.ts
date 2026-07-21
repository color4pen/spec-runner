/**
 * Pipeline map — single source of truth for the step enumeration.
 * Leaf module: no project-internal imports.
 *
 * Imported by: rules.ts, design-system.ts, implementer-system.ts,
 *              test-materialize-system.ts
 *
 * Each row lists the step identifier and its one-line responsibility.
 */

export const PIPELINE_MAP = `| Step | 責務 |
|------|------|
| request-review | request.md の品質と正確性を評価し、パイプライン実行可否を判定する |
| design | change folder（design.md / tasks.md / spec.md）を設計・生成する |
| spec-review | change folder の成果物を評価し、仕様の品質を判定する |
| spec-fixer | spec-review の findings を修正する |
| test-case-gen | spec Scenario と設計から TC を生成し test-cases.md を出力する |
| test-materialize | test-cases.md の must TC をテストコードに変換して書き出す |
| implementer | tasks.md のタスクを実装し、ソースコードを worktree に書き出す |
| verification | ビルド・テスト・lint を実行し結果を記録する（CLI step） |
| build-fixer | verification の失敗を機械的に修正する |
| code-review | 実装を評価し、コード品質の findings を出力する |
| code-fixer | code-review / custom reviewer の findings を修正する |
| custom-reviewer | カスタム定義の観点で実装を評価する |
| regression-gate | findings ledger の全修正が最終コードに残っているかを確認する |
| conformance | 4 成果物（request / design / tasks / spec）への適合性を検証する |
| adr-gen | ADR-worthy な設計判断を判定し、該当する場合 ADR を生成する |
| pr-create | GitHub PR を作成する（CLI step） |`;
