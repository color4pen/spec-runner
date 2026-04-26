# Spec Review Result: slug-delegation-and-branch-tracking — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.9 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (initial)
- **agents**: architect, spec-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 7 | 0.15 | 1.05 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **6.90** |

### Category Rationale

**completeness (6)**: request.md の 8 要件は全て delta spec に反映されているが、RequestSummary / RequestDetail 型の拡張が tasks.md にしか記載されておらず delta spec が欠落している。また register_branch の冪等性（同一 request_id への複数回呼び出し）が未定義。change folder viewer の slug 抽出ロジックが「extracting the slug portion after the prefix」と曖昧で、具体的なアルゴリズムが未記載。

**consistency (7)**: 既存 spec（database/spec.md, propose-session/spec.md, session-completion-handling/spec.md, change-folder-viewer/spec.md）との整合性は概ね良好。DB スキーマ変更の delta spec は既存カラム列挙を含めて正確。custom-tool-handler.ts の module directive 方針は session-completion-handler.ts と一致。ただし branch-registration spec 内で request_id の型記述に揺れがある（integer vs string-or-integer）。

**feasibility (8)**: tasks.md のタスク分解は 9 セクション・計 18 タスクで適切な粒度。依存関係も自然な順序（DB -> handler -> tool -> SSE -> propose -> completion -> viewer -> UI -> tests）。SDK の Custom Tools フローは ADR-20260424 で調査済み。Decision 6 の Agent tools 配列は実装時検証が明記されており現実的。

**security (7)**: custom-tool-handler.ts を 'use server' なしの lib モジュールとする方針は constraints.md に適合。パストラバーサル防止の既存仕様は維持。register_branch の入力バリデーション（slug kebab-case パターン、空値拒否）は具体的。ただし register_branch の request_id に対する所有権検証（呼び出し元の session がその request に紐づくか）の仕様が明示されていない。

**maintainability (7)**: custom-tool-handler.ts のディスパッチャパターンは session-completion-handler.ts と対称的で一貫性がある。��ォールバック戦略は DB 永続化への段階的移行として適切。ただし branch_name から slug を抽出するロジックが暗黙の前提に依存しており、将来のブランチ命名規則変更に脆弱。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | tasks.md:7.3 / (delta spec 欠落) | `RequestSummary` / `RequestDetail` 型に `branch_name` を追加する指示が tasks.md にのみ記載されており、対応する delta spec が存在しない。constraints.md「公開型の拡張は spec レベルで明示的に定義する」に違反 | `specs/branch-registration/spec.md` または新規 `specs/request-management/spec.md` の delta spec に、RequestSummary / RequestDetail 型への `branch_name: string | null` フィールド追加のシナリオを追加する |
| 2 | HIGH | completeness | specs/branch-registration/spec.md | `register_branch` が同じ `request_id` に対��て複数回呼ばれた��合の挙動が未定義。エージェントがリトライしたりブランチを作り直した場合に発生し得る | 冪等性のシナリオを追加: 「WHEN register_branch is called with a request_id that already has a non-null branch_name THEN the handler overwrites with the new value (last-write-wins)」。または明示的にエラーにするかの方針を定義する |
| 3 | MEDIUM | consistency | specs/branch-registration/spec.md | `request_id` の型記述が scenario 間で不一致。Tool input schema では `integer, required` だが、Valid input accepted では `non-empty strings (or integer for request_id)` と記載 | Valid input accepted の scenario を修正: `request_id` は `integer` (正の整数) であることを明記し、「non-empty strings (or integer for request_id)」の曖昧な記述を削除する |
| 4 | MEDIUM | maintainability | specs/change-folder-viewer/spec.md:8 | branch_name から slug を抽出するロ��ックが「extracting the slug portion after the prefix」と曖昧。`feat/2026-04-25-my-slug` から `2026-04-25-my-slug` を抽出するアルゴリズム（最初の `/` 以降を取得）が明示されていない。change folder path は `openspec/changes/{slug}/` であり slug の正確な抽出が必要 | 具体的な抽出アルゴリズムを記載する: 「branch_name の最初の `/` 以降の文字列を slug として使用する（例: `feat/2026-04-25-my-slug` -> `2026-04-25-my-slug`）。`/` が含まれない branch_name はバリデーションエラーとする」 |
| 5 | MEDIUM | completeness | specs/custom-tool-handling/spec.md | Custom Tool 処理中のタイムアウトの扱いが未定義。ツールハンドラが長時間かかった場合や、ハンドラ実行中に SSE 接続がクライアント側で切断された場合のリカバリ戦略が記載されていない | タイムアウトのシナリオを追加: 「WHEN a Custom Tool handler does not complete within N seconds THEN the dispatcher returns a timeout error as user.custom_tool_result」。SSE 切断については design.md の Risk で言及されているが、spec レベルのシナリオが必要 |
| 6 | LOW | consistency | specs/propose-session/spec.md:46 | `buildProposeMessage()` の新しいシグネチャに `requestId` が含まれているが、propose instruction message の内容として `requestId` がどう使われるかが不明。メッセージ内容の scenario には requestId の利用が記載されていない | requestId がメ���セージ内容に含まれるか（register_branch 呼び出し時にエージェントが使う）を明示するか、buildProposeMessage のパラメータから requestId を削除して register_branch の引数はエージェントが session context から取得する設計にするか方針を明確化する |
| 7 | LOW | security | specs/branch-registration/spec.md | register_branch の request_id に対する所有権検証が明示されていない。custom-tool-handler は API Route 内で実行されるため auth context はあるが、「その session が request_id に紐づくか」の検証仕様が欠落 | register_branch ハンドラの前提条件として「handler は SSE stream route から呼ばれ、session -> request の紐づけは既に verifySessionAccessByManagedId() で検証済みのため、追加の ownership check は不要」と明記するか、session.requestId と input.request_id の一致検証を追加する |

## Iteration Comparison

(initial iteration -- no comparison)

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.90 | needs-fix | Initial review. HIGH: 2 (型拡張 delta spec 欠落, 冪等性未定義) |

## Convergence

- **trend**: — (initial)
- **recommendation**: continue (fix HIGH findings and re-review)

###停滞検出ルール

- `plateaued` (前回との差が +/-0.3 以内) が **2 iteration 連続** した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する

## Summary

仕様の全体構造は堅実で、request.md の 8 要件を 6 つの delta spec + tasks.md で適切にカバーしている。設計判断（custom-tool-handler 分離、DB 永続化 + フォールバック、SSE ループ非 break）は既存アーキテクチャと整合的。しかし 2 件の HIGH findings が承認を阻止している: (1) RequestSummary/RequestDetail 型拡張の delta spec 欠落（constraints.md 違反）、(2) register_branch の冪等性シナリオ欠落。これらを修正すれば承認水準に到達する見込み。
