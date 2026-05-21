# Tasks: dsv-specs-presence-check

## Task 1 [x]: `DeltaSpecViolationReason` に `no-specs-for-required-type` を追加

**File**: `src/core/spec/delta-spec-validator.ts`

`DeltaSpecViolationReason` union (line 20-25) に `"no-specs-for-required-type"` を追加する。

```ts
export type DeltaSpecViolationReason =
  | "legacy-flat-file"
  | "legacy-flat-dir"
  | "non-canonical-path"
  | "missing-requirements-section"
  | "empty-section"
  | "no-specs-for-required-type";
```

## Task 2 [x]: `validateDeltaSpecPaths` に requestType 引数と Step 5 check を追加

**File**: `src/core/spec/delta-spec-validator.ts`

### 2a: signature に `requestType?: string` を追加

```ts
export async function validateDeltaSpecPaths(
  changePath: string,
  deps: DeltaSpecValidatorFs,
  requestType?: string,
): Promise<{ ok: true } | { ok: false; violations: DeltaSpecViolation[] }>
```

### 2b: Step 1 の前に Step 5 (specs/ 不在 check) を挿入

関数本体の先頭 (`const violations` 宣言の直後、既存 Step 1 の前) に以下のロジックを追加:

```ts
const TYPES_REQUIRING_SPECS = ["spec-change", "new-feature"];
if (requestType && TYPES_REQUIRING_SPECS.includes(requestType)) {
  let specsFound = false;
  try {
    const specsTopEntries = await deps.readdir(`${changePath}/specs`);
    for (const entry of specsTopEntries) {
      if (entry.endsWith(".md")) {
        specsFound = true;
        break;
      }
      try {
        const subEntries = await deps.readdir(`${changePath}/specs/${entry}`);
        if (subEntries.some((e) => e.endsWith(".md"))) {
          specsFound = true;
          break;
        }
      } catch {
        // not a dir
      }
    }
  } catch {
    // specs/ doesn't exist
  }

  if (!specsFound) {
    violations.push({
      path: `${changePath}/specs/`,
      reason: "no-specs-for-required-type",
      suggested: `Request type '${requestType}' requires a delta spec. Add a file under ${changePath}/specs/<capability-name>/spec.md`,
    });
    return { ok: false, violations };
  }
}
```

- `TYPES_REQUIRING_SPECS` を関数スコープまたはモジュールスコープの定数として定義
- `requestType` が undefined or 対象外 type の場合はブロック全体をスキップ (= 既存挙動維持)
- specs/ 不在 → early return で短絡 fail

### 2c: JSDoc を更新

`@param requestType` の説明を追加:

```
@param requestType - Request type from request.md Meta section. When "spec-change" or "new-feature", specs/ must contain at least one .md file.
```

## Task 3 [x]: `DeltaSpecValidationStep.run()` で requestType を渡す

**File**: `src/core/step/delta-spec-validation.ts`

line 45 の `validateDeltaSpecPaths` 呼び出しに第 3 引数を追加:

```ts
// before:
const result = await validateDeltaSpecPaths(changePath, {
  readdir: (p: string) => nodeFs.readdir(p),
  readFile: (p: string) => nodeFs.readFile(p, "utf-8"),
});

// after:
const result = await validateDeltaSpecPaths(
  changePath,
  {
    readdir: (p: string) => nodeFs.readdir(p),
    readFile: (p: string) => nodeFs.readFile(p, "utf-8"),
  },
  deps.request.type,
);
```

## Task 4 [x]: delta-spec-fixer prompt に specs/ 新規作成 hint を追加

**File**: `src/core/step/delta-spec-fixer.ts`

`buildDeltaSpecFixerInitialMessage` (line 37-59) の手順リストに項目を追加。
既存手順 2 (move/rename) の後に挿入:

```
3. If specs/ directory does not exist or contains no delta spec files, create a new delta spec at \`specs/<capability-name>/spec.md\` based on the request.md content and the changes made in this branch
```

既存手順 3, 4, 5 を 4, 5, 6 に繰り下げ。

## Task 5 [x]: unit test 追加 (delta-spec-validator)

**File**: `tests/unit/core/spec/delta-spec-validator.test.ts`

既存 `makeFsMock` と `validSpecContent` helper を再利用して以下 5 TC を追加:

### TC-V-11: type=spec-change, specs/ 配下 .md 0 件 → needs-fix

```ts
describe("TC-V-11: type=spec-change + no specs → no-specs-for-required-type", () => {
  it("returns violation when type=spec-change and specs/ has no .md files", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "spec-change");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("no-specs-for-required-type");
    }
  });
});
```

### TC-V-12: type=new-feature, specs/ 配下 .md 0 件 → needs-fix

```ts
describe("TC-V-12: type=new-feature + no specs → no-specs-for-required-type", () => {
  it("returns violation when type=new-feature and specs/ has no .md files", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "new-feature");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("no-specs-for-required-type");
    }
  });
});
```

### TC-V-13: type=bug-fix, specs/ 配下 .md 0 件 → approved (対象外)

```ts
describe("TC-V-13: type=bug-fix + no specs → ok (not required)", () => {
  it("returns ok: true when type=bug-fix even if specs/ is empty", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "bug-fix");
    expect(result.ok).toBe(true);
  });
});
```

### TC-V-14: type=refactoring, specs/ 配下 .md 0 件 → approved (対象外)

```ts
describe("TC-V-14: type=refactoring + no specs → ok (not required)", () => {
  it("returns ok: true when type=refactoring even if specs/ is empty", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "refactoring");
    expect(result.ok).toBe(true);
  });
});
```

### TC-V-15: type=spec-change, specs/ 配下 .md 1 件以上 → 既存 Step 1-4 継続

```ts
describe("TC-V-15: type=spec-change + valid spec → existing steps continue", () => {
  it("does not trigger no-specs violation when specs/ has .md files", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
      [`${CHANGE_PATH}/specs/my-cap/spec.md`]: validSpecContent("my-cap"),
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "spec-change");
    expect(result.ok).toBe(true);
  });
});
```

## Task 6 [x]: integration test 追加 (delta-spec-validation step)

**File**: `tests/unit/step/delta-spec-validation.test.ts`

既存の mock 構造 (`vi.mock` + `mockValidate`) を使い、Step 5 fail → needs-fix verdict の経路をテスト:

### TC-DSV-04: Step 5 fail (no-specs-for-required-type) → verdict: needs-fix

```ts
describe("TC-DSV-04: Step 5 fail → verdict needs-fix → delta-spec-fixer transition path", () => {
  it("run() writes needs-fix result when validator returns no-specs-for-required-type violation", async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      violations: [
        {
          path: "/work/specrunner/changes/test-slug/specs/",
          reason: "no-specs-for-required-type",
          suggested: "Request type 'spec-change' requires a delta spec.",
        },
      ],
    });

    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    await DeltaSpecValidationStep.run(state, deps);

    const resultAbsPath = path.join(tempDir, deltaSpecValidationResultPath("test-slug"));
    const content = await fs.readFile(resultAbsPath, "utf-8");
    expect(content).toContain("## Verdict: needs-fix");
    expect(content).toContain("no-specs-for-required-type");
  });
});
```

Note: dsv step の `run()` は `validateDeltaSpecPaths` の結果を result file に書くだけなので、既存の TC-DSV-02 と同パターン。新 violation reason が `formatViolationsTable` を通過して正しくレンダリングされることを確認する。

## Task 7 [x]: delta spec 作成

**File**: `specrunner/changes/dsv-specs-presence-check/specs/pipeline-orchestrator/spec.md`

pipeline-orchestrator capability に ADDED Requirement を追加。詳細は同ファイル参照。

## 検証

全 Task 完了後:

```bash
bun run typecheck && bun run test
```
