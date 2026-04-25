# Spec Review Result: 2026-04-24-request-create-propose — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.65 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (initial)
- **agents**: architect, spec-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 5 | 0.25 | 1.25 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **6.65** |

### Category Rationale

**completeness (6)**: All 8 request.md requirements are addressed in delta specs, and 6 acceptance criteria have corresponding scenarios. However, slug derivation algorithm is not specified at the spec level (only in design.md Open Questions), and the `propose-actions.ts` module boundary (`'use server'` directive) is not declared in any spec. The `createRequest()` signature change is underspecified (positional vs options object).

**consistency (5)**: The most significant gap. The `database/spec.md` -- the authoritative schema definition -- has no corresponding delta spec in the change folder. The delta specs for `request-management` and `session-management` add `enabled` column and `'propose'` role respectively, but the `database/spec.md` CHECK constraints and table structure definitions are not updated. This creates conflicting sources of truth that will cause implementation confusion.

**feasibility (8)**: The design leverages proven `startBootstrap()` patterns with clear rollback semantics. Tasks are well-decomposed (9 task groups, 35 subtasks). Dependencies between tasks are implicit but logical. The GitHub Contents API choice is appropriate. The `enabled` JSON TEXT approach is pragmatic for SQLite.

**security (8)**: Authentication and authorization patterns are well-established. `startPropose()` verifies request ownership and draft status. The change-folder-viewer spec explicitly requires ownership verification through the request-repository-user chain. The IDOR pattern from review-lessons is addressed (Non-owned request returns "Request not found" without revealing existence). Security-reviewer was skipped per pipeline-context enabled list, but the spec-level security posture is adequate.

**maintainability (8)**: Clean separation of concerns (request creation vs propose startup per Decision 7). The completion handler pattern (role-based dispatch) scales well for new session types. The change-folder-viewer is a self-contained addition. Design decisions are well-documented with rationale and alternatives considered.

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/.../specs/ | `database/spec.md` の delta spec が欠落している。`requests` テーブルへの `enabled` カラム追加と `sessions.role` CHECK 制約への `'propose'` 追加が database spec に反映されていない。database/spec.md が正のスキーマ定義であり、request-management や session-management の delta spec だけでは CHECK 制約の更新が漏れる | `specs/database/spec.md` を change folder に追加し、MODIFIED Requirements として (1) requests テーブル構造に `enabled` (TEXT, nullable) を追加 (2) sessions.role CHECK 制約に `'propose'` を追加 の 2 シナリオを記述する |
| 2 | MEDIUM | completeness | openspec/changes/.../specs/propose-session/spec.md | slug 導出アルゴリズムが spec レベルで未定義。design.md の Open Questions に `YYYY-MM-DD-{title-to-kebab-case}` と記載があるが、具体的な変換ルール（特殊文字の扱い、長さ上限、日本語入力の制限、重複時の挙動）が仕様化されていない。session-completion-handler が branch name を再構築する際に slug の決定的な導出が必要 | propose-session/spec.md に slug 導出のシナリオを追加する: (1) 英数字とハイフンのみ許可 (2) 長さ上限（例: 50 文字） (3) slug は request レコードに保存するか、決定的導出で毎回算出するかを確定 (4) 重複時の挙動（suffix 付与 or reject） |
| 3 | MEDIUM | completeness | openspec/changes/.../specs/propose-session/spec.md | `propose-actions.ts` の `'use server'` 宣言方針が spec に未記載。review-lessons の「モジュールの `'use server'` 宣言はセキュリティ設計の一部として仕様段階で決定する」に抵触。`startPropose()` は Server Action（`getAuthenticatedUser()` 呼び出し必要）、`getChangeFolderFiles()` / `getChangeFolderFileContent()` も Server Action（所有権検証必要）として設計されるべき | propose-session/spec.md に Module Design セクションを追加し、`propose-actions.ts` は `'use server'` ファイルであることを明記する。change-folder-viewer/spec.md にも Server Action のシグネチャを記述する |
| 4 | MEDIUM | maintainability | openspec/changes/.../specs/request-management/spec.md | `createRequest()` の引数拡張が位置引数（5 番目の optional parameter）として設計されている。既存の 4 引数 `(repositoryId, type, title, content)` に `enabled` を追加すると、将来の引数追加で fragile になる。options object パターンへの移行を推奨 | `createRequest(repositoryId, options: { type, title, content, enabled? })` のようなオブジェクト引数パターンに変更する。既存の呼び出し元（bootstrap-actions.ts の直接 DB insert は createRequest を経由しないため影響なし）の修正は限定的 |
| 5 | LOW | completeness | openspec/changes/.../specs/github-api-lib/spec.md | `getDirectoryContents()` の GitHub Contents API は 1 ディレクトリあたり最大 1000 エントリの制限がある。change folder の規模では問題にならないが、制約として spec に記載すべき | github-api-lib/spec.md に「GitHub Contents API は 1 ディレクトリあたり最大 1000 エントリを返す。超過時は Git Trees API への切り替えが必要」の注記を追加 |
| 6 | LOW | consistency | openspec/changes/.../specs/session-completion-handling/spec.md | propose 完了後の request status が `in-progress` 維持だが、次の遷移トリガー（spec-review セッション開始）が本 request の scope 外であることが明示されていない。design.md の Non-Goals に「セッション2以降の実装」はあるが、session-completion-handling spec 側にも注記があると実装者が迷わない | session-completion-handling/spec.md の propose completion シナリオに「Note: request の次の status 遷移（in-progress -> reviewing）は後続セッション（spec-review）の実装時に追加される」の注記を追加 |

## Iteration Comparison

(Initial iteration -- no comparison)

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.65 | needs-fix | database delta spec 欠落、slug 導出未定義、module boundary 未宣言 |

## Convergence

- **trend**: — (initial)
- **recommendation**: continue (fix findings and re-review)

### Blocking Path

Finding #1 (HIGH: database/spec.md delta 欠落) が解消されれば consistency スコアが 7+ に改善し、Total が 7.0 threshold を超える見込み。MEDIUM findings (#2, #3, #4) も併せて修正すれば 7.5+ が期待できる。

## Summary

設計の全体方針は堅実で、bootstrap フローの実績パターンを効果的に再利用している。feasibility と security は高水準。主要な阻害要因は **database/spec.md の delta spec 欠落** (HIGH) であり、これにより既存の CHECK 制約定義と delta spec の間に不整合が生じている。MEDIUM findings として slug 導出の仕様化、`'use server'` 境界の明示、`createRequest()` 引数設計がある。いずれも spec-fixer で対応可能な範囲であり、1 回の修正イテレーションで approved に到達する見込みが高い。
