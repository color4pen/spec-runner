# Design: design-delta-spec-must-checklist

## Context

issue #283 Sub-task C。design system prompt の完了条件が散文的で、type=spec-change のときに delta spec 作成が MUST であることが曖昧。PR #282 では design が delta spec を作成せず後続層でも catch されなかった。

現状:
- `DESIGN_SYSTEM_PROMPT` L141-148 に「design.md と tasks.md（および必要な delta spec）が存在する」と書かれている
- 「必要な」の判断が agent 任意の解釈に委ねられている
- チェックリスト形式ではなく、step 完了時の self-check で見落とされやすい
- `buildInitialMessage` は `requestContent`（= request.md 全文）を渡すが、type を明示的に抽出した変数注入はしていない

## Goals / Non-Goals

**Goals:**
- type=spec-change/new-feature 時に delta spec 作成を MUST 完了条件として self-check させる
- チェックリスト形式で具体的な完了項目を明示し、見落としを構造的に防ぐ
- request type を明示変数として注入し、条件分岐の確実性を高める

**Non-Goals:**
- design 内に外部 validator を組み込むこと（dsv + spec-review で担う）
- 既存プロンプト構造の全面置換
- delta spec format の自動検証強化（dsv の責務）
- 多層防衛連携 e2e test（全 Sub-task merge 後に別 issue で扱う）

## Decisions

### D1: 完了条件セクション（L141-148）の後にチェックリスト段を追加

既存の完了条件テキストを維持し、その直後に type 別チェックリストを追加する。

- spec-change / new-feature: delta spec ≥1 件を MUST 項目として列挙
- bug-fix / refactoring: design.md + tasks.md のみ

**Why not 既存テキストの全面置換:** 既存テキストは「何が起きるか」（CLI 検証で失敗する）の説明として有用。チェックリストは「何を確認するか」の別レイヤー。

### D2: `DESIGN_INITIAL_MESSAGE_TEMPLATE` に `{{REQUEST_TYPE}}` を追加

spec-review-system.ts:85 と同じパターンで、初期メッセージに `Request type: {{REQUEST_TYPE}}` 行を明示注入する。

- agent は `<user-request>` 内の Meta セクションからも type を読めるが、明示変数により条件分岐の確実性が向上
- 初期メッセージ（テンプレート）に注入、system prompt は静的テキストのまま

**Alternatives considered:**
- system prompt をテンプレート化: 他のプレースホルダ（`${_changesDir}` 等）は JS テンプレートリテラル。`{{}}` 混在は可読性低下。却下。
- type 注入なし（agent が request.md から読む）: 動作するが、チェックリスト条件分岐の「根拠」が曖昧になる。明示が安全。

### D3: `buildInitialMessage` のシグネチャ拡張

第5引数（or options object）として `requestType: string` を追加。

```ts
export function buildInitialMessage(
  requestContent: string,
  slug: string,
  branch?: string,
  dynamicContext?: DynamicContext,
  requestType?: string,       // ← 追加
): string
```

テンプレート内で `.replace(/{{REQUEST_TYPE}}/g, requestType ?? "")` する。

**Why positional arg (not options object):** 呼び出し元が 1 箇所のみ（design.ts:68）。既存シグネチャの末尾追加で互換性維持。

### D4: design.ts `buildMessage` で `deps.request.type` を渡す

```ts
return buildInitialMessage(deps.request.content, deps.slug, branch, deps.dynamicContext, deps.request.type);
```

`deps.request.type` は `ParsedRequest.type` (`string`) で、`StepContext` 経由で利用可能。

### D5: テスト戦略

- **prompt keyword grep test**: `DESIGN_SYSTEM_PROMPT` に `Completion Checklist` / `delta spec file is created` / `REQUIRED` 等のキーワードが存在
- **template variable test**: `DESIGN_INITIAL_MESSAGE_TEMPLATE` に `{{REQUEST_TYPE}}` が存在
- **buildInitialMessage test**: `requestType` 引数が出力に反映される
- **既存 test 非破壊**: 既存 TC-007〜TC-012 が green のまま

## Risks / Trade-offs

- [Risk] agent がチェックリストを形式的に ✓ 付けして実質スキップする → [Mitigation] 後続の dsv（Sub-A）+ spec-review（Sub-B）が機械/意味検査で catch。多層防衛。
- [Risk] `buildInitialMessage` の引数増加で将来 options object へのリファクタが必要になる → [Mitigation] 現時点で呼び出し元 1 箇所。肥大化時にリファクタ。

## Open Questions

None.
