# Code Review: spec-fixer-tasks-md-writable — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

**Diff scope**: `git diff main...HEAD --stat` — 25 files changed (15 change-folder artifacts + 9 source/test files)

**実装ファイル**:
- `src/core/step/spec-fixer.ts` — `writes()` に `tasks.md` 追加、conformance-entry メッセージ更新
- `src/core/step/canon-write-scope.ts` — D5 map と両 doc comment ブロック更新
- `src/core/step/judge-verdict.ts` — JSDoc comment-only 更新（`tasks.md` を spec-fixer-writable に明示）
- `src/prompts/spec-fixer-system.ts` — write-set / Contract section を 3 箇所更新（入力・出力・write-set 行）
- `src/core/step/step-completion.ts` — `toolResult` 型の union 拡張（型精度向上、動作変更なし）

**テストファイル**:
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts` — `makeCanonScope()` fixture に `TASKS_MD` 追加、TC-013 期待値更新、test-cases.md escalationReason sub-test 追加
- `tests/unit/core/step/canon-write-scope.test.ts` — TC-019 に tasks.md 包含 assertion 追加、TC-029 title 更新
- `tests/unit/core/step/judge-verdict-canon.test.ts` — `makeFullCanonScope()` fixture 更新、TC-006 second sub-test 期待値 → needs-fix:spec-fixer
- `tests/unit/step/step-io-contracts.test.ts` — spec-fixer writes() assertion に tasks.md 追加
- `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts` — 新規 test file (14 TC、全 must カバー)

**実行確認**:
- `bun run typecheck` → clean（エラーなし）
- `bun run test` → 638 test files passed, 9476 tests passed

**受け入れ基準照合**:
- [x] tasks.md medium fixable → needs-fix かつ spec-fixer に到達（TC-003, TC-013）
- [x] request.md / test-cases.md fixable → escalation + escalationReason（TC-005, TC-006）
- [x] TC-029 drift-guard green（writes() と D5 map を同時更新）
- [x] conformance entry + system prompt に tasks.md 記載
- [x] implementation-notes.md に更新テスト 4 ファイルを列挙
- [x] typecheck && test green

## 検証できなかった項目

None。

## Findings 詳細

### F-01: `src/prompts/rules.ts:47` — spec-fixer 責任範囲テーブルが stale

**証拠**:
```
src/prompts/rules.ts line 47:
| spec-fixer | change folder 内の spec.md, design.md | source code |
```

このファイルはすべての新規 change folder に注入される `rules.md` のソースである。
将来の spec-fixer agent は system prompt（write-set に tasks.md を含む）と rules context（tasks.md を含まない）の矛盾した情報を受け取る。
System prompt は機械的に適用されるため動作は正しいが、agent-visible context に不整合が残り、spec-fixer が tasks.md の finding を deferred と判断するリスクがある。

**修正箇所**: line 47 を `| spec-fixer | change folder 内の spec.md, design.md, tasks.md | source code |` に更新する。

---

### F-02: `src/core/step/__tests__/spec-review-fixer-routing.test.ts:844,857` — TC-012 first sub-test の説明が stale

**証拠**:
- line 844: `it("TC-012: only spec.md and design.md fixable findings are returned (request.md and src/ excluded)")`
- line 857: `// Only spec.md and design.md are routable`

tasks.md T-03 は「inline comments が tasks.md を unroutable と記述している場合のみ調整する」としており、これらのコメントは tasks.md を unroutable と明記していない。
ただし test description が routable 集合を `{spec.md, design.md}` と断言しており、`{spec.md, design.md, tasks.md}` が正しくなった現在は技術的に不正確。
テスト logic 自体は正しい（test data に tasks.md finding がなく `toHaveLength(2)` は正確）。

**修正箇所**: it(...) タイトルと inline comment を tasks.md を含むよう更新する。
