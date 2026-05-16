# Code Review: managed-reset-status-stale-guard — iter 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-16

---

## Summary

実装は仕様通りに正しく動作している。`hasStaleManagedConfig` ヘルパー、`managed status` の stale 列挙、`managed reset` の runtime 不一致 guard、TTY 判定、`--force` bypass、二重確認防止、完了メッセージの出し分け、`spec.md` 新設、spec authority 分離——すべて設計通り。typecheck / test も全 green。

ただし test-cases.md の **must 優先度テストケース 4 件が未カバー**。

---

## Findings

### F-01: TC-MST-NEW-002 未カバー (severity: medium)

**priority: must** のテストケースが実装されていない。

> TC-MST-NEW-002 — runtime: local + agents のみ stale → agents のみ列挙され `environment.id` は出力されない

`managed status` の stale 列挙は `environment.id` と `agents` を別々の if/for で出力する。`5-a` は両方が存在するケースのみカバーしており、「agents のみ」のケースで environment.id が誤出力されるリグレッションを検出できない。

**修正**: 以下を `runManagedStatus` の describe に追加する。

```typescript
it("lists only agents when only agents are stale (TC-MST-NEW-002)", async () => {
  await writeConfig({
    version: 1,
    agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
    // no environment field
  });

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const { runManagedStatus } = await import("../../../src/cli/managed.js");
  await runManagedStatus();

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).toContain("Stale managed config detected:");
  expect(output).toContain("agents.design: agent_001");
  expect(output).not.toContain("environment.id");
});
```

---

### F-02: TC-MST-NEW-003 未カバー (severity: medium)

**priority: must** のテストケースが実装されていない。

> TC-MST-NEW-003 — runtime: local + environment.id のみ stale → environment.id のみ列挙され `agents` は出力されない

`5-a` は両方存在するケースのみ。「environment.id のみ」のケースで agents 行が誤出力されるリグレッションを検出できない。

**修正**:

```typescript
it("lists only environment.id when only environment is stale (TC-MST-NEW-003)", async () => {
  await writeConfig({
    version: 1,
    agents: {},
    environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
  });

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const { runManagedStatus } = await import("../../../src/cli/managed.js");
  await runManagedStatus();

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).toContain("Stale managed config detected:");
  expect(output).toContain("environment.id: env_001");
  expect(output).not.toContain("agents.");
});
```

---

### F-03: TC-MR-NEW-004 未カバー (severity: medium)

**priority: must** のテストケースが実装されていない。

> TC-MR-NEW-004 — runtime: local + TTY + stdin `y` → reset が進行

`5-f` は TTY + `n` → abort のみカバー。TTY + `y` → reset 進行のハッピーパスが未テスト。`promptConfirm` の `y` 分岐（`managed` でない stale path）はこのテストなしに正しさが担保されない。

**修正**:

```typescript
it("resets stale config when TTY user answers 'y' (TC-MR-NEW-004)", async () => {
  await writeConfig({
    version: 1,
    agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
  });

  const originalIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

  const readline = await import("node:readline");
  vi.mocked(readline.createInterface).mockReturnValue({
    question: vi.fn().mockImplementation((_msg: string, cb: (ans: string) => void) => cb("y")),
    close: vi.fn(),
  } as unknown as import("node:readline").Interface);

  const { runManagedReset } = await import("../../../src/cli/managed.js");
  await runManagedReset({ force: false });

  Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });

  const saved = await readConfig();
  expect(saved["agents"]).toEqual({});
  expect(saved["environment"]).toBeUndefined();
});
```

---

### F-04: TC-MR-NEW-012 未カバー (severity: low)

**priority: must** のテストケースが assertion として実装されていない。

> TC-MR-NEW-012 — runtime: local + stale + `--force` で既存の destructive prompt `"This will delete the Anthropic Environment"` が出ない

コードの if/else 分岐構造上、二重確認は起きないことが保証されているが、test-cases.md で must として定義された要件を assertion で明示していない。`5-d` に `not.toContain` を追加することで閉じられる。

**修正**: test `5-d` の末尾に追加:

```typescript
// no existing destructive prompt should appear
const stdoutOutput = stdoutSpy.mock.calls.map((c) => c[0]).join("");
expect(stdoutOutput).not.toContain("This will delete the Anthropic Environment");
```

また `stdoutSpy` が `5-d` では宣言されていないため追加が必要。

---

## Positive Observations

- `hasStaleManagedConfig` のヘルパー分離が明瞭。`environment?.id` の truthy チェックと `agents ?? {}` の length チェックが設計通り。
- non-TTY 判定を `promptConfirm` 呼び出し前に行う設計（D1）が `rm/runner.ts` パターンに準拠しており一貫性がある。
- 二重確認防止の分岐構造（D2）が if/else で明確に分離されており、構造的に correctness が保証されている。
- `runtime !== "managed"` path の完了メッセージを `"Reset stale managed fields."` に分ける D3 の判断が適切。
- `managed-agent-runtime/spec.md` / `cli-commands/spec.md` が変更されていないことを確認した（TC-SPEC-002/003 ✅）。
- `specrunner/specs/managed-cli-commands/spec.md` が正しく新設され、4 つの Requirement と Scenario が網羅されている（TC-SPEC-001 ✅）。
- `MANAGED_RESET_USAGE` の `--force` help text に `(including when runtime is not managed)` が追加されている（TC-HELP-001 ✅）。
- verification-result.md で typecheck / test / build がすべて green（TC-TYPE-001/002 ✅）。

---

## Fix Scope

F-01〜F-03 は `tests/unit/cli/managed.test.ts` へのテスト追加のみ。F-04 は既存テストへの assertion 追加のみ。実装コード変更は不要。
