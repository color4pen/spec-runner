# Conformance Result — cli-command-spec — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### spec.md — 全 Requirement と Scenario

| Requirement | 確認方法 | 結果 |
|-------------|---------|------|
| Req-1: 全 public command path が単一 registry から列挙でき canonical と alias を区別する | `listCommandPaths()` / `listCommandPaths({includeAliases:true})` の動作を TC-001〜TC-004 で確認 | ✅ PASS |
| Req-2: `run` は `job start` の alias として解決され契約を target から継承する | run spec に flags/worktreeGuard/requiresRepo が無いことを確認、TC-005 / TC-WG-006 | ✅ PASS |
| Req-3: `doctor` は default action、`doctor repair` は child command として表現される | COMMANDS["doctor"].handler + children.repair の存在、requiresRepo override を TC-007〜TC-009 で確認 | ✅ PASS |
| Req-4: requiresRepo は parent から継承し child で override できる | `resolveEffectiveRequiresRepo` 実装を確認、TC-010/TC-011 fixture テスト、TC-036 全コマンド検証 | ✅ PASS |
| Req-5: worktree guard は spec 宣言から導出される | `WORKTREE_GUARDED_COMMANDS` / `guardedSubcommands` の不在を grep + TC-035 で確認 | ✅ PASS |
| Req-6: deprecated flag は通常 help に出ず移行エラー挙動を保つ | LOGIN_USAGE に --provider 不在（TC-001）、FlagParseError 発火（TC-002）を確認 | ✅ PASS |
| Req-7: help(top-level/parent/leaf)は CommandSpec から生成され pin 文言を保持する | `generateTopLevelUsage()` 実装確認、USAGE/各 *_USAGE 定数の文言移設を確認、全 pin テスト green | ✅ PASS |
| Req-8: parser は spec 宣言由来で型検証し複合 positional の domain を狭めない | `--issue` / `--limit` integer型、handler の重複 validation 除去、`--merge-wait-ms` string 維持を確認 | ✅ PASS |
| Req-9: dispatch は単一 flow に統一され SpecRunnerError を両経路で正規化する | bin/specrunner.ts の単一パイプラインを確認、TC-023 で outer catch 動作検証 | ✅ PASS |

### request.md — 受け入れ基準

全 10 項目を確認済み。詳細は下表。

| 受け入れ基準 | 確認結果 |
|-------------|---------|
| 全 public command path が列挙 API から取得でき canonical / alias 区別できる | ✅ TC-001〜TC-004 |
| `run` が `job start` の alias として解決、flags / worktree guard / requiresRepo が target と同一 | ✅ TC-005, TC-WG-006 |
| `doctor`(default action) と `doctor repair` が command path、doctor repo-optional / repair repo-required | ✅ TC-007〜TC-009, TC-DR-001〜003 |
| `requiresRepo` parent 継承 + child override が test 用 spec で固定、全 public command の repo requirement が移行前と同一 | ✅ TC-010, TC-011, TC-012, TC-036 |
| worktree guard が spec 宣言から導出、bin の手書き Set と registry の guardedSubcommands が存在しない | ✅ TC-035（source grep）, TC-WG-001〜008 |
| deprecated flag(`login --provider`)が通常 help に出ない、移行エラー挙動保持 | ✅ login.test.ts TC-001, TC-002, removed-commands |
| top-level / parent / leaf help が CommandSpec から生成、既存 pin テストの assertion が全て green | ✅ detach-output-contract, login, resume-help, help-output-tc, prune-usage |
| dispatch が単一 flow に統一、SpecRunnerError が subcommand / normal 両経路で Error/Hint/exitCode 表示 | ✅ TC-023 |
| 既存の behavioral / output contract テストが無改変で green | ✅ verification-result.md test phase passed |
| `typecheck && test` が green | ✅ verification-result.md 全 phase passed |

### ソースレベル不変制約

| 制約 | 確認方法 | 結果 |
|------|---------|------|
| `WORKTREE_GUARDED_COMMANDS` が `bin/specrunner.ts` に存在しない | grep: 0 matches | ✅ |
| `guardedSubcommands` が `src/cli/command-registry.ts` に存在しない | grep: 0 matches | ✅ |
| `CommandDef / ParentCommandDef / CommandEntry` 型定義が存在しない | grep: 0 matches (TC-037 も確認) | ✅ |
| `--issue` / `--limit` の handler 内 `Number()/isInteger` 重複検証が除去されている | handler ソース確認: `typeof ... === "number"` のみ | ✅ |
| `--merge-wait-ms` が意図的に lenient (string flag + parseInt + isNaN guard + ponytail: コメント) | archive handler 確認 + TC-027 | ✅ |

## 検証できなかった項目

None — 全 normative 要件を verification 結果と実装ソース読解で確認した。

## 計画乖離（plan divergence — finding ではない）

### visibility enum 値の差異

`request.md` 要件 1 のコードスケッチに `"normal" | "operator" | "maintenance" | "repair" | "compatibility"` が記載されているが、実装は `"public" | "compatibility" | "repair" | "internal"` を使用。spec.md / request.md の受け入れ基準はいずれも「metadata として保持する」「列挙 API で filter 可能」を規定するのみで、具体的な enum 値を規範 (MUST) としない。行動上の違いなし。

### handler-local SpecRunnerError catch の残存

`job resume / reopen / attach / archive / prune` ハンドラーが SpecRunnerError を局所的に catch している。`tasks.md T-04` が「集約できるものは集約する。ただし各 handler の exit code / 文言は不変に保つ」と明記しており意図的な設計判断。全局所 catch が Error:/Hint:/exitCode 形式（Fatal 縮退なし）を出力しており規範要件（両経路で正規化）を満たす。

## Findings 詳細

指摘なし。全 normative 要件・受け入れ基準が実装および検証結果で充足されている。
