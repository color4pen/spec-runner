# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-05 の全チェックボックスが `[x]` 済み |
| design.md | ✅ | D1〜D4 の設計判断が実装に正確に反映されている |
| spec.md | ✅ | 4 Requirement × 9 Scenario をテストで網羅。flag-parser.test.ts + help-flag-dispatch.test.ts |
| request.md | ✅ | 受け入れ基準 7 項目すべて充足。typecheck/test/lint green（3624 tests passed） |

## Detail

### tasks.md

T-01 through T-05 のすべてのタスクが `[x]` で完了マーク済み。未完了チェックボックスなし。

### design.md

| Decision | 実装箇所 | 判定 |
|----------|---------|------|
| D1: `--help` / `--help=…` をparser で予約フラグ化 | `flag-parser.ts` L85-90 — `flagDefs` 参照前に `flagName === "help"` を short-circuit | ✅ |
| D2: `flags["help"]` true 時に required positional チェックをスキップ | `flag-parser.ts` L134 — `positionalDef?.required && !flags["help"]` | ✅ |
| D3: dispatch 共通 help 処理を worktree guard より前に配置 | `bin/specrunner.ts` L64-69 (subcommand), L114-119 (normal) — raw pre-scan で `emitHelp()` を guard 前に評価 | ✅ |
| D4: usage-less コマンドへの fallback / `runtime reset` subDef に `usage` 追加 | `NO_DETAILED_HELP_USAGE` 定数を export; `reset` subDef に `usage: RUNTIME_RESET_USAGE` | ✅ |

### spec.md

**Req 1 (parser SHALL reserve `--help`/`-h`)**
- `--help` without flagDefs → `flags["help"] = true`: TC-HELP-01 ✅
- `-h` mapping preserved: 既存 1-5 + TC-HELP-04 ✅
- `--help=anything` → help set: TC-HELP-02 ✅

**Req 2 (parser SHALL skip required positional when help)**
- required positional + `--help` → no throw: TC-HELP-03 ✅
- no help + required positional missing → `FlagParseError`: TC-HELP-05 ✅

**Req 3 (dispatch SHALL emit usage and exit 0)**
- subcommand with usage → its usage: TC-HELP-DISPATCH-01 (archive) ✅
- subcommand without usage → fallback: TC-HELP-DISPATCH-03 (resume) ✅
- required-positional subcommand + `--help` → exit 0: TC-HELP-DISPATCH-04 (request review) ✅
- no help + no slug → exit 2 + stderr: TC-HELP-DISPATCH-06 ✅

**Req 4 (individual help in archive/reset SHALL be removed, backward compat)**
- `runtime reset --help` → `RUNTIME_RESET_USAGE`: TC-HELP-DISPATCH-02 ✅
- `runtime reset --force` → `runManagedReset` 呼出し（regression なし）: TC-39（既存）✅
- `job archive` subDef に `help` flag 定義なし: `command-registry.ts` の archive flags 確認済み ✅

### request.md 受け入れ基準

| 基準 | 判定 |
|------|------|
| 全サブコマンドで `--help`/`-h` が slug なしで動作し usage 表示 | ✅ |
| `job archive --help` / `job resume --help` / `request review --help` が全て動作 | ✅ |
| `--help` なし・slug なしは従来どおり「requires a `<slug>` argument」エラー | ✅ |
| `job archive` の既存 `--help` 処理と後方互換 | ✅ |
| テストケースが追加されている | ✅ |
| `typecheck && test` が green | ✅ (3624 tests passed) |
| `lint` が green | ✅ |

## Observations

- `emitHelp()` の戻り値型が `never` になっており、TypeScript の到達不能コード検出が正しく機能する設計。
- D3 の設計書には「guard を `parseFlags` の後ろへ移す」とあるが、実装は raw pre-scan で help を先に評価し guard 自体の位置は変更していない。これは design.md の Risk セクション（guard 移動によるエラーメッセージ変化回避）と整合しており、spec の「help 判定は worktree guard より前に評価 SHALL する」も満たしている。
