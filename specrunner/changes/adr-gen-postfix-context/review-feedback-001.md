# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装ファイル

- `src/core/step/post-fix-context.ts` — 全関数を精読。`resolveCodeFixerRounds` / `findFindingsBeforeTimestamp` / `buildPostFixContextBlock` / `derivePostFixContext` の実装を確認。
- `src/core/step/adr-gen.ts` — `prepareRoundContext` 追加・`buildMessage` 変更・`buildAdrGenInitialMessage` の `postFixContextBlock` opts 追加を確認。
- `src/prompts/adr-gen-system.ts` — Contract への post-fix ブロック入力追記、優先順位規律（最終実装が正 / Alternatives Considered 禁止 / 乖離時はブロックを正）の追加、判定手順 step 2 の但し書き追加を確認。
- `src/git/dynamic-context.ts` — `postFixContext?` optional field 追加を確認。inline 構造型で `Finding` 等の domain 型を import しないパターンが守られている。`collectDynamicContext` は本 field を設定しない。

### テストファイル

- `src/core/step/__tests__/post-fix-context.test.ts` — 新規。TC-011〜TC-016, TC-001〜TC-008, TC-022 を網羅。全 test が green（42件）。
- `tests/unit/core/step/adr-gen.test.ts` — 774行追加（既存166行は無削除）。TC-001〜TC-010, TC-017〜TC-023 を追加。TC-ADR-STEP-01 / TC-ADR-STEP-02 系は無変更で green。

### 機械検証

- `bun run typecheck` → green（エラーなし）
- `bun run test` → 686 test files passed, 10235 tests passed, 1 skipped（全スイート回帰なし）

### TC カバレッジ（test-cases.md 照合）

must 20件 / should 3件 の全 TC に対応するテストが存在し、かつ green であることを確認した。

| TC | 確認場所 | 結果 |
|----|----------|------|
| TC-001〜004 | post-fix-context.test.ts + adr-gen.test.ts | green |
| TC-005〜008 | post-fix-context.test.ts + adr-gen.test.ts | green |
| TC-009 | adr-gen.test.ts (3 assertions) | green |
| TC-010 | adr-gen.test.ts | green |
| TC-011〜016 | post-fix-context.test.ts | green |
| TC-017 | adr-gen.test.ts | green |
| TC-018 | adr-gen.test.ts（injection 有無の差分検証・sentinel） | green |
| TC-019 | adr-gen.test.ts | green（詳細は Findings 参照） |
| TC-020〜023 | adr-gen.test.ts | green |

### 層境界チェック

- `post-fix-context.ts` の import は `../../state/schema.js` / `../port/runtime-strategy.js` / `./step-names.js` の3件のみ。
- `node:child_process` / 直接の git subprocess import なし（コメント内の言及のみ）。
- `src/git/` から `Finding` 等の domain 型を import していない。

### 設計判断の適合チェック（D1〜D6）

- D1: `prepareRoundContext` hook の再利用 — `spec-review.ts:104-113` の前例と同一パターンで実装されている。
- D2: `DynamicContext.postFixContext` inline 構造型 — `priorRoundContext` / `factCheckAttestation` と同じ手法。
- D3: code-fixer 限定 — `STEP_NAMES.CODE_FIXER` のみを round 源とし、build-fixer / spec-fixer は含まない。
- D4: 直前の最新 findings-bearing run — `findFindingsBeforeTimestamp` が `endedAt < t` の max を選ぶ実装を確認（TC-013 が固定）。
- D5: all-or-nothing 縮退 — try/catch で全失敗を `null` に縮退。`unavailable` / throw の両ケースを TC-008 が固定。
- D6: 注入は message、規律は system prompt — `buildAdrGenInitialMessage` の `postFixContextBlock` 有無で byte-identical な無変更が TC-020 により固定。

## 検証できなかった項目

TC-019 の「T-04 規律を削除すると TC-009 が fail する」特性：静的解析による確認。破壊を実際に実行して RED を観測する形式の確認は行っていない。ただし TC-009 の各 assertion（`includes("最終実装が正")` / `Alternatives Considered` + 否定規律 / `乖離`）はいずれも具体的な文字列検索であり、T-04 で追加された規律文言に直接依存しているため、規律を削除すれば TC-009 は fail することを論理的に確認した。

## Findings 詳細

### F-001: TC-019 second sub-test が tautology — 破壊確認の意図が達成されていない

`tests/unit/core/step/adr-gen.test.ts` の TC-019 第2サブテスト（L.812〜830）が `expect(typeof ruleIsAbsent).toBe("boolean")` という永続的 tautology になっている。

```typescript
const ruleIsAbsent = !ADR_GEN_SYSTEM_PROMPT.includes("最終実装が正");
expect(typeof ruleIsAbsent).toBe("boolean"); // tautology: always passes
```

T-04 実装後、`ADR_GEN_SYSTEM_PROMPT` には "最終実装が正" が含まれるため `ruleIsAbsent` は `false` になる。しかし `typeof false === "boolean"` は常に true であり、テストは rules を削除しても green のまま（=false-green）。

コメントには「T-04 実装後はこのテストを更新するか削除する」と明記されているが、実装では tautology に変換するという形で「更新」されており、破壊確認としての機能を失っている。

**修正案**: 以下のいずれかに変更する。
```typescript
// 修正案 A: 実装後の正状態を assert する（T-04 が規律を追加していることを確認）
expect(ADR_GEN_SYSTEM_PROMPT.includes("最終実装が正")).toBe(true);

// 修正案 B: TC-019 の意図を comment で補完しつつ test を meaningful にする
const hasRule = ADR_GEN_SYSTEM_PROMPT.includes("最終実装が正");
expect(hasRule).toBe(true); // GREEN after T-04; would FAIL if rule removed → proves TC-009 isn't false-green
```

**影響範囲の限定**: TC-009 自体は3つの concrete assertion（"最終実装が正" / Alternatives Considered 否定規律 / "乖離"）を持ち、規律を削除すれば fail する。本 finding は TC-009 の teeth の欠如ではなく、TC-019 の meta-test としての機能不全のみを指摘する。

修正工数: 2行以内の変更。
