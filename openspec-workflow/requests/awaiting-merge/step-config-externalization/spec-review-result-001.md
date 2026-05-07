# Spec Review Result: step-config-externalization — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.95 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (initial)
- **agents**: architect, spec-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 9 | 0.20 | 1.80 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 8 | 0.10 | 0.40 |
| **Total** | | | **6.95** |

### Category Notes

- **completeness (6)**: request.md の 13 要件は delta spec でカバーされているが、steps config の input validation scenario が完全に欠落している。既存 validateConfig() が pipeline.maxRetries で同種の range/type check を行っている前例がある以上、steps セクションにも同等の validation を spec で定義すべき。
- **consistency (7)**: MODIFIED header が main spec と一致。用語・パターンも既存 spec と整合。ただし managed runtime 時の steps 設定の扱いが未定義で、既存の runtime 別分岐パターン（apiKey 省略等）との整合が不足。
- **feasibility (9)**: 4 段階解決チェーンは既存パターン（getMaxRetries）と同構造で実現可能性が高い。純粋関数設計によりテスタビリティも確保。module-analysis の分割判断は実コードと整合。
- **security (8)**: config は ~/.config/specrunner/ に 0600 で保存される既存ガードが適用される。steps セクションに機密情報は含まれない。input validation 不足は completeness で扱う。
- **maintainability (8)**: Step オブジェクトを config-agnostic に保つ設計は保守性が高い。Record ベースの StepConfigMap は step 追加時の型変更が不要。design.md の D1-D5 は明確で将来の拡張に対応可能。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | openspec/changes/step-config-externalization/specs/cli-config-store/spec.md | steps config の validation scenario が未定義。maxTurns に負数・0・文字列、model に空文字列、timeoutMs に負数を設定した場合の挙動が spec に不在。既存 validateConfig() は pipeline.maxRetries で型・範囲検証を行っており、steps にも同等の validation が必要 | cli-config-store delta spec の ADDED Requirements に「step 実行パラメータの値検証」Requirement を追加する。maxTurns: number (>0) \| null、model: non-empty string、timeoutMs: number (>0) \| null を MUST とし、違反時は CONFIG_INVALID エラーを throw する Scenario を追加する |
| 2 | MEDIUM | consistency | openspec/changes/step-config-externalization/specs/cli-config-store/spec.md | runtime: "managed" 時に config.steps を設定した場合の挙動が未定義。既存 spec は runtime 別の分岐を明確に定義しており（apiKey 省略、agents 省略等）、steps も同様に runtime 別の扱いを spec で明確化すべき | cli-config-store delta spec に Scenario を追加: runtime: "managed" 時に steps 設定が存在する場合は「ClaudeCodeRunner のみで効果を持つ。ManagedAgentRunner では無視される」旨を NOTE として明記する。あるいは config 読み込み時に stderr warning を出す Scenario を追加する |
| 3 | LOW | completeness | openspec/changes/step-config-externalization/specs/cli-config-store/spec.md | getStepExecutionConfig の stepDefaults 引数に timeoutMs が含まれない場合の解決挙動が暗黙的。design.md D2 では stepDefaults に model と maxTurns のみ明示しているが、spec の解決順序 Requirement では 3 フィールドすべてが同じチェーンで解決されるように読める | stepDefaults の型を spec で明示する: `{ model: string; maxTurns?: number; timeoutMs?: number }` とし、timeoutMs が stepDefaults に不在の場合は null（no timeout）にフォールバックすることを解決順序 Requirement のステップ 4 で明記済みであることを確認する（現状は記載済みだが design.md との乖離を解消する） |

## Iteration Comparison

(initial iteration — no comparison)

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.95 | needs-fix | HIGH: steps validation 未定義 |

## Convergence

- **trend**: — (initial)
- **recommendation**: continue (spec-fixer で修正後に再レビュー)

## Summary

設計の方向性は適切で、既存パターンとの整合性・実現可能性は高い。主要な不足は steps config の input validation の spec 定義欠落（HIGH #1）。既存 validateConfig() が pipeline.maxRetries で同等の検証を行っている前例があり、steps にも maxTurns/model/timeoutMs の型・範囲検証を追加する必要がある。managed runtime 時の steps 設定の扱いも明確化が望ましい（MEDIUM #2）。
