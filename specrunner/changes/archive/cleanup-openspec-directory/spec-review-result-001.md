# Spec Review Result: cleanup-openspec-directory (Iteration 001)

- **verdict**: approved
- **review-mode**: lightweight (behavior-preserving refactoring)
- **reviewed-artifacts**: request.md, design.md, tasks.md
- **date**: 2026-05-11

## Summary

仕様は明確で実装可能。request の 6 要件が design の 7 判断と tasks の 8 タスクに適切に分解されている。コードベース実査で設計判断の妥当性を確認済み。CRITICAL/HIGH の指摘なし。

## Review Scope

| Category | Scope | Result |
|----------|-------|--------|
| architecture | verify | pass |
| correctness | verify | pass (minor findings) |
| completeness | simplified (task decomposition only) | pass |
| consistency | skip | — |
| feasibility | skip | — |
| security | skip | — |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | request.md:28, design.md:11,17 | 件数の不一致。request.md「baseline spec 47 本」→ 実測 45。design.md「27 件 active change」→ 実測 25（archive 除外）。実装には影響しない（タスクは動的列挙）がドキュメントが不正確 | request.md の「47 本」を「45 件」に、design.md D1 の「27 件」を「25 件」に修正 |
| 2 | LOW | architecture | tasks.md:53 (T-06) | T-06 で import を `import { changesDirRel, changeFolderPath }` に変更するが、`changeFolderPath` は propose-system.ts 内で未使用（既存の dead import）。リファクタリングの機会に除去が望ましい | import を `import { changesDirRel }` のみにし、dead import を除去する |

## Architecture Assessment

- **設計パターン**: 適切。各ファイルの責務境界に沿った変更（paths.ts=定数、dynamic-context.ts=収集、propose-system.ts=プロンプト構築）
- **責務分離**: `specsDirRel()` の除去により deprecated パスへの依存が 3 ファイルから完全に消える。依存方向に問題なし
- **D1 (git mv)**: 衝突回避ルール（同名除外）が定義済み。git history 追跡が保たれる正しい選択
- **D5 (Delta Spec Rules)**: baseline spec 不在に合わせた Rule 3 削除と Rule 7 簡素化は論理的に整合
- **D6 (doctor check)**: `specrunner/changes/` の存在チェックを warn レベルで追加。既存の requests チェックとの一貫性あり

## Correctness Assessment

- **T-04 export list**: `SPECS_DIR` と `specsDirRel` 除去後の残存 export が正確に列挙されている
- **T-05 DynamicContext**: `specsList` フィールド除去後の 3 フィールド構成（gitLog, diffStat, changesList）が正確
- **T-06 buildInitialMessage**: `dynamicContext` 引数型から `specsList` を除去する指示あり。呼び出し元（propose.ts:64）は `deps.dynamicContext` をそのまま渡しており、DynamicContext interface から specsList が消えれば自動的に型整合する
- **T-01 衝突検出**: `specrunner/changes/` に既存の `cleanup-openspec-directory` と `test-slug` を除外対象として明示。実測でこの 2 件のみが存在することを確認

## Completeness Assessment (Task Decomposition)

| Request 要件 | 対応タスク | 判定 |
|-------------|-----------|------|
| 1. active change の移行 | T-01 | covered |
| 2. openspec/changes/ の削除 | T-02 | covered |
| 3. openspec/specs/ の削除 | T-03 | covered |
| 4. paths.ts の fallback 除去 | T-04 | covered |
| 5. doctor チェックの更新 | T-07 | covered |
| 6. openspec/project.md 据え置き | D7 (non-action) | covered |
| 受け入れ基準: typecheck + test | T-08 | covered |
| (派生) dynamic-context.ts cleanup | T-05 | covered — specsDirRel 消費者の必然的修正 |
| (派生) propose-system.ts cleanup | T-06 | covered — specsDirRel 消費者の必然的修正 |
