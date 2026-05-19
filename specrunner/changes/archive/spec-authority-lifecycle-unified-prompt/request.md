# spec authority lifecycle の統一規律を全 agent prompt に注入する

## Meta

- **type**: spec-change
- **slug**: spec-authority-lifecycle-unified-prompt
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-19
- **author**: color4pen
- **issue**: #318

## 背景

session 内で同型の事故が連鎖発生:

| 事故 | 真因 |
|---|---|
| PR #306 / PR #308 | request body の MODIFIED 誤指定 → implementer agent が忠実に MODIFIED で書き spec-merge escalation |
| PR #317 | code-review が「baseline が main と identical = defect」と誤判定 → code-fixer agent が指示に盲従し baseline を直接編集 → executor commit guard で halt → staging dirty 残骸 → 後続 commit に巻き込み |

= **書く側 (= implementer / code-fixer) も見る側 (= code-review) も spec authority lifecycle の正規経路を理解していない** ことが構造的原因。

## 現状の不足

`src/prompts/fragments.ts` の `AUTHORITY_SPEC_GUARD` fragment は 1 行 MUST NOT のみ:

```
specrunner/specs/ 配下のファイルを直接編集してはならない (MUST NOT)。
spec の変更は delta spec を作成・編集する。
authority spec への直接編集は executor が commit 前に検出し、ステップを halt する。
```

= 「禁止」は書いてあるが以下が **欠落**:

- ADDED / MODIFIED / REMOVED / RENAMED の判断基準
- baseline 更新の正規経路 (= finish 時の mergeSpecsForChange 経由)
- 書く側の判断手順 (= 先に baseline を Read で確認)
- 見る側の規律 (= 「PR diff に baseline 編集を要求しない」MUST NOT)
- code-fixer 固有の規律 (= review-feedback が baseline 編集を要求しても従わない)

さらに `tests/unit/prompts/fragment-coverage.test.ts` の対応表で reviewer 系 (= `SPEC_REVIEW` / `CODE_REVIEW`) に `AUTHORITY_SPEC_GUARD` が **inject されていない** (= 現状 PIPELINE_RULES のみ):

```
SPEC_REVIEW:  [PIPELINE_RULES]                           ← AUTHORITY_SPEC_GUARD 欠落
CODE_REVIEW:  [PIPELINE_RULES]                           ← AUTHORITY_SPEC_GUARD 欠落
```

→ 見る側が spec authority lifecycle を知らない状態で review verdict を出す。

## 設計判断

### 1. fragment 拡張方針

`AUTHORITY_SPEC_GUARD` を **spec authority lifecycle の統一規律** に拡張する。書く側 (= delta spec 作成側) と見る側 (= review 判定側) の両方を 1 つの fragment で統一管理。

fragment は以下のセクションを持つ:

- **MUST NOT (= 全 agent 共通)**: authority spec 直接編集禁止 + PR diff に baseline 編集を含めない/要求しない
- **正規経路**: delta spec で表現 + baseline 更新は mergeSpecsForChange 自動実行 + code-fixer は review-feedback の baseline 編集要求に従わず report
- **書く側の規律**: ADDED / MODIFIED / REMOVED / RENAMED の判断基準 + 先に baseline を Read で確認する手順
- **見る側の規律**: baseline 編集を defect として扱わない + Read-tool-pull モデルで baseline 確認 + baseline 編集を要求する feedback を出さない

### 2. inject 対応表の更新

`fragment-coverage.test.ts` の対応表で **全 8 prompt に `AUTHORITY_SPEC_GUARD` を必須化**:

```
IMPLEMENTER:  [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]    ← 維持
DESIGN:       [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD]                       ← 維持
SPEC_FIXER:   [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]    ← 維持
CODE_FIXER:   [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]    ← 維持
BUILD_FIXER:  [COMMIT_DISCIPLINE]                                             ← 維持 (= spec 触らない)
ADR_GEN:      [COMMIT_DISCIPLINE]                                             ← 維持 (= spec 触らない)
SPEC_REVIEW:  [PIPELINE_RULES, AUTHORITY_SPEC_GUARD]                          ← 追加
CODE_REVIEW:  [PIPELINE_RULES, AUTHORITY_SPEC_GUARD]                          ← 追加
```

BUILD_FIXER / ADR_GEN は spec を触らないため AUTHORITY_SPEC_GUARD 不要 (= 既存方針維持)。

### 3. 既存 prompt との重複削除

`src/prompts/design-system.ts` / `spec-review-system.ts` / `code-review-system.ts` 等の base prompt 内で AUTHORITY_SPEC_GUARD と重複する内容 (= 「baseline を Read で確認」「authority spec 直接編集禁止」等の散在規律) を削除し、fragment に集約する。重複削除は実装段階で grep ベースで確認する。

### 4. patchwork 排除

個別 patchwork (= #316 = code-review prompt 補強) は本 request に吸収される。本 request 完了後に #316 close。

## 要件

### 1. AUTHORITY_SPEC_GUARD fragment の拡張

`src/prompts/fragments.ts` の `AUTHORITY_SPEC_GUARD` を以下の構造に拡張する MUST:

- MUST NOT セクション (= 全 agent 共通の禁止規律)
- 正規経路セクション (= delta spec / mergeSpecsForChange / code-fixer の盲従回避)
- 書く側の規律セクション (= ADDED/MODIFIED/REMOVED/RENAMED の判断基準 + Read 手順)
- 見る側の規律セクション (= baseline 編集を要求しない / defect 扱いしない)

### 2. inject 対応表の更新

`tests/unit/prompts/fragment-coverage.test.ts` の `EXPECTED` 配列で `SPEC_REVIEW` と `CODE_REVIEW` の必須 fragment に `AUTHORITY_SPEC_GUARD` を追加する MUST。test が green になることを以て構造的 inject 保証とする。

### 3. reviewer 系 prompt への inject 実装

`src/prompts/spec-review-system.ts` および `src/prompts/code-review-system.ts` の `buildSystemPrompt` 呼び出しで `AUTHORITY_SPEC_GUARD` を fragments array に追加する MUST。

### 4. 既存 base prompt の重複削除

`design-system.ts` / `spec-review-system.ts` / `code-review-system.ts` 等の base prompt 内で fragment と重複する規律記述を削除する SHOULD。grep ベースで「authority spec」「baseline を直接編集」「specrunner/specs/」等の文字列を検索し、fragment に集約された規律と重複する箇所を整理する。

**operational instructions との区別**: 各 prompt の Completion Checklist (= 例: `design-system.ts:159` の「MODIFIED Requirements の header が baseline spec の既存 header と一致している」) は **agent への操作指示 (= 当該 step の運用ガイド)** であり、本 request の「重複削除」対象外。fragment は「規律 (= 全 agent 共通の MUST/MUST NOT)」、Checklist は「step ごとの操作手順」と役割が異なる。実装時に区別して保全する SHOULD。

### 5. test

`tests/unit/prompts/fragment-coverage.test.ts` の全 8 prompt の test が green。fragment 拡張で増えた section 文字列が prompt に含まれることを `toContain` で間接的に検証 (= 既存 assertion 機構を流用)。

### 6. delta spec target

target capability: `prompt-fragment-registry`

該当 Requirement:

- 「Fragment 集約 export」 (= `AUTHORITY_SPEC_GUARD` の内容を拡張する旨を反映) → MODIFIED
- 「Inject 漏れの構造的検出」 (= 8 prompt の対応表に reviewer 系の AUTHORITY_SPEC_GUARD 必須化を反映) → MODIFIED
- 「System prompt の builder 経由構成」 (= 必要に応じて Scenario の fragment 数の記述を更新) → MODIFIED (実装判断)

delta spec path: `specrunner/changes/spec-authority-lifecycle-unified-prompt/specs/prompt-fragment-registry/spec.md`

⚠️ 規律: target capability の baseline (`prompt-fragment-registry`) を実装時に MUST Read で確認し、Requirement header を正確に複写する。MODIFIED 配下の header は baseline の header と完全一致 MUST。

## スコープ外

- spec-merge の baseline header check 強化 (= #313 Sub-2 で完了済)
- spec-review の Read-tool-pull モデル切替 (= #313 Sub-1 で完了済)
- executor commit guard 後の staging area cleanup (= 別問題、別 issue 候補)
- 各 reviewer agent の判断ロジック自体の補強 (= prompt 規律で induce する範囲、別途 measurement)

## 受け入れ基準

- [ ] `src/prompts/fragments.ts` の `AUTHORITY_SPEC_GUARD` が 4 セクション (= MUST NOT / 正規経路 / 書く側 / 見る側) に拡張されている
- [ ] `tests/unit/prompts/fragment-coverage.test.ts` の対応表で `SPEC_REVIEW` と `CODE_REVIEW` に `AUTHORITY_SPEC_GUARD` が含まれる
- [ ] `src/prompts/spec-review-system.ts` と `src/prompts/code-review-system.ts` の `buildSystemPrompt` 呼び出しで `AUTHORITY_SPEC_GUARD` が fragments array に追加されている
- [ ] base prompt 内の AUTHORITY_SPEC_GUARD と重複する規律記述が整理されている (= grep ベースで確認、SHOULD: 最善努力。Completion Checklist 等の operational instructions は保全対象)
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec が baseline 確認の上で適切な section (MODIFIED) で作成されている (= target capability `prompt-fragment-registry`)
- [ ] 既存 prompt 関連 test の regression なし

## Workflow Options

- enabled: []
