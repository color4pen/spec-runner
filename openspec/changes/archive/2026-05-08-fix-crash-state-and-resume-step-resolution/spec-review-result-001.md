# Spec Review Result: fix-crash-state-and-resume-step-resolution

- **reviewer**: spec-reviewer
- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-08

## Summary

仕様は 2 つの bug（crash 時 state 遷移漏れ、resume step 解決の不適切なデフォルト）を正確に分析し、コードベースの実際の構造と完全に整合する修正設計を提示している。全コード参照（行番号、API シグネチャ、型定義、既存テスト）を検証し、すべて正確であることを確認した。design.md の 3 つの判断（D1-D3）は既存の transition table・escalation フローを再利用しており、新規コードパスが最小限に抑えられている。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | design.md:45 | D1 の修正後コードで `currentStep` 変数を参照しているが、実際の pipeline.ts の catch ブロック内でこの変数がスコープ内にあるかは実装時に確認が必要。L147 の `const currentStep = step.name;` で宣言されているため問題ないはずだが、spec では明示されていない | implementer が pipeline.ts の catch ブロック内で `currentStep` がスコープ内にあることを確認すれば十分 |
| 2 | LOW | completeness | tasks.md:T3.1-T3.2 | pipeline catch safety net テストのファイル配置が「`tests/unit/core/pipeline/` 配下に新規または既存ファイルに追加」と曖昧。既存の pipeline テストファイル有無によって判断が変わる | implementer が既存テスト構造を確認し適切な配置を判断すれば十分。実装の柔軟性を残す意図として妥当 |

## Assessment

### completeness: PASS
- request の全 11 要件（pipeline catch 2 件、resume 分岐 4 件、テスト 5 件）が proposal/design/tasks に網羅されている
- 受け入れ基準 7 項目すべてに対応するタスクが存在する
- テスト計画（T3.1-T4.4）が各要件を 1:1 でカバー。加えて T4.3 で「non-reviewer + iterationsExhausted > 0」の edge case も追加しており、仕様外の境界条件まで考慮されている
- スコープ外の明示（`--message` オプション、cancel コマンド）が request と proposal で一貫している

### consistency: PASS
- design.md のコード参照（L79-87, L154-160, L306-308, L365-369, L228）が実際の pipeline.ts と完全一致
- `JobStateStore.fail()` のシグネチャ（`state, errorInfo, step?`）が実コードと一致
- `ResumePoint` の型定義（`step: StepName, reason: string, iterationsExhausted: number`）が実コードと一致
- `STEP_MAPPING` の構造と `ResumeRole` 型が実コードと一致
- 既存テストの `makeResumePoint()` が `iterationsExhausted: 0` をデフォルトとする記述が実コードと一致。design.md の「既存テストの期待値は変わらない」という主張は正しい
- D2 で `status === "running"` チェックにより D1 との二重書き込みを防止する設計は、defense in depth の層構造として整合的

### feasibility: PASS
- 変更対象は 2 ファイル（pipeline.ts, resolve-step.ts）+ テスト 2 ファイル。スコープが明確に限定されている
- D1 は既存の `store.fail()` API を呼ぶだけ。D2 は直接 state オブジェクトを構築して `persist()`。いずれも既存 API の利用であり新規 API 不要
- D3 は `resolveResumeStep()` 内のロジック書き換えのみ。`REVIEWER_STEPS` 定数 1 つの追加で済む
- executor への変更なし（defense in depth の原則を遵守）。影響範囲が pipeline 層に閉じている
- `store.fail()` の冪等性に関する notes for implementer の記載が適切で、二重 persist の懸念を事前解消している

### security: PASS
- 変更は内部 state 管理のみ。認証・入力検証・外部通信への影響なし
- `store.persist()` は `atomicWriteJson()` を使用しており、crash 時の部分書き込みリスクなし
