# Test Cases: managed-reset-status-stale-guard

## Summary

`managed status` / `managed reset` が `runtime !== "managed"` の状態で安全に振る舞うことを検証する。stale config の可視化、destructive 操作前の確認、non-TTY 中断、`--force` bypass、および既存 managed パスの regression が主な検証軸。

---

## Category: managed-status

### TC-MST-NEW-001

- **Title**: runtime: local + stale config (両方) で stale 列挙
- **Priority**: must
- **Source**: req-1 (managed status 拡張)

**GIVEN** config に `runtime` が未設定 (local) かつ `agents.design: agent_001`、`environment.id: env_001` が存在する  
**WHEN** `managed status` を実行する  
**THEN**
- stdout に `Runtime: local (managed setup not required)` が含まれる
- stdout に `Stale managed config detected:` が含まれる
- stdout に `  - environment.id: env_001` が含まれる
- stdout に `  - agents.design: agent_001` が含まれる

---

### TC-MST-NEW-002

- **Title**: runtime: local + agents のみ stale で agents が列挙される
- **Priority**: must
- **Source**: req-1

**GIVEN** config に `runtime` が未設定かつ `agents.design: agent_001` が存在し、`environment.id` は未設定  
**WHEN** `managed status` を実行する  
**THEN**
- stdout に `Stale managed config detected:` が含まれる
- stdout に `  - agents.design: agent_001` が含まれる
- stdout に `environment.id` は含まれない

---

### TC-MST-NEW-003

- **Title**: runtime: local + environment.id のみ stale で environment.id が列挙される
- **Priority**: must
- **Source**: req-1

**GIVEN** config に `runtime` が未設定かつ `environment.id: env_001` が存在し、`agents` は `{}` (空)  
**WHEN** `managed status` を実行する  
**THEN**
- stdout に `Stale managed config detected:` が含まれる
- stdout に `  - environment.id: env_001` が含まれる
- stdout に `agents` は含まれない

---

### TC-MST-NEW-004

- **Title**: runtime: local + stale なしで 1 行のみ
- **Priority**: must
- **Source**: req-1

**GIVEN** config に `runtime` が未設定かつ `agents: {}` (空)、`environment.id` 未設定  
**WHEN** `managed status` を実行する  
**THEN**
- stdout に `Runtime: local (managed setup not required)` が含まれる
- stdout に `Stale` は含まれない
- stdout に `environment.id` は含まれない

---

### TC-MST-NEW-005

- **Title**: runtime: managed で従来通り (regression)
- **Priority**: must
- **Source**: req-1, req-5 (regression)

**GIVEN** config に `runtime: "managed"` が設定されている  
**WHEN** `managed status` を実行する  
**THEN**
- `Runtime: local` は出力されない
- managed ステータス (agents / environment / sync 状態) が既存フォーマットで出力される
- `Stale managed config detected:` は出力されない

---

### TC-MST-NEW-006

- **Title**: runtime: local + agents が複数ロールで全ロール列挙される
- **Priority**: should
- **Source**: req-1

**GIVEN** config に `runtime` が未設定かつ `agents: { design: { agentId: "agent_001", ... }, review: { agentId: "agent_002", ... } }` が存在する  
**WHEN** `managed status` を実行する  
**THEN**
- stdout に `  - agents.design: agent_001` が含まれる
- stdout に `  - agents.review: agent_002` が含まれる

---

## Category: managed-reset

### TC-MR-NEW-001

- **Title**: runtime: local + stale なしで早期 return "Nothing to reset"
- **Priority**: must
- **Source**: req-2, req-3 (data flow: stale false → early return)

**GIVEN** config に `runtime` が未設定かつ `agents: {}` (空)、`environment.id` 未設定  
**WHEN** `managed reset` を実行する (`--force` の有無問わず)  
**THEN**
- stdout に `No stale managed config. Nothing to reset.` が含まれる
- config は変更されない
- exit code は 0

---

### TC-MR-NEW-002

- **Title**: runtime: local + stale + `--force` で警告のみで reset が進行
- **Priority**: must
- **Source**: req-2, req-3, req-4

**GIVEN** config に `runtime` が未設定かつ `agents.design: agent_001`、`environment.id: env_001` が存在する。`SPECRUNNER_API_KEY` は未設定  
**WHEN** `managed reset --force` を実行する  
**THEN**
- stderr に `Warning: runtime is` と `not "managed"` が含まれる
- 確認 prompt は表示されない
- reset 後の config で `agents` が `{}` になる
- reset 後の config で `environment` が削除されている
- stdout に `Reset stale managed fields.` が含まれる

---

### TC-MR-NEW-003

- **Title**: runtime: local + stale + `--force` 無し + non-TTY → 中断
- **Priority**: must
- **Source**: req-2

**GIVEN** config に `runtime` が未設定かつ stale config が存在する。`process.stdin.isTTY` が falsy (テスト環境 = non-TTY)  
**WHEN** `managed reset` を `--force` 無しで実行する  
**THEN**
- stdout に `--force` に言及するメッセージが含まれる (`Non-interactive mode requires --force to reset stale config.` 等)
- config は変更されない
- exit code は 0 (no-op)

---

### TC-MR-NEW-004

- **Title**: runtime: local + TTY + stdin `y` → reset が進行
- **Priority**: must
- **Source**: req-2

**GIVEN** config に `runtime` が未設定かつ stale config が存在する。`process.stdin.isTTY = true` (TTY mock)。readline が `y` を返すよう mock  
**WHEN** `managed reset` を `--force` 無しで実行する  
**THEN**
- stderr に `Warning: runtime is` と `not "managed"` が含まれる
- `Proceed? [y/N]` prompt が表示される
- reset 後の config で `agents` が `{}` になる
- stdout に `Reset stale managed fields.` が含まれる

---

### TC-MR-NEW-005

- **Title**: runtime: local + TTY + stdin `n` → 中断
- **Priority**: must
- **Source**: req-2, req-5

**GIVEN** config に `runtime` が未設定かつ stale config (agents に design ロール) が存在する。`process.stdin.isTTY = true` (TTY mock)。readline が `n` を返すよう mock  
**WHEN** `managed reset` を `--force` 無しで実行する  
**THEN**
- stdout に `Aborted.` が含まれる
- config は変更されない (`agents.design` が維持されている)
- exit code は 0

---

### TC-MR-NEW-006

- **Title**: runtime: local + TTY + stdin 空 Enter → 中断 (デフォルト No)
- **Priority**: should
- **Source**: req-2 (`y` 以外は中断)

**GIVEN** config に `runtime` が未設定かつ stale config が存在する。`process.stdin.isTTY = true`。readline が空文字列 `""` を返すよう mock  
**WHEN** `managed reset` を `--force` 無しで実行する  
**THEN**
- stdout に `Aborted.` が含まれる
- config は変更されない

---

### TC-MR-NEW-007

- **Title**: runtime: local + stale + `--force` + `environment.id` あり + API key あり → SDK delete 呼ばれる
- **Priority**: should
- **Source**: req-3

**GIVEN** config に `runtime` が未設定かつ `environment.id: env_001` が存在する。`SPECRUNNER_API_KEY` が設定されている。SDK の `environments.delete` が mock されている  
**WHEN** `managed reset --force` を実行する  
**THEN**
- SDK の `environments.delete("env_001")` が呼ばれる
- reset 後の config で `environment` が削除されている
- stdout に `Reset stale managed fields.` が含まれる

---

### TC-MR-NEW-008

- **Title**: runtime: local + stale + `--force` + `environment.id` あり + API key なし → SDK delete スキップ・警告
- **Priority**: should
- **Source**: req-3

**GIVEN** config に `runtime` が未設定かつ `environment.id: env_001` が存在する。`SPECRUNNER_API_KEY` は未設定  
**WHEN** `managed reset --force` を実行する  
**THEN**
- SDK の `environments.delete` は呼ばれない
- stderr に API key 未設定に関する警告が含まれる
- reset 後の config で `environment` が削除されている
- stdout に `Reset stale managed fields.` が含まれる

---

### TC-MR-NEW-009

- **Title**: runtime: local + stale + `--force` + `environment.id` あり + SDK が 404 → 正常続行
- **Priority**: should
- **Source**: req-3 (既存ロジック再利用)

**GIVEN** config に `runtime` が未設定かつ `environment.id: env_001` が存在する。`SPECRUNNER_API_KEY` が設定されている。SDK の `environments.delete` が HTTP 404 を throw するよう mock  
**WHEN** `managed reset --force` を実行する  
**THEN**
- エラーで中断しない
- stdout に `not found on provider side` 等のメッセージが含まれる
- reset 後の config で `environment` が削除されている

---

### TC-MR-NEW-010

- **Title**: runtime: managed で従来通り (regression)
- **Priority**: must
- **Source**: req-5 (regression)

**GIVEN** config に `runtime: "managed"` が設定されている  
**WHEN** `managed reset --force` を実行する  
**THEN**
- 新規の `runtime 不一致` 警告は出力されない
- `Reset stale managed fields.` は出力されない
- 既存の `Config reset.` が出力される
- managed 環境への SDK delete が呼ばれる (environment.id が存在する場合)

---

### TC-MR-NEW-011

- **Title**: runtime: managed + `--force` 無し → 既存 destructive prompt が表示される (regression)
- **Priority**: must
- **Source**: req-2 (二重確認防止の逆: managed path では既存 prompt のみ), req-5

**GIVEN** config に `runtime: "managed"` が設定されている  
**WHEN** `managed reset` を `--force` 無しで実行する (TTY mock、readline が `n` を返す)  
**THEN**
- 既存の `This will delete the Anthropic Environment...` 確認 prompt が表示される
- 新規の `Warning: runtime is ... not "managed"` は出力されない
- `n` 応答で `Aborted.` が出力される

---

### TC-MR-NEW-012

- **Title**: runtime: local + stale + `--force` で既存 destructive prompt が出ない (二重確認防止)
- **Priority**: must
- **Source**: req-2 (二重確認の防止)

**GIVEN** config に `runtime` が未設定かつ stale config が存在する  
**WHEN** `managed reset --force` を実行する  
**THEN**
- `This will delete the Anthropic Environment` という文言は出力されない
- 確認 prompt は一切表示されない

---

## Category: stale-detection

### TC-STL-001

- **Title**: `hasStaleManagedConfig` — environment.id が truthy → true
- **Priority**: must
- **Source**: req-1, req-2 (stale 判定基準)

**GIVEN** config オブジェクトに `environment: { id: "env_001" }` が存在し、`agents: {}` (空)  
**WHEN** `hasStaleManagedConfig(config)` を評価する  
**THEN** `true` が返る

---

### TC-STL-002

- **Title**: `hasStaleManagedConfig` — agents が非空 → true
- **Priority**: must
- **Source**: req-1, req-2

**GIVEN** config オブジェクトに `agents: { design: { agentId: "agent_001", ... } }` が存在し、`environment.id` は未設定  
**WHEN** `hasStaleManagedConfig(config)` を評価する  
**THEN** `true` が返る

---

### TC-STL-003

- **Title**: `hasStaleManagedConfig` — agents 空 + environment.id 未設定 → false
- **Priority**: must
- **Source**: req-1, req-2

**GIVEN** config オブジェクトに `agents: {}` (空)、`environment` 未設定  
**WHEN** `hasStaleManagedConfig(config)` を評価する  
**THEN** `false` が返る

---

### TC-STL-004

- **Title**: `hasStaleManagedConfig` — environment が存在するが id が falsy → false
- **Priority**: should
- **Source**: req-1, req-2 (truthy チェック)

**GIVEN** config オブジェクトに `environment: {}` (id なし)、`agents: {}` (空)  
**WHEN** `hasStaleManagedConfig(config)` を評価する  
**THEN** `false` が返る

---

## Category: spec-authority

### TC-SPEC-001

- **Title**: 新規 capability spec `managed-cli-commands` が ADDED で存在する
- **Priority**: must
- **Source**: req-6

**GIVEN** 実装が完了している  
**WHEN** `specrunner/specs/managed-cli-commands/spec.md` を参照する  
**THEN**
- ファイルが存在する
- `managed status` の stale 列挙 Requirement が記述されている
- `managed reset` の runtime 不一致 guard Requirement が記述されている
- `--force` による bypass Requirement が記述されている
- non-TTY 中断 Requirement が記述されている

---

### TC-SPEC-002

- **Title**: `managed-agent-runtime/spec.md` が変更されていない
- **Priority**: must
- **Source**: req-6

**GIVEN** 実装が完了している  
**WHEN** `specrunner/specs/managed-agent-runtime/spec.md` を参照する  
**THEN** ファイルの内容が base-branch から変更されていない

---

### TC-SPEC-003

- **Title**: `cli-commands/spec.md` が変更されていない
- **Priority**: must
- **Source**: req-6

**GIVEN** 実装が完了している  
**WHEN** `specrunner/specs/cli-commands/spec.md` を参照する  
**THEN** ファイルの内容が base-branch から変更されていない

---

## Category: help-text

### TC-HELP-001

- **Title**: `managed reset --help` に runtime 不一致時 bypass の説明が含まれる
- **Priority**: should
- **Source**: req-4 (--force help text 更新)

**GIVEN** `command-registry.ts` の `MANAGED_RESET_USAGE` が更新されている  
**WHEN** `managed reset --help` を実行する (または usage 文字列を参照する)  
**THEN** `--force` の説明に `runtime is not managed` または相当する文言が含まれる

---

## Category: typecheck

### TC-TYPE-001

- **Title**: `bun run typecheck` が green
- **Priority**: must
- **Source**: req-5 (受け入れ基準)

**GIVEN** T-01〜T-06 の実装が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件

---

### TC-TYPE-002

- **Title**: `bun run test` が green
- **Priority**: must
- **Source**: req-5 (受け入れ基準)

**GIVEN** T-01〜T-06 の実装が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass (既存テスト含む regression なし)
