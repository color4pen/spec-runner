# Code Review: design-delta-spec-must-checklist — Iteration 1

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-18
- **iteration**: 1

## Summary

実装は要件を正確にカバーしており、typecheck・全テスト (2057) が green。設計判断 D1〜D5 に対応する変更がすべて揃っている。以下の観察事項は非ブロッキング。

## Findings

### F-01 (minor): TC-13 が integration test として未カバー

- **severity**: minor
- **file**: `tests/prompts/design-system.test.ts`
- **test-case**: TC-13 (must priority)

TC-13 は `DesignStep.buildMessage` が `deps.request.type` を `buildInitialMessage` に渡すことを integration レベルで検証することを要求する。実装 (`design.ts:68`) は正しく `deps.request.type` を第5引数に渡しているが、テストは `buildInitialMessage` 関数の直接呼び出しのみ（`TC-CL-003`）でカバーし、`DesignStep.buildMessage` 経由のパスを検証していない。

変更は1行かつ呼び出しチェーンが単純なため実害リスクは低いが、test-cases.md 上の must 項目が形式上未カバーになっている。

**対応不要**: 現状の間接カバレッジで機能上のリスクはない。次の iteration 以降で step 統合 test を追加するタイミングで拾えばよい。

---

### F-02 (minor): TC-04 の assertion が存在確認のみで不在確認なし

- **severity**: minor
- **file**: `tests/prompts/design-system.test.ts` (line 192-195)

TC-04 の THEN 節は「bug-fix / refactoring セクションには delta spec の MUST / REQUIRED 記述がない」を要求するが、テストは `DESIGN_SYSTEM_PROMPT` に `"bug-fix"` と `"refactoring"` が存在することしか検証しない。実装のプロンプト内容は正しく（bug-fix チェックリストには design.md と tasks.md のみ）、false negative のリスクはない。

**対応不要**: 実装内容に問題はなく、test-cases.md の should 相当の厳密度として許容範囲内。

---

### F-03 (observation): propose-session delta spec に stale な openspec CLI シナリオが残存

- **severity**: observation (out of scope)
- **file**: `specrunner/changes/design-delta-spec-must-checklist/specs/propose-session/spec.md`

MODIFIED Requirement の既存 scenario（openspec CLI workflow / Delta spec generation is schema-driven / register_branch）は PR #189-191 以降の実装と乖離している（design step は現在 openspec CLI を使用しない）。本 PR は `{{REQUEST_TYPE}}` 注入の追加を目的としており、stale scenario の修正はスコープ外。baseline spec 側の既存乖離が起点であり、本 PR が問題を拡大はしていない。

**対応不要**: スコープ外。別 issue で `propose-session/spec.md` の全面整理を行うことを推奨。

---

## Coverage Check (must cases)

| Test Case | Priority | Status |
|-----------|----------|--------|
| TC-01: Completion Checklist section 存在 | must | ✅ covered (TC-CL-001) |
| TC-02: delta spec + REQUIRED 同一セクション | must | ✅ covered (TC-CL-001) |
| TC-03: spec-change / new-feature 言及 | must | ✅ covered (TC-CL-001) |
| TC-04: bug-fix チェックリスト存在 | must | ⚠️ 存在確認のみ (F-02) |
| TC-08: `{{REQUEST_TYPE}}` プレースホルダ存在 | must | ✅ covered (TC-CL-002) |
| TC-09: requestType=spec-change が出力に反映 | must | ✅ covered (TC-CL-003) |
| TC-11: 第5引数省略で後方互換 | must | ✅ covered (TC-CL-003) |
| TC-13: DesignStep.buildMessage が type を渡す | must | ⚠️ 間接カバレッジのみ (F-01) |
| TC-16: typecheck green | must | ✅ passed |
| TC-17: bun run test green | must | ✅ 2057 passed |
| TC-18: delta spec ≥1 件存在 | must | ✅ design-completion/ + propose-session/ |
| TC-19: delta spec セクションヘッダー規約準拠 | must | ✅ ADDED / MODIFIED 使用 |
| TC-20: 既存テスト regression なし | must | ✅ 2057 全 passed |

## Implementation Quality

- `DESIGN_SYSTEM_PROMPT` への Completion Checklist 追加 (L150-169): 設計判断 D1 通り、既存完了条件テキスト直後に配置 ✓
- `DESIGN_INITIAL_MESSAGE_TEMPLATE` への `{{REQUEST_TYPE}}` 追加 (L194): `{{BRANCH}}` の直後に配置 ✓
- `buildInitialMessage` 第5引数 `requestType?: string` (L228): `requestType ?? ""` で backward compatible ✓
- `design.ts:68`: `deps.request.type` を第5引数で渡す1行変更 ✓
- delta spec `design-completion/spec.md`: ADDED で新規 capability として正しく作成 ✓
- delta spec `propose-session/spec.md`: MODIFIED header が baseline と一致 ✓

## Required Actions

None. Approved as-is.
