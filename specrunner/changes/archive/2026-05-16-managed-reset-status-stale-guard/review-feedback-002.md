# Code Review: managed-reset-status-stale-guard — iter 2

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-16

---

## Summary

iter 1 の F-01（TC-MST-NEW-002）、F-02（TC-MST-NEW-003）、F-03（TC-MR-NEW-004）はすべて正しく修正されている。実装コードに変更はなく、変更はテスト追加のみ。

残る未解決は F-04（TC-MR-NEW-012）のみ。test-cases.md で **must** と定義されているアサーションが iter 2 でも未追加。

---

## Findings

### F-01: TC-MR-NEW-012 アサーション未追加（severity: low）

iter 1 F-04 が未修正のまま。

> TC-MR-NEW-012 — `runtime: local` + stale + `--force` で既存の destructive prompt `"This will delete the Anthropic Environment"` が出力されない（二重確認防止）

test-cases.md の priority は **must**。`5-d` に `stdoutSpy` のキャプチャと `not.toContain` アサーションが追加されていない。

コードの if/else 分岐構造上、runtime 不一致パスで既存 destructive prompt が出力されないことは静的に保証されているが、テストケース仕様として明示的に義務付けられている。

**修正**: テスト `5-d`（`"resets stale config with --force when runtime is not managed"`）の末尾に以下を追加する。

```typescript
// TC-MR-NEW-012: existing destructive prompt must NOT appear on stale path
const stdoutSpy2 = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
const stdoutOutput = stdoutSpy2.mock.calls.map((c) => c[0]).join("");
```

ただし `beforeEach` で既に `process.stdout.write` を spy しているため、テスト内で再度 `vi.spyOn` すると二重になる。より単純な修正として、`5-d` に local `stdoutSpy` を宣言してから assertion を追加する:

```typescript
it("resets stale config with --force when runtime is not managed (5-d)", async () => {
  await writeConfig({
    version: 1,
    agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
  });

  delete process.env["SPECRUNNER_API_KEY"];

  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const { runManagedReset } = await import("../../../src/cli/managed.js");
  await runManagedReset({ force: true });

  const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
  expect(stderrOutput).toContain("runtime is");
  expect(stderrOutput).toContain('not "managed"');

  // TC-MR-NEW-012: existing destructive prompt must NOT appear (no double confirmation)
  const stdoutOutput = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(stdoutOutput).not.toContain("This will delete the Anthropic Environment");

  const saved = await readConfig();
  expect(saved["agents"]).toEqual({});
  expect(saved["environment"]).toBeUndefined();
});
```

---

## iter 1 Findings 解決状況

| Finding | 内容 | 解決状況 |
|---------|------|----------|
| F-01 | TC-MST-NEW-002 テスト未追加 | ✅ 解決（lines 250–265） |
| F-02 | TC-MST-NEW-003 テスト未追加 | ✅ 解決（lines 267–282） |
| F-03 | TC-MR-NEW-004 テスト未追加 | ✅ 解決（lines 485–508） |
| F-04 | TC-MR-NEW-012 アサーション未追加 | ❌ 未解決（本 F-01） |

---

## Positive Observations

- TC-MST-NEW-002: agents のみ stale のケースで `not.toContain("environment.id")` が正しく assertions されている。
- TC-MST-NEW-003: environment.id のみ stale のケースで `not.toContain("agents.")` が正しく assertions されている。
- TC-MR-NEW-004: TTY + stdin `y` での reset 進行ケースが追加され、stale path の `promptConfirm` 正常系が網羅された。
- `isTTY` の mock/restore パターン（`Object.defineProperty` + configurable restore）が TC-MR-NEW-004 でも正しく実装されている。

---

## Fix Scope

`tests/unit/cli/managed.test.ts` の既存テスト `5-d` への `stdoutSpy` 宣言と `not.toContain` アサーション追加のみ。実装コード変更は不要。
