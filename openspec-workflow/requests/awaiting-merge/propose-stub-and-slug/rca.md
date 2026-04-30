# RCA: propose-stub-and-slug

## 技術的原因

### 直接原因（observable）

dogfooding-001 e2e で propose step が `register_branch` のみ呼んで `end_turn` し、`openspec/changes/{slug}/` change folder が生成されない状態で完了報告。executor の change folder 存在検証（`src/core/step/executor.ts:399`）が `CHANGE_FOLDER_NOT_FOUND` で失敗 → escalate。

### 根本原因（design / judgment）

**原因 A: `propose-system.ts` が PoC スタブのまま昇格していない**

PR #40（self-host pipeline 完成）で他の prompt（code-review, spec-fixer, implementer, build-fixer, code-fixer）は production 品質に整備されたが、`propose-system.ts` だけが PoC 期の最小実装（branch 名を register_branch 経由で返すだけ）のまま残った。具体的に欠落していたのは:

- change folder（`openspec/changes/{slug}/proposal.md`, `design.md`, `tasks.md`, `specs/`）の生成指示
- commit + push 完了まで end_turn しない完了条件（参照実装 `code-review-system.ts` の "MUST commit and push ... before completing the session" と同型の規律）
- workspace 前提の明示（cloned repo @ branch HEAD）
- fresh-per-task 規律（Author-Bias Elimination）
- security guard（`<user-request>` タグ内の役割逸脱防止）

PoC 期は executor 側の change folder 検証が緩く（あるいは未実装で）動作していたが、PR #28 → #40 で executor が `verifyChangeFolderViaPort()` で fail-fast 化された結果、prompt の不備が initial pipeline 完走で初めて顕在化した。

**原因 B: slug 導出ソースが二系統**

- executor 側: `src/cli/run.ts:141` で `path.basename(absolutePath, ".md")` → request.md ファイル名から slug 導出 → `deps.slug` として全 step に渡す（`src/core/step/executor.ts:399` で `openspec/changes/${slug}` を組み立て）。
- agent 側: `src/prompts/propose-system.ts:11` で「`feat/YYYY-MM-DD-short-description` を agent が独自生成」と指示 → branch 名から slug 部分を agent が独自決定。

両者の slug が一致しない場合、agent が `openspec/changes/<agent-slug>/` を作っても executor は `openspec/changes/<executor-slug>/` を見るため `CHANGE_FOLDER_NOT_FOUND` で失敗。「決定的導出のソースは単一にする」という learned-pattern（learned-patterns.md:202, :796, :815）の **3 度目の re-occurrence**（前 2 回: 2026-04-16 phase-2 propose-utils, 2026-04-29 body-template.ts）。

両原因が **共起** することで、現状は agent が change folder を一切作らずに end_turn してしまっており、A 単独でも B 単独でも fail する盤面になっている（A だけ直しても agent が独自 slug を作れば B で fail、B だけ直しても prompt が change folder 生成を指示しないため A で fail）。

### 影響範囲

| 箇所 | 同じ問題あり | 対応 |
|------|------------|------|
| `src/prompts/propose-system.ts` | ✅ A: PoC スタブ | 全面書き直し（修正 A） |
| `src/cli/run.ts:141` | ✅ B: 二重導出 | `path.basename` fallback 削除（修正 B） |
| `src/parser/request-md.ts` | ✅ B: `slug:` 未抽出 | Meta から `slug:` を必須抽出（修正 B） |
| `src/auth/constants.ts:7` | ✅ defensive fallback アンチパターン（learned-patterns.md:372, :492） | placeholder fallback 削除 → fail-fast（修正 D） |
| `src/prompts/{spec-fixer, implementer, build-fixer, code-fixer}-system.ts` | ❌ 共通テンプレ要素を満たす（事後 audit 済） | 不要 |
| `src/prompts/code-review-system.ts` | ❌ PR #38 fixup 済（参照実装） | 不要 |
| `src/prompts/spec-review-system.ts` | △ NOTE「未使用、propose Agent で代替」要再確認 | 本 request スコープ外（C）。次 dogfooding で wiring 確認 |

## プロセス的原因

### 検出すべきだったフェーズ

- [x] spec-review（設計段階で検出可能だった）
- [x] code-review（実装段階で検出可能だった）
- [ ] verification（テストで検出不可: e2e dogfooding が verification 観点に組み込まれていない）

PR #40 の review プロセスでは「propose-system.ts が他 prompt に対して整備度が低い」「slug が二重導出」のいずれも検出されていない。原因 B は learned-patterns.md に明確に存在するパターンだが、既存の review 範囲が実装 diff の正しさに閉じており、pipeline 全体の **不変条件**（決定的導出ソースの一意性）を横断的に検証する観点が code-review checklist にない。

### レビュー観点の分析

| 対象 | ファイル | 該当観点の有無 | 詳細 |
|------|---------|-------------|------|
| code-review checklist | `.claude/skills/code-review/references/checklist.md`（または equivalent） | あり（「決定的導出のソースは単一にする」が learned-patterns に存在）→ pattern-reviewer が再発検出する役割だが、本 request 群に pattern-reviewer enabled が伝搬していなかった可能性 | 既存パターンの再発を検出できなかった = 見逃し / 観点の運用ギャップ |
| spec-review criteria | `.claude/skills/spec-review/references/review-criteria.md` | △ "二系統の真実" "決定的導出の一意性" は明示的観点として存在しない可能性大 | ギャップ（明示的なチェック項目化が必要） |
| rules | `.claude/rules/review-standards.md` 他 | あり（pattern-reviewer の責務として review-lessons の参照を規定） | pattern-reviewer が consistently enabled になっていない / lessons への遡及反映が遅延 |
| prompt 整備度の audit | （該当なし） | なし | ギャップ（PR #40 で多 prompt 同時整備した際、prompt 整備度を横並びで比較する観点が review にない） |

### 改善アクション

| アクション | 対象ファイル | 追加内容 | ステータス |
|-----------|------------|---------|----------|
| 「決定的導出のソースは単一にする」を pattern-reviewer の必須チェックとして明示化 | `.claude/agents/pattern-reviewer.md`（または review-lessons）の見直し | 同パターンの 3 度目の再発であることを review-lessons に追記し、pattern-reviewer が grep ベースで検出できる手がかり（`path.basename`, agent prompt 内の独自 slug 生成指示）を提示 | proposed（Step 6 で /continuous-learning が実施） |
| prompt 整備度の横並び audit を spec-review 観点に追加 | `.claude/skills/spec-review/references/review-criteria.md` | "新規/既存 prompt がプロジェクト共通テンプレ要素（役割／workspace／output／完了条件／fresh-per-task／security）を満たすか" を spec-review チェック項目に追加 | proposed |
| `?? "<placeholder>"` の defensive fallback ban を constraints に昇格 | `.claude/skills/execute-request/references/constraints.md`（または rules） | learned-patterns.md:372, :492, :470 の累積 3 件以上の再発実績に基づく rule promotion | proposed（Step 6 で /promote-rule が判定） |

**hotfix 注**: 本 request は normal severity のため、Step 3b は修正と並行ではなく Step 3 内で完了させた。

