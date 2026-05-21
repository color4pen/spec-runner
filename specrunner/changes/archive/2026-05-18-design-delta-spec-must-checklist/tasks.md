# Tasks: design-delta-spec-must-checklist

## T-01: DESIGN_SYSTEM_PROMPT に Completion Checklist セクションを追加

`src/prompts/design-system.ts` の完了条件セクション（L141-148）の直後に以下を追加する。

- [x] `## 完了条件` セクションの末尾（L148 の後、`## 重要な注意` の前）に `## Completion Checklist (MUST: end_turn 前に self-check)` セクションを挿入
- [x] type=spec-change / new-feature 用チェックリスト:
  ```
  ### type: spec-change / new-feature の場合（= delta spec 必須）

  - [x] `design.md` を `${_changesDir}/<slug>/` に作成した
  - [x] `tasks.md` を `${_changesDir}/<slug>/` に作成した
  - [x] **`specs/<capability>/spec.md`（delta spec）を 1 件以上作成した**（REQUIRED — 未作成で end_turn 禁止）
  - [x] 各 delta spec セクションが `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` のいずれか
  - [x] `## MODIFIED Requirements` の header が baseline spec の header と一致
  - [x] delta spec path が `specs/<capability-name>/spec.md` 形式（フラットではない）
  ```
- [x] type=bug-fix / refactoring 用チェックリスト:
  ```
  ### type: bug-fix / refactoring 等の場合（= delta spec 不要）

  - [x] `design.md` を作成した
  - [x] `tasks.md` を作成した
  ```
- [x] 条件分岐の導入文: 「初期メッセージの `Request type:` を確認し、該当するチェックリストを全項目 ✓ にしてから end_turn すること。✗ が 1 つでもあれば end_turn せず修正を継続する。」

**受け入れ基準:** `DESIGN_SYSTEM_PROMPT` に `Completion Checklist` 文言と type 別チェックリストが含まれ、delta spec が REQUIRED と明示されている。

## T-02: DESIGN_INITIAL_MESSAGE_TEMPLATE に `{{REQUEST_TYPE}}` を追加

`src/prompts/design-system.ts` の `DESIGN_INITIAL_MESSAGE_TEMPLATE` を修正する。

- [x] slug/branch リストの後に `- Request type: \`{{REQUEST_TYPE}}\`` 行を追加
- [x] テンプレート文言の位置: `- branch: \`{{BRANCH}}\`` の直後

修正後のテンプレート該当部分:
```
- slug: \`{{SLUG}}\`
- branch: \`{{BRANCH}}\`
- Request type: \`{{REQUEST_TYPE}}\`
```

**受け入れ基準:** `DESIGN_INITIAL_MESSAGE_TEMPLATE` に `{{REQUEST_TYPE}}` プレースホルダが含まれている。

## T-03: `buildInitialMessage` のシグネチャ拡張と replace 追加

`src/prompts/design-system.ts` の `buildInitialMessage` 関数を修正する。

- [x] 第5引数 `requestType?: string` を追加
- [x] `let base = ...` ブロック内に `.replaceAll("{{REQUEST_TYPE}}", requestType ?? "")` を追加
- [x] JSDoc を更新して `requestType` パラメータの説明を追加

修正後シグネチャ:
```ts
export function buildInitialMessage(
  requestContent: string,
  slug: string,
  branch?: string,
  dynamicContext?: DynamicContext,
  requestType?: string,
): string {
```

**受け入れ基準:** `buildInitialMessage("body", "slug", "branch", undefined, "spec-change")` の出力に `spec-change` が含まれる。

## T-04: design.ts の `buildMessage` で `requestType` を渡す

`src/core/step/design.ts` の `DesignStep.buildMessage` を修正する。

- [x] `buildInitialMessage` 呼び出しの第5引数に `deps.request.type` を追加

修正後:
```ts
return buildInitialMessage(deps.request.content, deps.slug, branch, deps.dynamicContext, deps.request.type);
```

**受け入れ基準:** design step が buildInitialMessage に request type を渡す。

## T-05: テスト追加

`tests/prompts/design-system.test.ts` にテストケースを追加する。

- [x] TC: `DESIGN_SYSTEM_PROMPT` に `Completion Checklist` が含まれる
- [x] TC: `DESIGN_SYSTEM_PROMPT` に `delta spec` と `REQUIRED` が同一セクション内に含まれる
- [x] TC: `DESIGN_SYSTEM_PROMPT` に `spec-change` と `new-feature` への言及がある
- [x] TC: `DESIGN_SYSTEM_PROMPT` に `bug-fix` / `refactoring` 用チェックリストがある
- [x] TC: `DESIGN_INITIAL_MESSAGE_TEMPLATE` に `{{REQUEST_TYPE}}` が含まれる
- [x] TC: `buildInitialMessage` に `requestType` を渡すと出力に反映される
- [x] TC: `buildInitialMessage` に `requestType` を渡さない場合も動作する（後方互換）

**受け入れ基準:** `bun run test tests/prompts/design-system.test.ts` が全 green。

## T-06: 型チェック・全テスト green 確認

- [x] `bun run typecheck` が pass
- [x] `bun run test` が pass

**受け入れ基準:** CI 相当のチェックがローカルで green。
