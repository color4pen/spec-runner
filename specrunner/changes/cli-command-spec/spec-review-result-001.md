# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/cli-command-spec/request.md` — 要件 1〜9・スコープ外・受け入れ基準・architect 評価済み設計判断
- `specrunner/changes/cli-command-spec/design.md` — 設計判断 D1〜D9（CommandSpec 型・型検証・alias・requiresRepo 継承・worktree guard・dispatch 統一・help 生成・列挙 API・段階移行）
- `specrunner/changes/cli-command-spec/spec.md` — 全 8 Requirement × シナリオ（Given/When/Then）
- `specrunner/changes/cli-command-spec/tasks.md` — T-01〜T-09（型定義・flag-parser 拡張・解決/列挙 API・dispatch 統一・alias/doctor 導出化・help 生成・hint 移行・構造結合テスト移行・旧構造削除）
- `specrunner/changes/cli-command-spec/test-cases.md` — TC-001〜TC-039（total 39件 / must 35 / should 4）

### 照合した現状コード

- `src/cli/command-registry.ts`（冒頭 200 行: CommandDef/ParentCommandDef/CommandEntry/USAGE/RULES_USAGE/RUNTIME_RESET_USAGE 等）
- `bin/specrunner.ts`（全 198 行: subcommand 経路と normal 経路の二重実装・WORKTREE_GUARDED_COMMANDS 手書き Set）
- `src/cli/flag-parser.ts`（全 167 行: FlagDef / parseFlags / FlagParseError）
- `src/cli/__tests__/login.test.ts`（TC-001: LOGIN_USAGE, TC-002: COMMANDS["login"] 直参照）
- `src/cli/__tests__/detach-output-contract.test.ts`（USAGE import）
- `tests/unit/cli/hint-command-references.test.ts`（COMMANDS 直参照・2 段バリデーション実装）
- `tests/unit/cli/doctor-repair.test.ts`（CommandDef 型キャスト・COMMANDS["doctor"].handler 直呼び）
- `tests/unit/cli/help-output-tc.test.ts`（USAGE import）
- `tests/unit/cli/prune-usage.test.ts`（PRUNE_USAGE / USAGE import）
- `tests/unit/cli/resume-help.test.ts`（JOB_RESUME_USAGE 参照）
- `tests/unit/cli/specrunner-worktree-guard.test.ts`（TC-WG-001〜008: bin 経由の worktree guard 挙動）
- `tests/unit/cli/removed-commands.test.ts`（Unknown command 文言保存）
- `tests/unit/architecture/core-invariants.test.ts`（B-18 境界・CWD allowlist ratchet の実装確認）

### 検証した整合性

1. **request.md 要件 ↔ spec.md シナリオ**: 要件 1〜9 のそれぞれに対応するシナリオが spec.md に存在し、Given/When/Then が要件を適切に具体化している。
2. **spec.md シナリオ ↔ test-cases.md**: 全シナリオに対応する TC が存在する（TC-001〜039）。Priority must/should の配分は妥当。
3. **test-cases.md ↔ tasks.md**: 各タスク（T-01〜T-09）の acceptance criteria が TC を参照しており、双方向で追跡可能。
4. **設計制約の転記**: design.md の制約（B-18 import 境界 / CWD allowlist ratchet / handler を command-registry.ts に留める / --merge-wait-ms の lenient 維持）が tasks.md の「全タスク共通の不変制約」に正しく転記されている。
5. **既存テストの扱い方針**: behavioral/output contract テストは無改変 green、旧構造結合テストのみ新 API 参照への移行を許容、という方針が design.md・tasks.md・test-cases.md で一貫している。
6. **requiresRepo マッピング**: TC-036 の true リスト（init / request new / job cancel / job attach / job prune / job stats / inbox run）と tasks.md T-08 の記述が一致し、job start / ls / show / wait が false 保存であることが確認できる。
7. **worktree guard 対象集合**: design.md D5 の guard=true リスト（job start / resume / attach / archive / prune / reopen / inbox run）が T-05 の実装指示と一致している。

## 検証できなかった項目

- 現状コード `command-registry.ts` の 200 行以降（handler 本体・requiresRepo 手書き箇所・doctor 分岐・RUN_JOB_FLAGS 等）は行数制限により未確認。request.md の「現状コードの前提」記述と照合した範囲での確認のみ。
- `tests/unit/cli/doctor-help.test.ts`・`tests/unit/cli/help-flag-dispatch.test.ts`・`tests/unit/architecture/arch-allowlist.ts` の全文は未読。pin テスト群の assertion 内容の完全な列挙は行っていない（spec.md と tasks.md の文言リストとの比較のみ）。

## Findings 詳細

### F-1: `handler+children` 型ノード（doctor）の dispatch fallback 挙動が未定義

**対象箇所**: `design.md` D6（dispatch 単一 flow 統一）および `spec.md` Requirement: dispatch は単一 flow に統一

design.md D6 は `resolveCommand` の返り値として `{ kind: "unknown-command" | "unknown-subcommand" | "needs-subcommand" }` を列挙するが、**handler（default action）と children を両方持つノード** において `args[1]` が既知 child name にマッチしない場合の挙動が定義されていない。

`doctor` はこの唯一の実例：現行の `specrunner doctor foo`（"foo" は未知の positional）は `doctor` が `CommandDef`（非 ParentCommandDef）のため normal 経路に入り、handler が positionals=["foo"] を受け取り diagnose を実行する（エラーにならない）。移行後の unified dispatch で `resolveCommand(["doctor","foo"])` が `unknown-subcommand` を返すと "Unknown doctor subcommand: foo" になり挙動変更となる。

自然な実装は「child 未マッチかつノードに handler あり → handler に残りの args を渡す（fallback to default action）」であるが、この選択が spec に明示されていない。

**推奨**: `design.md` D6 または `spec.md` の dispatch Requirement に「`handler` と `children` を両方持つノードで第 2 引数が child name にマッチしない場合は default action にフォールバックし残トークンを positionals として渡す」を 1 文追記する。

---

### F-2: `hint-command-references.test.ts` 移行の 2 段階バリデーション戦略が未定義

**対象箇所**: `tasks.md` T-07（hint 実在検査を列挙 API へ移行）

現状の `hint-command-references.test.ts` は `validateHintCommands` で以下の 2 段バリデーションを行う：
1. `token1 ∈ Object.keys(COMMANDS)`（top-level 存在確認）
2. parent コマンドの場合 `token2 ∈ entry.subcommands[token1]`（subcommand 存在確認）

T-07 は「`Object.keys(COMMANDS)` + `entry.subcommands` 直参照を `listCommandPaths` / `resolveCommand` へ移行する」と指示するが、flat なパスリストから同等の 2 段バリデーションを再構築する具体的な戦略が示されていない。

`listCommandPaths({includeAliases:true})` が返す `string[][]` を使う場合、`token1 token2` の検証は「`resolveCommand([token1, token2])` が `kind:"unknown-subcommand"` / `kind:"unknown-command"` を返す場合は violation」で実装できるが、TC-034 の「感度は維持する」という要件に対して移行の正確な実装が実施者判断になっている。

このギャップにより、移行後の hint validation が top-level のみ確認（token2 のチェックを落とす）という弱い実装になるリスクがある（TC-004 の破壊確認：`specrunner managed setup` → `managed` が削除 → 検出される、という感度は維持されるが、`specrunner job rm x` → `rm` が削除 → 検出される感度は new API 側に明示されていない）。

**推奨**: T-07 に「`specrunner <token1> <token2>` の形式は `resolveCommand([token1, token2])` で解決し、`kind` が `unknown-command` / `unknown-subcommand` の場合を violation とする」という validation ロジックを明示する。
