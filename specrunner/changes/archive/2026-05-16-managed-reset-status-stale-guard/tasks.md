# Tasks: managed-reset-status-stale-guard

## [x] T-01: `hasStaleManagedConfig` ヘルパーを追加

**ファイル**: `src/cli/managed.ts`

`managed.ts` 内に以下のヘルパー関数を追加する:

```typescript
function hasStaleManagedConfig(config: SpecRunnerConfig): boolean {
  if (config.environment?.id) return true;
  if (Object.keys(config.agents ?? {}).length > 0) return true;
  return false;
}
```

- export しない（モジュール内部関数）
- テストは T-05 で間接的に検証する

---

## [x] T-02: `runManagedStatus` を拡張

**ファイル**: `src/cli/managed.ts`

`runManagedStatus()` の `config.runtime !== "managed"` 分岐（L141-144）を拡張する。

### 現在のコード (L141-144):

```typescript
if (config.runtime !== "managed") {
  process.stdout.write("Runtime: local (managed setup not required)\n");
  return;
}
```

### 変更後:

```typescript
if (config.runtime !== "managed") {
  process.stdout.write("Runtime: local (managed setup not required)\n");
  if (hasStaleManagedConfig(config)) {
    process.stdout.write("Stale managed config detected:\n");
    if (config.environment?.id) {
      process.stdout.write(`  - environment.id: ${config.environment.id}\n`);
    }
    for (const [role, record] of Object.entries(config.agents ?? {})) {
      process.stdout.write(`  - agents.${role}: ${record.agentId}\n`);
    }
  }
  return;
}
```

- stale なし → 既存通り 1 行で完結（挙動変更なし）
- stale あり → 2 行目以降に列挙

---

## [x] T-03: `runManagedReset` に runtime 不一致 guard を追加

**ファイル**: `src/cli/managed.ts`

`runManagedReset()` の構造を大きく変更する。config load 後に runtime 分岐を入れ、既存の destructive prompt との二重確認を防ぐ。

### 変更の要点:

1. config load 直後（L172 の後）に `config.runtime !== "managed"` 分岐を追加
2. stale なしの場合は早期 return（`"No stale managed config. Nothing to reset."` を stdout に出力）
3. stale ありの場合:
   - stderr に警告: `Warning: runtime is "${config.runtime ?? "local"}", not "managed". This will reset stale managed fields only.`
   - `!force && !process.stdin.isTTY` → stdout に `"Non-interactive mode requires --force to reset stale config."` + return
   - `!force` → `promptConfirm("Proceed? [y/N] ")` → `n` → `"Aborted."` + return
   - SDK delete: `environment.id` が truthy かつ `apiKey` がある場合のみ（既存ロジック再利用）
   - config 更新: `agents: {}` + `environment` 削除（既存ロジック再利用）
   - `logSuccess("Reset stale managed fields.")`
   - orphan warning は出力しない（stale cleanup なので新規 orphan は生まれない）
   - return（既存の managed path に落ちない）
4. `config.runtime === "managed"` の場合は既存コード（L173-214）をそのまま維持

### 擬似コード:

```typescript
export async function runManagedReset(opts: { force: boolean }): Promise<void> {
  const apiKey = process.env["SPECRUNNER_API_KEY"];

  let config: SpecRunnerConfig;
  try {
    config = await loadConfig();
  } catch (err) {
    process.stderr.write(`Error loading config: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // --- NEW: runtime mismatch guard ---
  if (config.runtime !== "managed") {
    if (!hasStaleManagedConfig(config)) {
      process.stdout.write("No stale managed config. Nothing to reset.\n");
      return;
    }

    process.stderr.write(
      `Warning: runtime is "${config.runtime ?? "local"}", not "managed". This will reset stale managed fields only.\n`,
    );

    if (!opts.force) {
      const isTTY = (process.stdin as NodeJS.ReadStream).isTTY ?? false;
      if (!isTTY) {
        process.stdout.write("Non-interactive mode requires --force to reset stale config.\n");
        return;
      }
      const confirmed = await promptConfirm("Proceed? [y/N] ");
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }
    }

    // SDK delete if environment.id present
    if (config.environment?.id && apiKey) {
      const rawSdk = createAnthropicClient(apiKey);
      try {
        await rawSdk.beta.environments.delete(config.environment.id);
        logSuccess(`Environment deleted (${config.environment.id})`);
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          logStep(`Environment ${config.environment.id} not found on provider side (already deleted)`);
        } else {
          throw err;
        }
      }
    } else if (config.environment?.id && !apiKey) {
      process.stderr.write("Warning: SPECRUNNER_API_KEY not set — skipping provider-side environment deletion.\n");
    }

    // Clear stale fields
    const { environment: _env, ...rest } = config;
    const newConfig: SpecRunnerConfig = { ...rest, agents: {} };
    delete (newConfig as unknown as Record<string, unknown>)["runtime"];
    await saveConfig(newConfig);
    logSuccess("Reset stale managed fields.");
    return;
  }

  // --- EXISTING: managed runtime path (unchanged) ---
  if (!opts.force) {
    const confirmed = await promptConfirm(
      "This will delete the Anthropic Environment and clear managed config. Continue? [y/N] ",
    );
    if (!confirmed) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  // ... (rest of existing code unchanged)
}
```

---

## [x] T-04: `MANAGED_RESET_USAGE` の help text を更新

**ファイル**: `src/cli/command-registry.ts`

`MANAGED_RESET_USAGE` (L94-104) の `--force` の説明を更新する。

### 現在:

```
  --force   Skip confirmation prompt
```

### 変更後:

```
  --force   Skip confirmation prompt (including when runtime is not managed)
```

---

## [x] T-05: テストケースを追加

**ファイル**: `tests/unit/cli/managed.test.ts`

### 5-a: `managed status` — runtime: local + stale config で stale 列挙

```typescript
it("shows stale managed config when runtime is not managed", async () => {
  await writeConfig({
    version: 1,
    agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
  });

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const { runManagedStatus } = await import("../../../src/cli/managed.js");
  await runManagedStatus();

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).toContain("Stale managed config detected:");
  expect(output).toContain("environment.id: env_001");
  expect(output).toContain("agents.design: agent_001");
});
```

### 5-b: `managed status` — runtime: local + stale なしで 1 行のみ

```typescript
it("shows only local message when no stale config", async () => {
  await writeConfig({ version: 1, agents: {} });

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const { runManagedStatus } = await import("../../../src/cli/managed.js");
  await runManagedStatus();

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).toContain("local");
  expect(output).not.toContain("Stale");
});
```

### 5-c: `managed status` — runtime: managed で従来通り (regression)

既存テスト `TC-MST-001` がカバーしている。追加不要だが、テスト名を確認して regression として意識する。

### 5-d: `managed reset` — runtime: local + `--force` で警告のみで進行

```typescript
it("resets stale config with --force when runtime is not managed", async () => {
  await writeConfig({
    version: 1,
    agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
  });

  // No API key — SDK delete skipped with warning
  delete process.env["SPECRUNNER_API_KEY"];

  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const { runManagedReset } = await import("../../../src/cli/managed.js");
  await runManagedReset({ force: true });

  const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
  expect(stderrOutput).toContain("runtime is");
  expect(stderrOutput).toContain("not \"managed\"");

  const saved = await readConfig();
  expect(saved["agents"]).toEqual({});
  expect(saved["environment"]).toBeUndefined();
});
```

### 5-e: `managed reset` — runtime: local + `--force` 無し + non-TTY → 中断

```typescript
it("aborts in non-TTY mode without --force when runtime is not managed", async () => {
  await writeConfig({
    version: 1,
    agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
    environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
  });

  // process.stdin.isTTY is undefined in test environment (= non-TTY)
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const { runManagedReset } = await import("../../../src/cli/managed.js");
  await runManagedReset({ force: false });

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).toContain("--force");

  // Config should be unchanged
  const saved = await readConfig();
  expect((saved["agents"] as Record<string, unknown>)?.["design"]).toBeDefined();
});
```

### 5-f: `managed reset` — runtime: local + stdin `n` → 中断

TTY mock が必要。`process.stdin` に `isTTY = true` を設定し、readline mock で `n` を返す。

```typescript
it("aborts when user answers 'n' to stale reset prompt", async () => {
  await writeConfig({
    version: 1,
    agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
  });

  // Mock TTY
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

  const readline = await import("node:readline");
  vi.mocked(readline.createInterface).mockReturnValue({
    question: vi.fn().mockImplementation((_msg: string, cb: (ans: string) => void) => cb("n")),
    close: vi.fn(),
  } as unknown as import("node:readline").Interface);

  const { runManagedReset } = await import("../../../src/cli/managed.js");
  await runManagedReset({ force: false });

  const saved = await readConfig();
  expect((saved["agents"] as Record<string, unknown>)?.["design"]).toBeDefined();
});
```

### 5-g: `managed reset` — runtime: managed で従来通り (regression)

既存テスト `TC-MR-001` / `TC-MR-002` / `TC-MR-003` がカバー。追加不要。

### 5-h: `managed reset` — stale なしで早期 return

```typescript
it("does nothing when no stale config and runtime is not managed", async () => {
  await writeConfig({ version: 1, agents: {} });

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const { runManagedReset } = await import("../../../src/cli/managed.js");
  await runManagedReset({ force: true });

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).toContain("Nothing to reset");
});
```

---

## [x] T-06: delta spec 作成 — 新規 capability `managed-cli-commands`

**新規ディレクトリ**: `specrunner/changes/managed-reset-status-stale-guard/delta-spec/`
**新規ファイル**: `specrunner/changes/managed-reset-status-stale-guard/delta-spec/managed-cli-commands.md`

capability `managed-cli-commands` を ADDED で新設する。内容は request.md の「spec authority への反映」セクションに記載された Requirement / Scenario を含める。

---

## [x] T-07: 型チェック + テスト実行

```bash
bun run typecheck && bun run test
```

全 green を確認する。

---

## 受け入れ基準（チェックリスト）

- [x] `managed status` が `runtime != managed` で stale managed config を列挙する
- [x] `managed reset` が `runtime != managed` で警告 + 確認 prompt を出す
- [x] `managed reset --force` で確認 prompt が bypass される
- [x] non-TTY 環境 + `--force` 無しで `managed reset` が安全に中断する
- [x] `runtime == managed` の既存挙動が regression していない (test 付き)
- [x] 新規 capability `specrunner/specs/managed-cli-commands/spec.md` が ADDED で作成される
- [x] `managed-agent-runtime/spec.md` / `cli-commands/spec.md` は変更されていない
- [x] `bun run typecheck && bun run test` が green
