# Test Cases: managed-command-extraction

## Summary

`specrunner managed` 親コマンド（setup / status / reset）の新設、`init` の責務縮小、config schema の `anthropic` フィールド削除、runtime デフォルト反転、`checkRuntimePrereqs` 新設、doctor check registry 分離を検証するテストケース集。

## Categories

| Category | Description |
|----------|-------------|
| managed-setup | `specrunner managed setup` の動作検証 |
| managed-status | `specrunner managed status` の動作検証 |
| managed-reset | `specrunner managed reset` の動作検証 |
| init | `specrunner init` 責務縮小後の動作 |
| config-schema | `anthropic` フィールド削除・runtime デフォルト反転 |
| preflight | `checkRuntimePrereqs` 関数の検証 |
| doctor | check registry 分離と runtime 別実行 |
| api-key-migration | `config.anthropic.apiKey` → env var 置き換え箇所 |
| help | help 表示・フロー例示の更新 |

---

## managed-setup

### TC-MS-001
- **Category**: managed-setup
- **Priority**: must
- **Source**: 受け入れ基準, Task 3.1

**GIVEN** `SPECRUNNER_API_KEY` env var が設定されており、provider 側に agent / environment が存在しない（初回実行）  
**WHEN** `specrunner managed setup` を実行する  
**THEN**
- AgentSyncer.syncAll が実行され agent が create される
- Environment が create される
- config に `runtime: "managed"`、`agents`（step 別 agentId）、`environment.id` が書き込まれる
- config に `anthropic` フィールドが書き込まれない
- 終了コードが 0 である

---

### TC-MS-002
- **Category**: managed-setup
- **Priority**: must
- **Source**: 受け入れ基準, D2（idempotent reconciliation）

**GIVEN** `SPECRUNNER_API_KEY` env var が設定されており、provider 側に agent / environment が既に存在する（2 回目以降）  
**WHEN** `specrunner managed setup` を実行する  
**THEN**
- drift のある agent だけ update される（drift なし → skip）
- Environment は再作成されず retrieve 相当を返す
- config の `lastSyncedAt` が更新される
- 終了コードが 0 である

---

### TC-MS-003
- **Category**: managed-setup
- **Priority**: must
- **Source**: 受け入れ基準, Task 3.1

**GIVEN** `SPECRUNNER_API_KEY` env var が未設定の状態  
**WHEN** `specrunner managed setup` を実行する  
**THEN**
- early-fail し、`SPECRUNNER_API_KEY` env var の設定を案内するエラーメッセージが stderr に出力される
- 終了コードが非 0 である
- AgentSyncer / Environment の API 呼び出しは一切行われない

---

### TC-MS-004
- **Category**: managed-setup
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** `SPECRUNNER_API_KEY` が設定されているが値が無効（API 認証エラー）  
**WHEN** `specrunner managed setup` を実行する  
**THEN**
- SDK から返る auth エラーがそのまま stderr に流れる
- 終了コードが非 0 である
- spec-runner 独自のエラーラッパーで上書きされない

---

### TC-MS-005
- **Category**: managed-setup
- **Priority**: must
- **Source**: 受け入れ基準, D2（rollback）

**GIVEN** `SPECRUNNER_API_KEY` が設定されており、AgentSyncer.syncAll は成功したが Environment 作成が失敗する  
**WHEN** `specrunner managed setup` を実行する  
**THEN**
- 部分的に作成された agent の cleanup（archive）が実行される
- config に `runtime: "managed"` / `agents` / `environment` は書き込まれない（ロールバック）
- 終了コードが非 0 である

---

### TC-MS-006
- **Category**: managed-setup
- **Priority**: should
- **Source**: D2, D8

**GIVEN** `SPECRUNNER_API_KEY` が設定されており、既存 config に `anthropic.apiKey` フィールドが残っている（旧形式）  
**WHEN** `specrunner managed setup` を実行する  
**THEN**
- setup は正常に完了する
- 保存後の config に `anthropic` フィールドが含まれない（旧フィールドは引き継がれない）

---

### TC-MS-007
- **Category**: managed-setup
- **Priority**: should
- **Source**: D2

**GIVEN** `SPECRUNNER_API_KEY` が設定されており、provider 側に一部の agent は存在するが別の agent が欠如している  
**WHEN** `specrunner managed setup` を実行する  
**THEN**
- 欠如している agent が create される
- 既存 agent は definitionHash 比較で skip または update される
- config の agents が全ステップ分書き込まれる

---

## managed-status

### TC-MST-001
- **Category**: managed-status
- **Priority**: must
- **Source**: 受け入れ基準, D3

**GIVEN** config に `runtime: "managed"`、agents、environment が設定されており、`SPECRUNNER_API_KEY` env var が設定されている  
**WHEN** `specrunner managed status` を実行する  
**THEN**
- Runtime / Environment / step 別 agentId / `SPECRUNNER_API_KEY is set` が stdout に出力される
- API 通信は一切行われない
- 終了コードが 0 である

---

### TC-MST-002
- **Category**: managed-status
- **Priority**: must
- **Source**: 受け入れ基準, D3

**GIVEN** config の `runtime` が `"local"`（または未指定）  
**WHEN** `specrunner managed status` を実行する  
**THEN**
- `Runtime: local (managed setup not required)` が出力される
- agents / environment 等の managed 情報は表示されない
- 終了コードが 0 である

---

### TC-MST-003
- **Category**: managed-status
- **Priority**: should
- **Source**: D3

**GIVEN** config に `runtime: "managed"` が設定されているが、`SPECRUNNER_API_KEY` env var が未設定  
**WHEN** `specrunner managed status` を実行する  
**THEN**
- `SPECRUNNER_API_KEY is NOT set`（または同等の警告）が出力される
- エラー終了はせず、設定状態の表示として扱われる

---

### TC-MST-004
- **Category**: managed-status
- **Priority**: should
- **Source**: D3

**GIVEN** config に `runtime: "managed"` が設定されているが、`environment.id` や一部 agent が未設定  
**WHEN** `specrunner managed status` を実行する  
**THEN**
- 欠如フィールドが `(not set)` 等で明示される
- `managed setup` 未実行状態を確認できる

---

## managed-reset

### TC-MR-001
- **Category**: managed-reset
- **Priority**: must
- **Source**: 受け入れ基準, D4

**GIVEN** config に `runtime: "managed"`、`environment.id`、`agents` が設定されており、`--force` フラグ付きで実行  
**WHEN** `specrunner managed reset --force` を実行する  
**THEN**
- 確認プロンプトが表示されない
- `beta.environments.delete(environment.id)` が SDK 経由で呼び出される
- config の `runtime` フィールドが削除（または `"local"` にリセット）される
- config の `agents` が `{}` 空オブジェクトになる
- config の `environment` フィールドが削除される
- 終了コードが 0 である

---

### TC-MR-002
- **Category**: managed-reset
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** config に `runtime: "managed"`、`agents`、`environment.id` が設定されており、`--force` なしで実行  
**WHEN** `specrunner managed reset` を実行する（確認プロンプトに `y` で回答）  
**THEN**
- 確認プロンプトが表示される
- `y` 入力後に environment 削除と config クリアが実行される
- 終了コードが 0 である

---

### TC-MR-003
- **Category**: managed-reset
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** config に `runtime: "managed"`、`agents`、`environment.id` が設定されており、`--force` なしで実行  
**WHEN** `specrunner managed reset` を実行する（確認プロンプトに `n` で回答）  
**THEN**
- 処理が中断される
- config は変更されない
- environment の SDK delete API は呼び出されない
- 終了コードが非 0 である

---

### TC-MR-004
- **Category**: managed-reset
- **Priority**: must
- **Source**: 受け入れ基準, architect 決定（agent orphan 許容）

**GIVEN** `specrunner managed reset --force` を実行する  
**WHEN** コマンドが完了する  
**THEN**
- Anthropic 側の agent リソースが削除されない（SDK に delete API なし）
- 成功メッセージと「agent は Anthropic 側に orphan として残る」旨の警告が出力される

---

### TC-MR-005
- **Category**: managed-reset
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** reset 後に config を読み込む  
**WHEN** config を検証する  
**THEN**
- `agents` フィールドが `{}` である（non-optional 型のため削除されていない）
- `environment` フィールドが存在しない
- `runtime` が `"local"` 扱い（フィールド削除 or 明示的 `"local"`）

---

### TC-MR-006
- **Category**: managed-reset
- **Priority**: must
- **Source**: 受け入れ基準, D4

**GIVEN** `managed reset --help` を実行する  
**WHEN** help テキストを確認する  
**THEN**
- 「agent は Anthropic 側に orphan として残る（API 制約のため削除されない）」旨が明記されている

---

### TC-MR-007
- **Category**: managed-reset
- **Priority**: should
- **Source**: D4

**GIVEN** config に `environment.id` が存在しない状態（未セットアップ）  
**WHEN** `specrunner managed reset --force` を実行する  
**THEN**
- environment 削除の SDK 呼び出しをスキップする（id が存在しないため）
- config クリア処理は実行される
- 終了コードが 0 である

---

## init

### TC-INIT-001
- **Category**: init
- **Priority**: must
- **Source**: 受け入れ基準, Task 2.1

**GIVEN** `specrunner init` を実行できる状態  
**WHEN** `specrunner init` を実行する（フラグなし）  
**THEN**
- config 雛形（`version: 1`、`agents: {}`、`steps` のデフォルト設定）が生成される
- `runtime` フィールドは config に書き込まれない（未指定 = local default）
- `anthropic` フィールドは一切書き込まれない
- AgentSyncer / Environment 作成は実行されない
- 終了コードが 0 である

---

### TC-INIT-002
- **Category**: init
- **Priority**: must
- **Source**: 受け入れ基準, Task 2.1

**GIVEN** `--runtime managed` フラグ付きで実行  
**WHEN** `specrunner init --runtime managed` を実行する  
**THEN**
- エラーで停止する（終了コード非 0）
- エラーメッセージに「`init` のみで雛形作成、その後 `SPECRUNNER_API_KEY` を設定して `managed setup` を実行してください」という migration path が含まれる
- config ファイルは生成されない / 変更されない

---

### TC-INIT-003
- **Category**: init
- **Priority**: must
- **Source**: 受け入れ基準, Task 2.1

**GIVEN** `--runtime local` フラグ付きで実行  
**WHEN** `specrunner init --runtime local` を実行する  
**THEN**
- エラーで停止する（終了コード非 0）
- エラーメッセージに「`--runtime` フラグは不要。`init` のみで local がデフォルト」という案内が含まれる

---

### TC-INIT-004
- **Category**: init
- **Priority**: should
- **Source**: D7, Task 2.1

**GIVEN** 既存 config が存在する状態  
**WHEN** `specrunner init` を実行する  
**THEN**
- 既存 config の内容を best-effort で保持しつつ、`version: 1` と必須フィールドが補完される
- 既存の `anthropic` フィールドが引き継がれない（または上書きされない）

---

### TC-INIT-005
- **Category**: init
- **Priority**: should
- **Source**: Task 2.2

**GIVEN** `--api-key` フラグ付きで実行（旧フラグ）  
**WHEN** `specrunner init --api-key sk-xxx` を実行する  
**THEN**
- フラグが認識されない（command-registry からフラグ定義が削除されている）か、エラーで停止する

---

## config-schema

### TC-CS-001
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.1

**GIVEN** `SpecRunnerConfig` の型定義  
**WHEN** 型チェックを実行する（`bun run typecheck`）  
**THEN**
- `anthropic` フィールドが型定義に存在しない
- `AnthropicConfig` interface が削除されている
- `RawConfig` にも `anthropic` フィールドが存在しない

---

### TC-CS-002
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.1

**GIVEN** 既存 config ファイルに `anthropic: { apiKey: "sk-xxx" }` が含まれている  
**WHEN** `validateConfig` を実行する  
**THEN**
- バリデーションが成功する（エラーにならない）
- `anthropic` フィールドは無視される

---

### TC-CS-003
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.4

**GIVEN** config に `runtime` フィールドが存在しない  
**WHEN** `applyMigration` を実行する  
**THEN**
- `runtime` が `"local"` に正規化される（旧: `"managed"` がデフォルトだった）

---

### TC-CS-004
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.4, D6（最重要）

**GIVEN** `src/config/migrate.ts` の L112-113  
**WHEN** コードを確認する  
**THEN**
- `rawConfig.runtime === "managed" ? "managed" : "local"` のロジックになっている
- 旧: `rawConfig.runtime === "local" ? "local" : "managed"` ではない

---

### TC-CS-005
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.4

**GIVEN** `src/config/migrate.ts` の anthropic フィールド構築箇所  
**WHEN** コードを確認する  
**THEN**
- `anthropic` フィールドの明示構築（`const anthropic: ...` と `?? { apiKey: "" }`）が削除されている
- canonical object に `anthropic` が含まれない

---

### TC-CS-006
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.3

**GIVEN** `checkConfigComplete` の実装  
**WHEN** コードを確認する  
**THEN**
- managed 専用チェック（`apiKey` / `agents.design.agentId` / `environment.id`）が削除されている
- `github.accessToken` チェックのみが残っている

---

### TC-CS-007
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.2

**GIVEN** `validateConfig` の実装  
**WHEN** `runtime` が `"managed"` のときにチェックされる内容を確認する  
**THEN**
- `isManagedRuntime` の判定が `runtime === "managed"` のみ（`runtime === undefined` は managed 扱いしない）

---

### TC-CS-008
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.5

**GIVEN** managed runtime で config が incomplete（`github.accessToken` 未設定）  
**WHEN** `configIncompleteError` が呼ばれる  
**THEN**
- ヒント文字列が `"Run 'specrunner login' first."` を返す（旧: `"Run 'specrunner init' first."`）

---

### TC-CS-009
- **Category**: config-schema
- **Priority**: must
- **Source**: 受け入れ基準, Task 1.5

**GIVEN** `src/errors.ts`  
**WHEN** コードを確認する  
**THEN**
- `ERROR_CODES` に `RUNTIME_PREREQ_MISSING` が追加されている
- `CONFIG_INCOMPLETE` と区別されている

---

### TC-CS-010
- **Category**: config-schema
- **Priority**: should
- **Source**: 受け入れ基準, Task 1.1

**GIVEN** `src/config/schema.ts` の D7 コメント（L95 付近）  
**WHEN** コードを確認する  
**THEN**
- コメントが `runtime デフォルト "local"` に合わせて更新されている（旧: `"Default 'managed' for backward compat."`）

---

### TC-CS-011
- **Category**: config-schema
- **Priority**: should
- **Source**: 受け入れ基準

**GIVEN** config の `0600` permission warning の実装  
**WHEN** config ファイルが存在する状態でチェックされる  
**THEN**
- `github.accessToken` が残る限り permission warning が維持されている

---

## preflight

### TC-PF-001
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.2 ケース 1

**GIVEN** `cfg.runtime === "managed"` かつ `env.SPECRUNNER_API_KEY` が未設定  
**WHEN** `checkRuntimePrereqs(cfg, env)` を呼ぶ  
**THEN**
- `{ field: "SPECRUNNER_API_KEY", hint: "Set SPECRUNNER_API_KEY env var..." }` が返る
- `null` は返らない

---

### TC-PF-002
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.2 ケース 2

**GIVEN** `cfg.runtime === "managed"` かつ `SPECRUNNER_API_KEY` は設定済み、`cfg.agents.design.agentId` が未設定  
**WHEN** `checkRuntimePrereqs(cfg, env)` を呼ぶ  
**THEN**
- `{ field: "agents.design.agentId", hint: "Run 'specrunner managed setup' first." }` が返る

---

### TC-PF-003
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.2 ケース 3

**GIVEN** `cfg.runtime === "managed"` かつ `SPECRUNNER_API_KEY` と `agents.design.agentId` は設定済み、`cfg.environment.id` が未設定  
**WHEN** `checkRuntimePrereqs(cfg, env)` を呼ぶ  
**THEN**
- `{ field: "environment.id", hint: "Run 'specrunner managed setup' first." }` が返る

---

### TC-PF-004
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.2 ケース 4

**GIVEN** `cfg.runtime === "managed"` かつ `SPECRUNNER_API_KEY`、`agents.design.agentId`、`environment.id` が全て設定済み  
**WHEN** `checkRuntimePrereqs(cfg, env)` を呼ぶ  
**THEN**
- `null` が返る

---

### TC-PF-005
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.2 ケース 5

**GIVEN** `cfg.runtime === "local"`  
**WHEN** `checkRuntimePrereqs(cfg, env)` を呼ぶ  
**THEN**
- `null` が即座に返る（early return）
- env var / agents / environment チェックは行われない

---

### TC-PF-006
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.2 ケース 6

**GIVEN** `cfg.runtime` が未指定（`undefined`）  
**WHEN** `checkRuntimePrereqs(cfg, env)` を呼ぶ  
**THEN**
- `null` が返る（`runtime !== "managed"` → local 扱い）

---

### TC-PF-007
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.1

**GIVEN** `checkRuntimePrereqs` の実装ファイル  
**WHEN** ファイルパスを確認する  
**THEN**
- `src/core/preflight.ts` に `checkRuntimePrereqs` が定義されている
- `process.env` への直接参照が関数シグネチャの `env` 引数で隔離されている（schema.ts に process.env 結合がない）

---

### TC-PF-008
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.1

**GIVEN** `specrunner run` が `runtime === "managed"` の config で実行される  
**WHEN** pipeline 開始前の preflight が走る  
**THEN**
- `checkRuntimePrereqs` が `checkConfigComplete` 直後（Step 2.5）に呼ばれる
- 失敗時は `RUNTIME_PREREQ_MISSING` エラーコードで停止する
- エラーメッセージに `managed setup` または `SPECRUNNER_API_KEY` 設定への誘導 hint が含まれる

---

### TC-PF-009
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** `specrunner run` の実行中に provider 側の agent / environment が 404 を返す  
**WHEN** SDK エラーが発生する  
**THEN**
- spec-runner が自動 recovery / 再作成を行わない
- SDK エラーがそのまま伝播して停止する
- ユーザーは `specrunner managed setup` を再実行することで回復できる

---

### TC-PF-010
- **Category**: preflight
- **Priority**: must
- **Source**: 受け入れ基準, Task 5.2

**GIVEN** `tests/unit/core/preflight.test.ts`  
**WHEN** テストを確認する  
**THEN**
- 6 ケース（TC-PF-001〜006）が全て実装されている
- 各ケースで `env` が `{ SPECRUNNER_API_KEY: "test-key" }` のような plain object で渡されている（`process.env` 汚染なし）

---

## doctor

### TC-DR-001
- **Category**: doctor
- **Priority**: must
- **Source**: 受け入れ基準, Task 6.1

**GIVEN** `src/core/doctor/checks/index.ts`  
**WHEN** コードを確認する  
**THEN**
- `commonChecks`, `managedChecks`, `localChecks` の 3 配列が定義されている
- `allChecks` は互換性のため残っている（または適切に移行されている）

---

### TC-DR-002
- **Category**: doctor
- **Priority**: must
- **Source**: 受け入れ基準, Task 6.3

**GIVEN** config の `runtime === "managed"` の状態  
**WHEN** `specrunner doctor` を実行する  
**THEN**
- `commonChecks + managedChecks` が実行される
- `localChecks` は実行されない

---

### TC-DR-003
- **Category**: doctor
- **Priority**: must
- **Source**: 受け入れ基準, Task 6.3

**GIVEN** config の `runtime === "local"`（または未指定）の状態  
**WHEN** `specrunner doctor` を実行する  
**THEN**
- `commonChecks + localChecks` が実行される
- `managedChecks` は実行されない（managed 専用チェックが local で spurious fail しない）

---

### TC-DR-004
- **Category**: doctor
- **Priority**: must
- **Source**: 受け入れ基準, Task 6.2

**GIVEN** managed runtime で `SPECRUNNER_API_KEY` が設定されている  
**WHEN** `specrunner doctor` を実行する（managed mode）  
**THEN**
- `managed/api-key-present` check が `SPECRUNNER_API_KEY` env var の存在を確認する（`config.anthropic.apiKey` を参照しない）
- `managed/api-key-valid` check が `SPECRUNNER_API_KEY` 経由で API 疎通を確認する

---

### TC-DR-005
- **Category**: doctor
- **Priority**: must
- **Source**: 受け入れ基準, Task 6.2

**GIVEN** managed doctor check（agents-registered / environment-registered / definition-drift）  
**WHEN** hint 文字列を確認する  
**THEN**
- hint が `"Run 'specrunner managed setup'."` になっている
- 旧: `"Run 'specrunner init'."` は存在しない

---

### TC-DR-006
- **Category**: doctor
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** managed runtime で `specrunner doctor` を実行する  
**WHEN** doctor が `managed/api-key-valid` check を実行する  
**THEN**
- active provider（Anthropic Managed Agents）の SDK 経由で API 疎通が確認される
- agent ID / environment ID の provider 側生存が確認される

---

### TC-DR-007
- **Category**: doctor
- **Priority**: should
- **Source**: Task 6.3

**GIVEN** `src/cli/doctor.ts` の runtime 判定ロジック  
**WHEN** コードを確認する  
**THEN**
- `const runtime = rawConfig?.runtime ?? "local"` となっている（未指定 → local 扱い）
- runtime に応じて checks 配列が `[...commonChecks, ...(runtime === "managed" ? managedChecks : localChecks)]` で組み立てられている

---

## api-key-migration

### TC-AK-001
- **Category**: api-key-migration
- **Priority**: must
- **Source**: 受け入れ基準, Task 4.1

**GIVEN** `src/cli/run.ts` の sessionClient 生成箇所  
**WHEN** コードを確認する  
**THEN**
- `config.anthropic?.apiKey` への参照が存在しない
- `process.env["SPECRUNNER_API_KEY"]` を参照する実装になっている
- `config.runtime === "managed" && process.env["SPECRUNNER_API_KEY"]` の条件で sessionClient を生成する

---

### TC-AK-002
- **Category**: api-key-migration
- **Priority**: must
- **Source**: 受け入れ基準, Task 4.2

**GIVEN** `src/cli/rm.ts` の anthropicClient 生成箇所  
**WHEN** コードを確認する  
**THEN**
- `config.anthropic?.apiKey` への参照が存在しない
- `process.env["SPECRUNNER_API_KEY"]` を参照する実装になっている

---

### TC-AK-003
- **Category**: api-key-migration
- **Priority**: must
- **Source**: 受け入れ基準, Task 4.3

**GIVEN** `src/cli/bootstrap.ts` の sessionClient 生成箇所  
**WHEN** コードを確認する  
**THEN**
- `config.anthropic?.apiKey` への参照が存在しない
- `process.env["SPECRUNNER_API_KEY"]` を参照する実装になっている

---

### TC-AK-004
- **Category**: api-key-migration
- **Priority**: must
- **Source**: 受け入れ基準, Task 4.4

**GIVEN** `grep -rn 'config\.anthropic' src/` の実行結果  
**WHEN** 検索を実行する  
**THEN**
- `config.anthropic` への参照が 0 件である

---

### TC-AK-005
- **Category**: api-key-migration
- **Priority**: must
- **Source**: 受け入れ基準, Task 4.4

**GIVEN** `grep -rn 'AnthropicConfig' src/` の実行結果  
**WHEN** 検索を実行する  
**THEN**
- `AnthropicConfig` 型への参照が 0 件である（削除済み）

---

## help

### TC-HELP-001
- **Category**: help
- **Priority**: must
- **Source**: 受け入れ基準, Task 7.1

**GIVEN** `specrunner --help` の出力  
**WHEN** help テキストを確認する  
**THEN**
- `login` の説明が「GitHub Device Flow OAuth 認証」（または同等の表現）になっている
- 旧: 「Anthropic API key 取得」の説明は存在しない

---

### TC-HELP-002
- **Category**: help
- **Priority**: must
- **Source**: 受け入れ基準, Task 7.1

**GIVEN** `specrunner --help` の出力  
**WHEN** help テキストを確認する  
**THEN**
- `managed` コマンドが `setup | status | reset` と「Anthropic Managed Agents リソース管理」として表示される
- 標準フロー（managed）の例示に `(SPECRUNNER_API_KEY 設定) → init → login → managed setup → run` が含まれる

---

### TC-HELP-003
- **Category**: help
- **Priority**: must
- **Source**: 受け入れ基準, Task 7.1

**GIVEN** `specrunner --help` の出力  
**WHEN** help テキストを確認する  
**THEN**
- `init` の説明が「config 雛形生成」（`Initialize config scaffold` 相当）になっている
- `init` のオプションから `--api-key` / `--runtime` の説明が削除されている

---

### TC-HELP-004
- **Category**: help
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** `specrunner managed reset --help` の出力  
**WHEN** help テキストを確認する  
**THEN**
- 「Anthropic 側の agent リソースは API 制約のため削除されない（orphan として残る）」旨が明記されている

---

### TC-HELP-005
- **Category**: help
- **Priority**: should
- **Source**: Task 7.1, D11

**GIVEN** `specrunner --help` の出力  
**WHEN** 標準フロー（local）の例示を確認する  
**THEN**
- `Standard flow (local): init -> login -> run` が表示されている

---

## build-and-test

### TC-BT-001
- **Category**: build-and-test
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** 全実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN**
- 型エラーが 0 件である

---

### TC-BT-002
- **Category**: build-and-test
- **Priority**: must
- **Source**: 受け入れ基準, Task 8.1

**GIVEN** 全実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN**
- 全テストが green である
- `tests/unit/core/preflight.test.ts` の 6 ケースが全て pass する
- `tests/unit/cli/managed.test.ts` の setup / status / reset テストが全て pass する
- 既存テストで `config.anthropic` を参照していた箇所が更新されており、green になっている

---

### TC-BT-003
- **Category**: build-and-test
- **Priority**: must
- **Source**: Task 8.1

**GIVEN** `grep -rn 'anthropic\|apiKey\|api-key' tests/` の実行結果  
**WHEN** 既存テストを確認する  
**THEN**
- mock config から `anthropic: { apiKey: "..." }` が削除されている
- `validateConfig` テストの `anthropic` 必須チェックケースが削除または更新されている
- `checkConfigComplete` テストの managed 専用チェックケースが削除または更新されている
- `applyMigration` テストの runtime デフォルトケースが `"local"` に反転されている

---

### TC-BT-004
- **Category**: build-and-test
- **Priority**: must
- **Source**: Task 8.2

**GIVEN** `tests/unit/cli/managed.test.ts`  
**WHEN** テストを確認する  
**THEN**
- `runManagedSetup`: env var 未設定時の early-fail、AgentSyncer mock で agents 書き込み確認、config に anthropic 非書き込み確認
- `runManagedStatus`: managed config の整形出力確認、local config での早期 return 確認
- `runManagedReset`: `--force` での確認 skip、environment 削除 mock、`agents: {}` リセット確認

---

## Priority Summary

| Priority | Count |
|----------|-------|
| must     | 36    |
| should   | 10    |
| could    | 0     |
