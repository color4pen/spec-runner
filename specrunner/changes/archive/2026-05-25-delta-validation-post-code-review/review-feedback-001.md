# Code Review Feedback — delta-validation-post-code-review — iter 1

- **verdict**: needs-fix
- **reviewer**: code-review agent
- **date**: 2026-05-25

---

## Summary

実装ロジック・設計判断は正しい。型安全性・テスト通過・transition 順序・warning 化 2 経路すべて意図通りに実装されている。ただし test-cases.md で **must** 指定された TC が複数未実装のため、主要メカニズムの自動検証が欠けている。

---

## Findings

| # | Severity | Category | File | Description |
|---|----------|----------|------|-------------|
| F-01 | HIGH | test-coverage | `tests/unit/core/spec/rules/no-authority-spec-direct-edit.test.ts` | TC-RULE-08 (must): `createDeltaSpecRegistry()` に `"no-authority-spec-direct-edit"` が登録されているかを確認するテストが存在しない。rule の単体テスト (TC-1〜6) は通っているが、registry 統合点が無検証。 |
| F-02 | HIGH | test-coverage | (新規ファイル必要) | TC-INJ-01 (must): `DeltaSpecValidationStep.run()` が `git diff <baseBranch>..HEAD --name-only` を spawn し、結果を `changedFiles` として `validateDeltaSpecPaths()` に渡すことを検証するテストがない。changedFiles injection が pipeline で機能しているかどうかが未検証。 |
| F-03 | HIGH | test-coverage | (新規ファイル必要) | TC-INJ-02 (must): `git diff` が失敗した場合に `changedFiles = undefined` で degradation し、pipeline がエラーにならないことを検証するテストがない。 |
| F-04 | HIGH | test-coverage | `tests/unit/step/executor.commit.test.ts` | TC-CP-01 (must): staged files に `specrunner/specs/foo/spec.md` を含めたときに `"Warning: authority spec edit detected in staged files"` が stderr に出力されるテストがない。TC-CAP-NEW-001〜008 は authority spec path を git diff の stdout に含めておらず、warning 分岐は一度も通らない。 |
| F-05 | HIGH | test-coverage | `tests/unit/step/executor.commit.test.ts` | TC-CP-04 (must): HEAD diff 経路で agent self-commit に `specrunner/specs/foo/spec.md` が含まれるとき `"Warning: authority spec edit detected in agent commits"` が stderr に出力されるテストがない。TC-CAP-NEW-007 は "Detected agent-authored commit" メッセージしか検証しておらず、authority spec warning 分岐は未通過。 |
| F-06 | LOW | prompt-quality | `src/core/step/delta-spec-fixer.ts` | `buildDeltaSpecFixerInitialMessage` にて、指示 6「ファイルを worktree に書き出したら end_turn してください」が指示 7「authority-spec-direct-edit の rollback」の前に現れる。agent が 6 を「即 end_turn」と解釈すると指示 7 を読まずに終了するリスクがある。end_turn 指示を最後に移動することを推奨。 |
| F-07 | LOW | maintainability | `tests/unit/pipeline/transition-when.test.ts` | TC-WHEN-02: `expect(STANDARD_TRANSITIONS.length).toBe(31)` は行数ハードコードのアサーション。transition 追加・削除のたびに壊れる。このアサーションは削除、または特定 transition の存在確認に置換することを推奨。 |

---

## Detail

### F-01: TC-RULE-08 — registry 登録の未検証

`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` に `noAuthoritySpecDirectEdit` が登録されているのはコード上確認できる。しかし `tests/unit/core/spec/rules/*.test.ts` に registry 登録を確認するテストが存在しない。同等のパターンとして、他の rule では `integration.test.ts` が registry オブジェクトに対する確認を行っているが、新 rule はここにも含まれていない。

**修正**: `no-authority-spec-direct-edit.test.ts` または `integration.test.ts` に以下を追加する。

```typescript
import { createDeltaSpecRegistry } from "../../../../../src/core/spec/rules/index.js";

it("createDeltaSpecRegistry includes no-authority-spec-direct-edit", () => {
  const registry = createDeltaSpecRegistry();
  const names = registry.rules.map(r => r.name);
  expect(names).toContain("no-authority-spec-direct-edit");
});
```

### F-02, F-03: TC-INJ-01, TC-INJ-02 — changedFiles injection 未検証

`DeltaSpecValidationStep.run()` が `deps.spawn` を使って `git diff main..HEAD --name-only` を実行し、その結果を `validateDeltaSpecPaths()` に渡す部分は実装されている。しかしこの injection path を検証するテストが存在しない。

rule 単体テスト (F-01 経由で機能する) とは別に、ステップが spawn を正しい引数で呼び出し、stdout を changedFiles として注入することを確認する必要がある。`validateDeltaSpecPaths` を vi.mock して呼び出し引数を検証するか、実際の fs mock を使った CliStep テストで確認する。

### F-04, F-05: TC-CP-01, TC-CP-04 — warning 出力の未検証

`commit-push.ts` の 2 つの throw 経路を warning ログに変更することが本 request の主要変更の一つ。しかし executor.commit.test.ts の TC-CAP-NEW-* は git diff の stdout に `specrunner/specs/` パスを含めておらず、`findAuthoritySpecViolations()` が violation を返す分岐は一度も通らない。

**修正**: 既存テストの `baseResponses` に以下を追加するか、専用テストを追加する。

```typescript
// TC-CP-01 のイメージ
"diff --cached --name-only": {
  exitCode: 0,
  stdout: "specrunner/specs/foo/spec.md\nsrc/core/bar.ts\n",
},
// 期待: stderr に "Warning: authority spec edit detected in staged files" が含まれる
```

```typescript
// TC-CP-04 のイメージ  
"diff --name-only": {
  exitCode: 0,
  stdout: "specrunner/specs/foo/spec.md\n",
},
// 期待: stderr に "Warning: authority spec edit detected in agent commits" が含まれる
```

### F-06: delta-spec-fixer prompt 指示順序

```
6. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
7. If violations include `authority-spec-direct-edit`:
   a. Revert the authority spec edit: ...
   b. Write the intended changes to the delta path: ...
```

指示 6 の「end_turn してください」は作業完了後の動作であることは文脈から読み取れるが、numbered list の構造上、agent が 6 を実行完了条件と解釈して 7 を見落とすリスクがある。指示 7 を 6 の前に移動することで意図が明確になる。

### F-07: 行数ハードコードアサーション

`expect(STANDARD_TRANSITIONS.length).toBe(31)` — transition テーブルは今後も変更されうる。このアサーションは追加変更のたびに手動更新が必要になり、保守コストが高い。削除か、「少なくとも N 件以上」に変更することを推奨。

---

## Positive Observations

- `Transition.when` predicate の設計が clean。pipeline.ts の変更が 1 行追加に収まっており、既存 transition への影響がない。
- conditional transition を fallback 行の前に配置することで `Array.find` の first-match 特性を正しく利用している。
- `changedFiles` が undefined の場合に rule を skip する graceful degradation が実装されている。
- `findAuthoritySpecViolations()` を削除せずに保持する判断は正しい（health check への有用性）。
- TC-1〜TC-6 (rule unit test)、TC-1〜TC-5 (transition context-aware test) は内容が充実している。
- typecheck + 2815 tests all green。

---

## How to Fix (優先順)

1. `tests/unit/step/executor.commit.test.ts` に TC-CP-01 / TC-CP-04 相当のテストを追加（authority spec path を diff stdout に含め、stderr warning を検証）
2. TC-INJ-01 / TC-INJ-02: `DeltaSpecValidationStep` の spawn 呼び出しと changedFiles 注入を検証するテストを追加
3. TC-RULE-08: `createDeltaSpecRegistry()` の登録確認テストを追加
4. F-06: `buildDeltaSpecFixerInitialMessage` で指示 6 (end_turn) を指示リストの末尾に移動
5. F-07 (optional): `TC-WHEN-02` の行数アサーション削除
