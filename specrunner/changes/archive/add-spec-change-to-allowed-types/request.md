# request type を type-config.md 準拠に整理し、pipeline に反映する

## Meta

- **type**: spec-change
- **slug**: add-spec-change-to-allowed-types

## 背景

openspec-workflow の `type-config.md` は 5 type（`new-feature`, `bug-fix`, `spec-change`, `refactoring`, `chore`）を定義し、type ごとに以下を規定している：

- **ブランチ接頭辞**: `feat/`, `change/`, `refactor/` など
- **spec-review の構成**: フル（architect + spec-reviewer + security-reviewer）か軽量（architect + spec-reviewer のみ）か
- **ADR 生成**: 必須かスキップか
- **code-review の weight**: refactoring は architecture/maintainability の weight を上げる
- **bug-fix**: request-execute ではなく execute-bugfix へ委譲（症状駆動フロー）

なお delta spec（`openspec/changes/<slug>/specs/`）の生成有無は type では決まらない。openspec CLI の `status` が `specs/` artifact を `ready` にするかどうかで決まる。bug-fix でも spec の記述不備が原因なら delta spec が必要になるし、new-feature でも既存 spec に影響しなければ不要になりうる。type が制御するのはブランチ接頭辞やレビュー強度であり、delta spec の有無は CLI の artifact 判定に委ねる。

しかし spec-runner の現状は：

1. `ALLOWED_TYPES` が 6 type（`new-feature`, `bug-fix`, `refactor`, `documentation`, `chore`, `improvement`）で乖離
2. branch prefix は `feat/` にハードコード（`propose.ts:61`, `executor.ts:218`）
3. type は spec-review の prompt に `{{REQUEST_TYPE}}` として注入されるのみで、pipeline のフロー分岐に使われていない

## 要件

### 1. TYPE_CONFIG module の作成

1. `src/config/type-config.ts` に 5 type の定義を `Record<string, TypeConfigEntry>` で集約する
2. 各 type の `TypeConfigEntry` プロパティ：
   - `branchPrefix`: ブランチ接頭辞（`feat/`, `change/`, `refactor/`, `fix/`, `chore/`）
   - `specReviewMode`: `"full"` | `"lightweight"`（full = security-reviewer 含む、lightweight = architect + spec-reviewer のみ）
   - `specImpact`: spec への典型的な影響を記述した文字列（spec-review prompt の注入用）
   - `description`: 人間向けの説明（prompt 注入用）

各 type の `specImpact`：

| Type | 典型的な delta spec 操作 | spec-review の重点 |
|------|------------------------|-------------------|
| `new-feature` | `ADDED Requirements` で新規 capability を追加 | 新規 spec の網羅性、既存 spec との整合性 |
| `spec-change` | `MODIFIED/RENAMED/REMOVED Requirements` で既存 spec を変更 | 既存 spec header との一致、後方互換性、影響範囲の網羅性 |
| `refactoring` | 振る舞い不変のため通常不要 | 既存テストが全て通ること（振る舞い不変の証拠） |
| `bug-fix` | 原因が spec 不備なら `MODIFIED Requirements`、実装だけの問題なら不要 | 修正が spec の意図に沿っているか |
| `chore` | 通常不要（CI/依存更新等は spec 対象外） | — |
3. `ALLOWED_TYPES` を `Object.keys(TYPE_CONFIG)` で導出する（parser が TYPE_CONFIG を import）

### 2. ALLOWED_TYPES の整理

4. `refactor` → `refactoring` にリネーム
5. `documentation` と `improvement` を削除
6. `spec-change` を追加
7. 既存テストを新しい type 名に更新する
8. unknown type は warning 続行を維持する（後方互換性）。`isAllowedType` の型を `keyof typeof TYPE_CONFIG` に変更する

### 3. branch prefix の type 連動

9. `propose.ts:61` と `executor.ts:218` のハードコード `feat/` を `TYPE_CONFIG[deps.request.type].branchPrefix` に置き換える。`deps.request.type` は既存の `StepContext.request` 経由でアクセス可能なので PipelineDeps / StepContext の型変更は不要
10. `job-slug.ts:17` の `BRANCH_PREFIXES` を `Object.values(TYPE_CONFIG).map(c => c.branchPrefix)` で TYPE_CONFIG から導出する（branch 生成と slug strip が単一情報源から導出されることを保証）

### 4. spec-review mode の注入

11. `SpecReviewPromptInput` に `specReviewMode: "full" | "lightweight"` field を追加する
12. `spec-review.ts:buildMessage()` で `TYPE_CONFIG[request.type].specReviewMode` を解決して `SpecReviewPromptInput` に渡す（prompt 層が config/type-config を直接 import しない）
13. `buildSpecReviewInitialMessage` で mode に応じたレビュー強度の指示文を template に埋め込む

## スコープ外

- code-review の weight override（type-config.md の「MVP フェーズ」方針に従い、将来の拡張ポイントとして予約）
- bug-fix の execute-bugfix 委譲（spec-runner に execute-bugfix が未実装）
- ADR 生成の type 連動（spec-runner に ADR step が未実装）

## 受け入れ基準

- [ ] `src/config/type-config.ts` に 5 type の定義が `Record<string, TypeConfigEntry>` で集約されている
- [ ] `type: spec-change` の request.md をパースしても warning が出ない
- [ ] `type: refactoring` の request.md をパースしても warning が出ない
- [ ] branch prefix が type に応じて `feat/`, `change/`, `refactor/`, `fix/`, `chore/` に変わる
- [ ] `BRANCH_PREFIXES` が TYPE_CONFIG から導出されている
- [ ] spec-review の prompt に specReviewMode が注入されている
- [ ] unknown type は warning のみで続行する（エラーにしない）
- [ ] `bun run typecheck && bun run test` が green

## 補足

### architect 評価済み設計判断

- TYPE_CONFIG の配置は `src/config/type-config.ts`。既存の `schema.ts`（型定義）/ `step-config.ts`（解決ロジック）と対称構造
- branch prefix は `deps.request.type` 経由で解決。Step は既に `deps.config` で config 層に依存しており、追加の間接層は over-engineering
- specReviewMode は prompt 層ではなく step 層（`spec-review.ts:buildMessage()`）で解決し、`SpecReviewPromptInput` 経由で渡す。prompt → config の直接依存を避ける
- TypeConfigEntry は 3 プロパティで開始。将来 `adrRequired` や `weights` が必要になれば field 追加で拡張可能


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/add-spec-change-to-allowed-types.md` by `merged-to-archive-consolidation`.
