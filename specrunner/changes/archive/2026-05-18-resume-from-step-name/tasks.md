# Tasks: resume-from-step-name

## [x] T-01: `resolve-step.ts` — 型定義と解決ロジックの拡張

**対象ファイル**: `src/core/resume/resolve-step.ts`

### 1-a: 型定義の変更

- `ResumeRole` を `LegacyResumeRole` に rename する
- 新型 `ResumeFrom = StepName | LegacyResumeRole` を export する
- `LEGACY_RESUME_ROLES` 定数（`["critic", "fixer", "creator"] as const`）を追加する

### 1-b: step 名判定用の Set を追加

- `AGENT_STEP_NAMES` と `CLI_STEP_NAMES` を import し、全 step 名の `Set<string>` を作成する
  ```typescript
  const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);
  ```

### 1-c: `resolveResumeStep` の `from !== undefined` 分岐を拡張

現状の分岐（L98-106）を以下の 3 段階に変更する:

1. `ALL_STEP_NAMES_SET.has(from)` → `from as StepName` をそのまま返す
2. `from` が `LegacyResumeRole` に該当 → 既存の `STEP_MAPPING` 経路（変更なし）
3. いずれにも該当しない → `Error` を throw する。message に利用可能 step 名一覧（`AGENT_STEP_NAMES` + `CLI_STEP_NAMES` を join）と legacy alias 一覧を含める

**注意**: 既存の legacy alias 経路（`STEP_MAPPING[phase][role]`）のロジックは一切変更しない。

### 1-d: `STEP_MAPPING` の型を `LegacyResumeRole` に合わせる

`STEP_MAPPING` の Record key 型を `ResumeRole` → `LegacyResumeRole` に更新する（rename に追従するだけで値は不変）。

---

## [x] T-02: `command-registry.ts` — `--from` flag の enum 拡張と USAGE 更新

**対象ファイル**: `src/cli/command-registry.ts`

### 2-a: `resume.flags.from.values` の拡張

- `AGENT_STEP_NAMES` と `CLI_STEP_NAMES` を `src/core/step/step-names.js` から import する
- `values` を `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES, "critic", "fixer", "creator"]` に変更する
- 既存の `flag-parser.ts` の enum validation がそのまま機能する

### 2-b: USAGE 文字列の更新

L89 の行:
```
  --from=<role>     Override resume step: critic | fixer | creator
```
を以下に変更:
```
  --from=<step|alias>  Override resume step (e.g. code-review, implementer, critic)
```

---

## [x] T-03: テスト追記

**対象ファイル**: `tests/unit/core/resume/resolve-step.test.ts`

新しい `describe` ブロック `"resolveResumeStep - --from with step name"` を追加し、以下の test case を実装する:

### TC-RESUME-FROM-01: step 名 `design` を直接指定

```typescript
it("--from design → design", () => {
  expect(resolveResumeStep("design", makeResumePoint("code-review"))).toBe("design");
});
```
resumePoint の phase に関わらず、step 名直接指定が優先されることを検証する。

### TC-RESUME-FROM-02: step 名 `code-review` を直接指定

```typescript
it("--from code-review → code-review", () => {
  expect(resolveResumeStep("code-review", makeResumePoint("implementer"))).toBe("code-review");
});
```

### TC-RESUME-FROM-03: deterministic step `delta-spec-validation` を直接指定

```typescript
it("--from delta-spec-validation → delta-spec-validation", () => {
  expect(resolveResumeStep("delta-spec-validation", makeResumePoint("spec-review"))).toBe("delta-spec-validation");
});
```

### TC-RESUME-FROM-04: legacy alias `critic` が既存通り phase-aware で動く

```typescript
it("--from critic + spec phase → spec-review", () => {
  expect(resolveResumeStep("critic", makeResumePoint("spec-review"))).toBe("spec-review");
});
it("--from critic + code phase → code-review", () => {
  expect(resolveResumeStep("critic", makeResumePoint("implementer"))).toBe("code-review");
});
```
（これは既存テストと重複するが、step 名直接経路との区別を明示するため追加する）

### TC-RESUME-FROM-05: legacy alias `fixer` が既存通り phase-aware で動く

```typescript
it("--from fixer + spec phase → spec-fixer", () => {
  expect(resolveResumeStep("fixer", makeResumePoint("spec-review"))).toBe("spec-fixer");
});
it("--from fixer + code phase → code-fixer", () => {
  expect(resolveResumeStep("fixer", makeResumePoint("implementer"))).toBe("code-fixer");
});
```

### TC-RESUME-FROM-06: legacy alias `creator` が既存通り phase-aware で動く

```typescript
it("--from creator + spec phase → design", () => {
  expect(resolveResumeStep("creator", makeResumePoint("spec-review"))).toBe("design");
});
it("--from creator + code phase → implementer", () => {
  expect(resolveResumeStep("creator", makeResumePoint("implementer"))).toBe("implementer");
});
```

### TC-RESUME-FROM-07: 不正値で error throw + 利用可能値の一覧を含む

```typescript
it("--from invalid-name → throws with available values", () => {
  expect(() => resolveResumeStep("invalid-name", makeResumePoint("code-review")))
    .toThrow(/invalid-name/);
  expect(() => resolveResumeStep("invalid-name", makeResumePoint("code-review")))
    .toThrow(/design/); // step 名が列挙されている
  expect(() => resolveResumeStep("invalid-name", makeResumePoint("code-review")))
    .toThrow(/critic/); // legacy alias が列挙されている
});
```

---

## [x] T-04: 型チェック + テスト実行

`bun run typecheck && bun run test` を実行し、green を確認する。
