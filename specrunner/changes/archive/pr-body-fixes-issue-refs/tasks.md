# Tasks: PR body に Fixes #N を自動付与

## Task 1: ParsedRequest 型に issue field を追加

**File**: `src/core/request/types.ts`

`ParsedRequest` interface に optional field を追加:

```ts
/** Issue reference from Meta section (e.g. "#264"). undefined if not present. */
issue?: string;
```

- [x] 完了

## Task 2: parser で issue field を抽出

**File**: `src/parser/request-md.ts`

`parseRequestMdContent` 内で、`baseBranch` 抽出の直後に以下を追加:

```ts
// Extract issue from Meta section: "- **issue**: value" (optional)
let issue: string | undefined = undefined;
const issuePattern = /^\s*-\s+\*\*issue\*\*:\s+(.+)$/;
for (const line of lines) {
  const m = issuePattern.exec(line);
  if (m?.[1]) {
    issue = m[1].trim();
    break;
  }
}
```

return 文に `issue` を追加:

```ts
return { type, title, slug, baseBranch, content, enabled, sections, issue };
```

注意: `issue` は optional — 見つからなくてもエラーにしない。

- [x] 完了

## Task 3: renderPrBody で Fixes 行を挿入

**File**: `src/core/pr-create/body-template.ts`

Summary section の構築後、Workflow section の構築前に以下を挿入:

```ts
// --- Fixes line (auto-close linked issue on PR merge) ---
if (parsedRequest.issue) {
  sections.push(`Fixes ${parsedRequest.issue}`);
}
```

挿入位置は `sections.push("## Workflow");` の直前。

- [x] 完了

## Task 4: body-template のテスト追加

**File**: `tests/unit/core/pr-create/body-template.test.ts`

既存テストファイルに以下を追加:

### TC: issue が存在する場合に Fixes 行が body に含まれる

```ts
describe("renderPrBody — Fixes line from parsedRequest.issue", () => {
  it("includes 'Fixes #264' when parsedRequest.issue is '#264'", () => {
    const parsedRequest = makeParsedRequest({ issue: "#264" });
    const jobState = makeMinimalState({ steps: {} });
    const body = renderPrBody({ parsedRequest, jobState, slug: "pr-create-step" });
    expect(body).toContain("Fixes #264");
  });

  it("does not include 'Fixes' line when parsedRequest.issue is undefined", () => {
    const parsedRequest = makeParsedRequest(); // issue is undefined
    const jobState = makeMinimalState({ steps: {} });
    const body = renderPrBody({ parsedRequest, jobState, slug: "pr-create-step" });
    expect(body).not.toMatch(/Fixes #/);
  });
});
```

- [x] 完了

## Task 5: parser のテスト追加

**File**: `tests/unit/parser/request-md.test.ts` (既存ファイルに追加、なければ新規)

### TC: issue field が存在する request.md

```ts
it("extracts issue field from Meta section", () => {
  const content = `# Title\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: test\n- **base-branch**: main\n- **issue**: #264\n`;
  const result = parseRequestMdContent(content);
  expect(result.issue).toBe("#264");
});
```

### TC: issue field が無い request.md

```ts
it("returns undefined issue when field is absent", () => {
  const content = `# Title\n\n## Meta\n\n- **type**: bug-fix\n- **slug**: test\n- **base-branch**: main\n`;
  const result = parseRequestMdContent(content);
  expect(result.issue).toBeUndefined();
});
```

- [x] 完了

## Task 6: 既存テストの regression 確認

`bun run typecheck && bun run test` で全テスト green を確認。

- [x] 完了 (172 files, 2050 tests all passed)

## Task 7: spec 更新 (delta)

### 7a: request-md-parser spec に issue 抽出 Requirement を追加

**File**: `specrunner/specs/request-md-parser/spec.md`

Requirement 追加:

> parser は request.md Meta セクションの `issue` field を抽出する (optional)。
> `- **issue**: #279` → `parsedRequest.issue = "#279"`。
> issue field 不在 → `parsedRequest.issue = undefined`、エラーは発生しない。

- [x] 完了

### 7b: pr-create-runner spec の body template Requirement を更新

**File**: `specrunner/specs/pr-create-runner/spec.md`

既存 Requirement「PR body template is generated from request.md and pipeline state」に追記:

> `renderPrBody` は `parsedRequest.issue` が存在する場合、Summary section の直後に `Fixes ${issue}` 行を挿入する。issue が undefined のとき挿入しない。

- [x] 完了
