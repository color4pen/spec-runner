# Review Feedback: managed-command-extraction

- **iteration**: 1
- **verdict**: needs-fix

## Summary

実装は design.md / delta-spec.md の主要要件（managed 親コマンド新設、init 責務縮小、anthropic フィールド削除、runtime デフォルト反転、`checkRuntimePrereqs` 新設、doctor check registry 分離、help 更新）を全て満たしており、型チェック・テスト共に green。コードベースへの主要変更箇所（migrate.ts L112-113 / L117-125、schema.ts、preflight.ts、各 CLI 入口の env var 移行、doctor checks の 3 配列化）は正確に実装されている。

ただし以下の点で品質ギャップが残っている:

1. **(MAJOR)** `bin/specrunner.ts` の親コマンド未指定エラーメッセージが `request` 専用ハードコードになっており、`specrunner managed`（subcommand なし）実行時に `"Unknown request subcommand"` または `"Error: specrunner request requires a subcommand."` という誤誘導メッセージが出る。新規 `managed` 親コマンドの UX を直接損ねる回帰。
2. **(MAJOR)** test-cases.md の `must` 優先テスト（managed setup の idempotent / rollback / status の主要シナリオ / reset 確認プロンプト y/n / reset --help orphan note）が `tests/unit/cli/managed.test.ts` に実装されていない。受け入れ基準と test-cases.md の `must` 36 件のうち、`managed` コマンドのテストは setup 1 件・status 1 件・reset 1 件の計 3 件しかない。
3. **(MINOR)** stale な `Run 'specrunner init'` ヒントが managed 関連の error path に残存（`src/config/store.ts:137`、`src/config/getAgentId.ts:20`、`src/adapter/managed-agent/agent-runner.ts:292`）。新フローでは `'specrunner managed setup'` を案内すべき。
4. **(MINOR)** `runManagedSetup` / `runManagedReset` が既存 config から `anthropic` フィールドを strip しない（`init.ts` のみ strip）。古い config を持つユーザーで stale な `anthropic.apiKey` が config に残り続ける（TC-MS-006 の `should` 要件に違反）。

CRITICAL なし。MAJOR を解消すれば approved 相当。

## Findings

### MAJOR: 親コマンドのサブコマンド未指定時のエラーメッセージが request 専用ハードコード
- **file**: bin/specrunner.ts:40-46
- **issue**:
  ```typescript
  if (!subDef) {
    process.stderr.write(
      sub
        ? `Unknown request subcommand: ${sub}\n\n`
        : "Error: specrunner request requires a subcommand.\n\n",
    );
    process.stderr.write("Usage: specrunner request template [--type <type>]\n");
    process.stderr.write("       specrunner request validate <file>\n");
    process.exit(2);
  }
  ```
  `subcommands` を持つ全 ParentCommand に対して文字列 `request` がハードコードされている。新規 `managed` 親コマンドで `specrunner managed`（サブコマンドなし）または `specrunner managed foo`（未知サブコマンド）を実行すると、誤って `request` の usage が表示される。`managed` 親コマンドを追加したこの change での新規回帰扱い。
- **suggestion**: 親コマンド名を動的に出すか、`CommandEntry` の `usage` フィールド（既に `FINISH_USAGE` で使われている）を `ParentCommandDef` にも持たせ、未指定/未知サブコマンド時にそれを書き出す。最低限:
  ```typescript
  if (!subDef) {
    process.stderr.write(
      sub
        ? `Unknown ${command} subcommand: ${sub}\n\n`
        : `Error: specrunner ${command} requires a subcommand.\n\n`,
    );
    // print Object.keys(entry.subcommands).join("|") など
    process.exit(2);
  }
  ```

### MAJOR: managed コマンドの test 実装が test-cases.md の must 要件を網羅していない
- **file**: tests/unit/cli/managed.test.ts:70-140
- **issue**: test-cases.md は managed-setup 5 must + 2 should、managed-status 2 must + 2 should、managed-reset 6 must + 1 should を列挙しているが、実装は setup 2 件（env var 欠落 + happy path）、status 1 件（local 表示のみ）、reset 1 件（--force happy path のみ）の計 4 件にとどまる。具体的に欠如している must:
  - TC-MS-002: 2 回目以降の idempotent reconciliation（drift だけ update / skip 検証）
  - TC-MS-004: 無効 API key の SDK エラー伝播
  - TC-MS-005: Environment 作成失敗時の rollback（agent archive 呼び出し検証）
  - TC-MST-001: managed config の full output 形式（agents 一覧 / environment.id / API Key 表示）
  - TC-MR-002 / TC-MR-003: 確認プロンプト y / n 入力の挙動
  - TC-MR-004: orphan agent 警告メッセージの出力
  - TC-MR-007: environment.id 未設定時の SDK delete スキップ
- **suggestion**: 上記 must テストケースを `tests/unit/cli/managed.test.ts` に追加する。特に rollback（TC-MS-005）と確認プロンプト（TC-MR-002/003）は実装の振る舞いを pin する safety-net として重要。`vi.spyOn(readline, "createInterface")` で stdin を mock すれば確認プロンプトはユニットテストできる。

### MINOR: stale な `'specrunner init'` ヒントが managed 系 error path に残存
- **file**: src/config/store.ts:137, src/config/getAgentId.ts:20, src/adapter/managed-agent/agent-runner.ts:292
- **issue**: いずれも managed runtime で agent ID が解決できなかったときの hint。新フローでは agent 登録は `specrunner managed setup` が担うため、`init` への案内は誤誘導。
  ```typescript
  // src/config/store.ts:137
  throw new SpecRunnerError(
    ERROR_CODES.CONFIG_INCOMPLETE,
    `Run 'specrunner init' to create the ${role} agent.`,
    ...
  );

  // src/config/getAgentId.ts:20
  `Run 'specrunner init' to create the ${role} agent.`,

  // src/adapter/managed-agent/agent-runner.ts:292
  const errHint = (err as { hint?: string }).hint ?? "Run 'specrunner init' to configure agents.";
  ```
- **suggestion**: hint を `"Run 'specrunner managed setup' to register the ${role} agent."` に書き換える。`errors.ts:61` の `configMissingError` と `core/doctor/checks/config/file-exists.ts` の hint は config file 自体の不在を示すので `init` のままで適切。

### MINOR: 既存 config の anthropic フィールドが setup / reset で strip されない
- **file**: src/cli/managed.ts:116-125, src/cli/managed.ts:202-208
- **issue**: `init.ts:51-52` では `delete (newConfig as ...)['anthropic']` で明示的に strip しているが、`runManagedSetup` の `{ ...existingConfig, ... }` および `runManagedReset` の `const { environment, ...rest } = config` ではどちらも `anthropic` フィールドが spread を素通りする。旧 config（`anthropic.apiKey` を持つ）でユーザーが setup / reset を実行すると stale な secret が config に残り続ける。test-cases TC-MS-006（should 優先）に該当。実害は validate は通過するため動作には影響しないが、本 change の主目的（config から secret 排除）から見ると spec 不一致。
- **suggestion**: `runManagedSetup` と `runManagedReset` で `saveConfig` 直前に `init.ts` と同じパターンで `delete (newConfig as unknown as Record<string, unknown>)['anthropic']` を追加するか、`saveConfig`（`src/config/store.ts:91-100`）側で legacy フィールドリストに `'anthropic'` を加えて一元的に strip する。後者が望ましい（複数の入り口で同じ strip が必要になるため）。

### INFO: DoctorConfig の dotted-path 例コメントが古い
- **file**: src/core/doctor/types.ts:110
- **issue**:
  ```typescript
  /** Get a dotted-path config value, e.g. "anthropic.apiKey" */
  get(path: string): unknown;
  ```
  `anthropic.apiKey` は schema から消えたためサンプルとして無効。
- **suggestion**: `e.g. "github.accessToken"` または `"agents.design.agentId"` 等の現存パスに置換。

### INFO: test-cases.md TC-MR-003 と delta-spec の終了コードが不整合
- **file**: specrunner/changes/managed-command-extraction/test-cases.md:225 vs delta-spec.md:90-91
- **issue**: test-cases.md TC-MR-003 は確認プロンプトで `n` 入力時「終了コードが非 0 である」と記述、delta-spec.md は同じシナリオで「exit code 0 で終了する」と記述。実装は delta-spec に従って exit 0。test-cases.md 側が陳腐化している。
- **suggestion**: 実装は delta-spec が source of truth として正しい。test-cases.md TC-MR-003 を「終了コードが 0 である（abort はユーザー操作で異常ではない）」に修正することを推奨。
