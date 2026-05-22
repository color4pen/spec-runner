# Tasks: finish Phase 1 spec-merge idempotency

## [x] Task 1: `mergeSpecsForChange` に change folder 不在チェックを追加

**File**: `src/core/finish/spec-merge.ts`
**Function**: `mergeSpecsForChange` (L532-559)

`readFile(request.md)` の前に `fs.exists(changeFolderAbsPath)` チェックを挿入する。

### 具体的な変更

L540 (`const requestMdAbsPath = ...`) の **前** に以下を追加:

```typescript
// Guard: change folder absent → skip (idempotent for re-run after Phase 1 already archived)
const changeFolderAbsPath = path.join(cwd, changeFolderPath(slug));
const changeFolderExists = await fs.exists(changeFolderAbsPath);
if (!changeFolderExists) {
  return {
    ok: true,
    skipped: true,
    message: "spec-merge skipped: change folder not found",
  };
}
```

既存の try/catch (`readFile` + `parseRequestMdContent`) はそのまま残す。change folder が存在するのに request.md が壊れているケースは従来どおり escalation になる。

### 受け入れ基準との対応
- AC1: change folder 不在 → `skipped: true`
- AC4: request.md parse 不能 → 従来どおり escalation（try/catch は変更なし）

---

## [x] Task 2: unit test — change folder 不在で skip (TC-SM-069)

**File**: `tests/finish-spec-merge.test.ts`

`TC-SM-070` の直前に `TC-SM-069` を追加:

```typescript
describe("TC-SM-069: mergeSpecsForChange — skip when change folder absent", () => {
  it("returns ok:true skipped:true without reading request.md", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(false), // change folder does not exist
      readFile: vi.fn().mockRejectedValue(new Error("ENOENT: should not be called")),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("change folder not found");
    // readFile should NOT have been called
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
```

### 受け入れ基準との対応
- AC1: unit test で `skipped: true` を検証

---

## [x] Task 3: unit test — request.md parse 不能で escalation 維持 (TC-SM-068)

**File**: `tests/finish-spec-merge.test.ts`

TC-SM-069 の直前に TC-SM-068 を追加:

```typescript
describe("TC-SM-068: mergeSpecsForChange — parse error escalation when change folder exists", () => {
  it("returns ok:false escalation when request.md exists but is unparseable", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(true), // change folder exists
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("request.md")) return Promise.resolve("not valid yaml front matter garbage");
        return Promise.resolve("");
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation).toContain("spec-merge (request.md)");
  });
});
```

### 受け入れ基準との対応
- AC3: parse 不能時の escalation が regression していないことを検証

---

## [x] Task 3.5: TC-SM-070 の `exists` mock を path 分岐に更新

**File**: `tests/finish-spec-merge.test.ts`

TC-SM-070 の `exists` mock を `mockResolvedValue(false)` から path 判別実装に変更する。Task 1 適用後、`mergeSpecsForChange` は最初に `fs.exists(changeFolderAbsPath)` を呼ぶため、全パス `false` では新しいガードが発火して change folder 不在 skip パスに入ってしまう。

```typescript
exists: vi.fn().mockImplementation((p: string) => {
  if (p.endsWith("specs")) return Promise.resolve(false); // specs/ dir absent
  return Promise.resolve(true);                           // change folder present
}),
```

これにより TC-SM-070 は Task 1 のガードを通過し、引き続き specs/-absent skip パスをカバーする。

### 受け入れ基準との対応
- AC1: TC-SM-070 が Task 1 適用後も正しいコードパスを検証し続けることを保証

---

## [x] Task 4: TC-103 integration test の mock 修正

**File**: `tests/finish-orchestrator.test.ts`

`makeStubFs` の `readFile` mock を修正し、change folder 不在時に request.md へのアクセスが ENOENT を投げるようにする。現在の mock は `changeFolderExists` に関係なく request.md に valid content を返しており、実際のバグを隠している。

### 具体的な変更

`makeStubFs` 内の `readFile` を修正:

```typescript
readFile: vi.fn().mockImplementation((p: string) => {
  if (p.endsWith("request.md")) {
    if (!changeFolderExists) {
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    }
    return Promise.resolve(STUB_REQUEST_MD);
  }
  return Promise.resolve("");
}),
```

この変更により TC-103 は Task 1 の修正後にのみ pass する（修正前は ENOENT → escalation で fail）。

### 受け入れ基準との対応
- AC2: integration level で Phase 1 skip → Phase 3 merge を検証

---

## [x] Task 5: typecheck + test green 確認

```bash
bun run typecheck && bun run test
```

### 受け入れ基準との対応
- AC4: `bun run typecheck && bun run test` が green
