# Test Cases: CLI noun-verb restructure

## Metadata

- **change**: cli-noun-verb-restructure
- **generated**: 2026-05-20
- **sources**: request.md (AC), design.md (AD-1〜AD-10), tasks.md (Task 1〜10)

---

## TC-01: job start — linked worktree 内での worktree guard

- **Category**: worktree-guard
- **Priority**: must
- **Source**: Task 1 AC, request.md AC

```
GIVEN: ユーザーが linked worktree 内にいる（git worktree add で作成された checkout）
WHEN:  `specrunner job start <slug>` を実行する
THEN:  worktree guard error が返り、exit code は非ゼロ
       エラーメッセージに "job start" が含まれる
```

---

## TC-02: job resume — linked worktree 内での worktree guard

- **Category**: worktree-guard
- **Priority**: must
- **Source**: Task 1 AC, request.md AC

```
GIVEN: ユーザーが linked worktree 内にいる
WHEN:  `specrunner job resume <slug>` を実行する
THEN:  worktree guard error が返り、exit code は非ゼロ
       エラーメッセージに "job resume" が含まれる
```

---

## TC-03: job finish — linked worktree 内での worktree guard

- **Category**: worktree-guard
- **Priority**: must
- **Source**: Task 1 AC, request.md AC

```
GIVEN: ユーザーが linked worktree 内にいる
WHEN:  `specrunner job finish <slug>` を実行する
THEN:  worktree guard error が返り、exit code は非ゼロ
       エラーメッセージに "job finish" が含まれる
```

---

## TC-04: job ls — linked worktree 内での実行許可

- **Category**: worktree-guard
- **Priority**: must
- **Source**: Task 1 AC, request.md AC

```
GIVEN: ユーザーが linked worktree 内にいる
WHEN:  `specrunner job ls` を実行する
THEN:  worktree guard error は発生しない（正常に job 一覧が返る）
```

---

## TC-05: job rm — linked worktree 内での実行許可

- **Category**: worktree-guard
- **Priority**: must
- **Source**: Task 1 AC, Task 3 AC

```
GIVEN: ユーザーが linked worktree 内にいる
WHEN:  `specrunner job rm <jobId>` を実行する
THEN:  worktree guard error は発生しない
```

---

## TC-06: job show — linked worktree 内での実行許可

- **Category**: worktree-guard
- **Priority**: must
- **Source**: Task 3 AC

```
GIVEN: ユーザーが linked worktree 内にいる
WHEN:  `specrunner job show <jobId>` を実行する
THEN:  worktree guard error は発生しない
```

---

## TC-07: run alias — linked worktree 内での worktree guard

- **Category**: worktree-guard
- **Priority**: must
- **Source**: Task 1 AC

```
GIVEN: ユーザーが linked worktree 内にいる
WHEN:  `specrunner run <slug>` を実行する
THEN:  worktree guard error が返り、exit code は非ゼロ
       （top-level WORKTREE_GUARDED_COMMANDS 経由で guard される）
```

---

## TC-08: request new — テンプレートからファイル作成

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC, request.md AC

```
GIVEN: `specrunner/requests/active/` 配下に `test-slug` ディレクトリが存在しない
WHEN:  `specrunner request new test-slug` を実行する
THEN:  `specrunner/requests/active/test-slug/request.md` が作成される
       stderr に "Created: specrunner/requests/active/test-slug/request.md" が出力される
       exit code 0
```

---

## TC-09: request new — slug 重複時のエラー

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 Tests

```
GIVEN: `specrunner/requests/active/existing-slug/request.md` が既に存在する
WHEN:  `specrunner request new existing-slug` を実行する
THEN:  SLUG_COLLISION エラーが返る
       exit code は非ゼロ
```

---

## TC-10: request generate — 旧 request create と同等動作

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC, request.md AC

```
GIVEN: LLM 接続が可能な環境
WHEN:  `specrunner request generate "<text>"` を実行する
THEN:  旧 `specrunner request create "<text>"` と同等の動作をする
```

---

## TC-11: request ls — active 配下の request 一覧

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC

```
GIVEN: `specrunner/requests/active/` 配下に複数の request が存在する
WHEN:  `specrunner request ls` を実行する
THEN:  active 配下の request 一覧が stdout に出力される
       旧 `specrunner request list` と同等の出力
```

---

## TC-12: request show — slug による request.md の stdout 出力

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC, request.md AC

```
GIVEN: `specrunner/requests/active/my-slug/request.md` が存在する
WHEN:  `specrunner request show my-slug` を実行する
THEN:  request.md の内容が stdout に出力される
       exit code 0
```

---

## TC-13: request show — 存在しない slug でのエラー

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 Tests

```
GIVEN: `specrunner/requests/active/nonexistent/` が存在しない
WHEN:  `specrunner request show nonexistent` を実行する
THEN:  stderr にエラーメッセージが出力される
       exit code 1
```

---

## TC-14: request rm — active 配下のディレクトリ削除

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 Tests

```
GIVEN: `specrunner/requests/active/to-delete/` が存在する
WHEN:  `specrunner request rm to-delete` を実行する
THEN:  `specrunner/requests/active/to-delete/` ディレクトリが削除される
       exit code 0
```

---

## TC-15: request rm — 存在しない slug でのエラー

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 Tests

```
GIVEN: `specrunner/requests/active/ghost-slug/` が存在しない
WHEN:  `specrunner request rm ghost-slug` を実行する
THEN:  stderr に "Request not found: ghost-slug" が出力される
       exit code 1
```

---

## TC-16: request validate — slug による active 配下の解決

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC, request.md AC

```
GIVEN: `specrunner/requests/active/my-slug/request.md` が存在する
WHEN:  `specrunner request validate my-slug` を実行する
THEN:  slug が active 配下のファイルパスに解決され、validate が実行される
```

---

## TC-17: request validate — file path による直接指定（後方互換）

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC, design.md AD-8

```
GIVEN: 任意のパスに request.md が存在する
WHEN:  `specrunner request validate /path/to/request.md` を実行する
THEN:  指定されたファイルパスで validate が実行される（後方互換維持）
```

---

## TC-18: request template — 雛形 markdown の stdout 出力

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner request template` を実行する
THEN:  雛形 markdown が stdout に出力される
       exit code 0
```

---

## TC-19: request review — slug による active 配下の解決

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC, request.md AC

```
GIVEN: `specrunner/requests/active/my-slug/request.md` が存在する
WHEN:  `specrunner request review my-slug` を実行する
THEN:  slug が active 配下に解決され、architect review が実行される
```

---

## TC-20: request review — --json フラグの維持

- **Category**: request-commands
- **Priority**: must
- **Source**: Task 2 AC（regression なし）

```
GIVEN: `specrunner/requests/active/my-slug/request.md` が存在する
WHEN:  `specrunner request review my-slug --json` を実行する
THEN:  JSON 形式でレビュー結果が出力される（既存動作と変わらない）
```

---

## TC-21: job start — slug 指定でのパイプライン開始

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: `specrunner/requests/active/my-slug/request.md` が存在する
WHEN:  `specrunner job start my-slug` を実行する
THEN:  パイプラインが開始し jobId が発行される
       旧 `specrunner run my-slug` と同等の動作
```

---

## TC-22: job start — file path 指定でのパイプライン開始

- **Category**: job-commands
- **Priority**: must
- **Source**: request.md AC, design.md 判断4

```
GIVEN: request.md が存在する
WHEN:  `specrunner job start /path/to/request.md` を実行する
THEN:  パイプラインが開始する（slug / file path 両受け）
```

---

## TC-23: job ls — 全 job 一覧の表示

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: job state が存在する
WHEN:  `specrunner job ls` を実行する
THEN:  旧 `specrunner ps` と同等の出力が stdout に表示される
```

---

## TC-24: job show — jobId による state 詳細表示

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: 有効な jobId の job state が存在する
WHEN:  `specrunner job show <jobId>` を実行する
THEN:  以下 6 フィールドが stdout に出力される:
       - Job ID
       - Status
       - Branch
       - Step
       - Created
       - Updated
```

---

## TC-25: job show — slug による job の解決と state 表示

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: slug に紐づく job state が存在する
WHEN:  `specrunner job show <slug>` を実行する
THEN:  slug から job state が解決され、6 フィールドが stdout に出力される
```

---

## TC-26: job rm — jobId による job state 削除

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: 有効な jobId の job state が存在する
WHEN:  `specrunner job rm <jobId>` を実行する
THEN:  旧 `specrunner rm <jobId>` と同等に job state が削除される
```

---

## TC-27: job resume — halted job の再開

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: halted 状態の job が存在する
WHEN:  `specrunner job resume <slug>` を実行する
THEN:  旧 `specrunner resume <slug>` と同等に job が再開される
```

---

## TC-28: job finish — PR merge + archive

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: PR が作成済みの job が存在する
WHEN:  `specrunner job finish <slug>` を実行する
THEN:  旧 `specrunner finish <slug>` と同等に PR merge + archive が実行される
```

---

## TC-29: job unknown — 不明 subcommand のエラーメッセージ

- **Category**: job-commands
- **Priority**: must
- **Source**: Task 3 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner job unknown` を実行する
THEN:  "Unknown job subcommand: unknown" のようなメッセージが出力される
       exit code は非ゼロ
```

---

## TC-30: run alias — job start と同等動作

- **Category**: aliases
- **Priority**: must
- **Source**: Task 4 AC, request.md AC

```
GIVEN: `specrunner/requests/active/my-slug/request.md` が存在する
WHEN:  `specrunner run my-slug` を実行する
THEN:  `specrunner job start my-slug` と同等にパイプラインが開始する
       唯一の後方互換 alias として機能する
```

---

## TC-31: 旧 ps コマンドの削除確認

- **Category**: removed-commands
- **Priority**: must
- **Source**: Task 4 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner ps` を実行する
THEN:  "Unknown command: ps" のようなメッセージが出力される
       exit code は非ゼロ（exit 2）
```

---

## TC-32: 旧 top-level rm コマンドの削除確認

- **Category**: removed-commands
- **Priority**: must
- **Source**: Task 4 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner rm` を実行する
THEN:  "Unknown command: rm" のようなメッセージが出力される
       exit code は非ゼロ（exit 2）
```

---

## TC-33: 旧 top-level resume コマンドの削除確認

- **Category**: removed-commands
- **Priority**: must
- **Source**: Task 4 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner resume` を実行する
THEN:  "Unknown command: resume" のようなメッセージが出力される
       exit code は非ゼロ（exit 2）
```

---

## TC-34: 旧 top-level finish コマンドの削除確認

- **Category**: removed-commands
- **Priority**: must
- **Source**: Task 4 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner finish` を実行する
THEN:  "Unknown command: finish" のようなメッセージが出力される
       exit code は非ゼロ（exit 2）
```

---

## TC-35: 旧 request create コマンドの削除確認

- **Category**: removed-commands
- **Priority**: must
- **Source**: request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner request create` を実行する
THEN:  "Unknown request subcommand: create" のようなメッセージが出力される
```

---

## TC-36: 旧 request list コマンドの削除確認

- **Category**: removed-commands
- **Priority**: must
- **Source**: request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner request list` を実行する
THEN:  "Unknown request subcommand: list" のようなメッセージが出力される
```

---

## TC-37: runtime setup — managed setup と同等動作

- **Category**: runtime-commands
- **Priority**: must
- **Source**: Task 5 AC, request.md AC

```
GIVEN: Anthropic Managed Agents の設定が可能な環境
WHEN:  `specrunner runtime setup` を実行する
THEN:  旧 `specrunner managed setup` と同等の動作をする
```

---

## TC-38: runtime status — managed status と同等動作

- **Category**: runtime-commands
- **Priority**: must
- **Source**: Task 5 AC, request.md AC

```
GIVEN: Anthropic Managed Agents の設定が存在する
WHEN:  `specrunner runtime status` を実行する
THEN:  旧 `specrunner managed status` と同等の動作をする
```

---

## TC-39: runtime reset — managed reset と同等動作

- **Category**: runtime-commands
- **Priority**: must
- **Source**: Task 5 AC, request.md AC

```
GIVEN: Anthropic Managed Agents の設定が存在する
WHEN:  `specrunner runtime reset --force` を実行する
THEN:  旧 `specrunner managed reset --force` と同等の動作をする
```

---

## TC-40: 旧 managed コマンドの削除確認

- **Category**: removed-commands
- **Priority**: must
- **Source**: Task 5 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner managed setup` を実行する
THEN:  "Unknown command: managed" のようなメッセージが出力される
       exit code は非ゼロ
```

---

## TC-41: --help — 主語別グルーピング表示

- **Category**: help-output
- **Priority**: must
- **Source**: Task 6 AC, request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner --help` を実行する
THEN:  以下 3 ブロックで出力される:
       1. "Request commands" ブロック（8 subcommands 列挙）
       2. "Job commands" ブロック（6 subcommands 列挙）
       3. "Environment" ブロック（init / login / doctor / runtime）
       "Aliases" セクションに `run` のみ記載される
```

---

## TC-42: 引数なし実行 — 新 USAGE が stderr に出力される

- **Category**: help-output
- **Priority**: should
- **Source**: Task 6 Tests

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner`（引数なし）を実行する
THEN:  新 USAGE テキスト（主語別グルーピング）が stderr に出力される
```

---

## TC-43: run.ts の Hint 文が request ls を参照

- **Category**: help-output
- **Priority**: must
- **Source**: Task 6 AC（stale string 修正）

```
GIVEN: slug が見つからないケース
WHEN:  `specrunner run <not-found-slug>` を実行する
THEN:  Hint 文に "Use 'specrunner request ls' to see available slugs." が含まれる
       "specrunner request list" の参照が含まれない
```

---

## TC-44: README の最短フローが新体系で記述されている

- **Category**: readme
- **Priority**: must
- **Source**: Task 7 AC, request.md AC

```
GIVEN: README.md を開く
WHEN:  Quick Start / コマンドリファレンスセクションを確認する
THEN:  以下の最短フローが記述されている:
       init → login → request new → job start → job ls → job finish
       失敗時フロー: job ls → job resume
       alias 一覧に run のみが記載されている
       local / managed runtime 差分の説明が含まれる
```

---

## TC-45: slug validation — path traversal の拒否（request new）

- **Category**: validation
- **Priority**: must
- **Source**: Task 2b AC, design.md AD-9

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner request new "../../evil"` を実行する
THEN:  slug validation error が返る
       exit code 2
```

---

## TC-46: slug validation — path traversal の拒否（request rm）

- **Category**: validation
- **Priority**: must
- **Source**: Task 2b AC, design.md AD-9

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner request rm "../../etc/passwd"` を実行する
THEN:  slug validation error が返り、再帰削除は実行されない
       exit code 2
```

---

## TC-47: slug validation — スペース含む不正 slug の拒否

- **Category**: validation
- **Priority**: must
- **Source**: Task 2b AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner request show "invalid slug"` を実行する
THEN:  slug validation error が返る
       exit code 2
```

---

## TC-48: slug validation — 正常 slug の通過

- **Category**: validation
- **Priority**: must
- **Source**: Task 2b AC

```
GIVEN: `specrunner/requests/active/my-feature-123/request.md` が存在する
WHEN:  `specrunner request show my-feature-123` を実行する
THEN:  `/^[a-z0-9][a-z0-9-]{0,63}$/` に一致するため validation を通過し
       request.md の内容が stdout に出力される
```

---

## TC-49: jobId validation — UUID 形式でない jobId の拒否（job rm）

- **Category**: validation
- **Priority**: must
- **Source**: Task 2b AC, design.md AD-9

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner job rm "../../../etc/passwd"` を実行する
THEN:  "Error: invalid jobId format" のようなメッセージが stderr に出力される
       exit code 1
```

---

## TC-50: jobId validation — UUID 形式でない jobId の拒否（job show）

- **Category**: validation
- **Priority**: must
- **Source**: Task 2b AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner job show "invalid-not-uuid"` を実行する
THEN:  jobId validation error が返る
       exit code 1
```

---

## TC-51: jobId validation — 正常 UUID の通過（job show）

- **Category**: validation
- **Priority**: must
- **Source**: Task 2b AC

```
GIVEN: UUID 形式（`/^[a-f0-9-]{36}$/`）の jobId に対応する job state が存在する
WHEN:  `specrunner job show <valid-uuid>` を実行する
THEN:  validation を通過し、job state が表示される
```

---

## TC-52: delta spec — cli-commands capability の更新確認

- **Category**: delta-spec
- **Priority**: must
- **Source**: Task 8 AC, request.md AC

```
GIVEN: `specrunner/changes/cli-noun-verb-restructure/specs/cli-commands/spec.md` を確認する
WHEN:  内容を検査する
THEN:  新体系（noun-verb 体系）のサブコマンド群に対応した Requirement が記述されている
```

---

## TC-53: delta spec — cli-finish-command capability の更新確認

- **Category**: delta-spec
- **Priority**: must
- **Source**: Task 8 AC, request.md AC

```
GIVEN: `specrunner/changes/cli-noun-verb-restructure/specs/cli-finish-command/spec.md` を確認する
WHEN:  内容を検査する
THEN:  `job finish` に合わせた Requirement が記述されている
```

---

## TC-54: delta spec — cli-resume-command capability の更新確認

- **Category**: delta-spec
- **Priority**: must
- **Source**: Task 8 AC, request.md AC

```
GIVEN: `specrunner/changes/cli-noun-verb-restructure/specs/cli-resume-command/spec.md` を確認する
WHEN:  内容を検査する
THEN:  `job resume` に合わせた Requirement が記述されている
```

---

## TC-55: delta spec — managed-cli-commands capability の更新確認

- **Category**: delta-spec
- **Priority**: must
- **Source**: Task 8 AC, request.md AC

```
GIVEN: `specrunner/changes/cli-noun-verb-restructure/specs/managed-cli-commands/spec.md` を確認する
WHEN:  内容を検査する
THEN:  `runtime setup/status/reset` に rename された Requirement が記述されている
```

---

## TC-56: build — typecheck + test が green

- **Category**: build
- **Priority**: must
- **Source**: Task 9 AC, request.md AC

```
GIVEN: 全 task の実装が完了している
WHEN:  `bun run typecheck && bun run test` を実行する
THEN:  型エラーなし、テスト全件 pass
       exit code 0
```

---

## TC-57: ADR — 5 つの判断が記録されている

- **Category**: adr
- **Priority**: must
- **Source**: Task 10 AC, request.md AC

```
GIVEN: `docs/adr/002-cli-noun-verb-restructure.md` が作成されている
WHEN:  ファイルの内容を確認する
THEN:  以下 5 つの判断が記録されている:
       1. noun-verb 体系の採用理由（gh / docker / aws 慣用）
       2. request / job 責務境界の判断軸（static file vs stateful execution）
       3. run alias のみ維持の判断（npm run / python run の慣性）
       4. managed → runtime rename 判断（配布前の破壊コストゼロ）
       5. worktree guard 修正方針（guardedSubcommands 採用）
```

---

## TC-58: job start — verbose フラグの引き継ぎ

- **Category**: job-commands
- **Priority**: should
- **Source**: design.md AD-3, Task 3 Details

```
GIVEN: request.md が存在する
WHEN:  `specrunner job start my-slug --verbose` を実行する
THEN:  verbose モードでパイプラインが開始する（旧 run --verbose と同等）
```

---

## TC-59: job ls — フィルタオプションの動作

- **Category**: job-commands
- **Priority**: should
- **Source**: design.md AD-10, Task 3 Details

```
GIVEN: 複数の job state が存在する
WHEN:  `specrunner job ls --active` / `--all` / `--status=<s>` を実行する
THEN:  旧 `specrunner ps` の同等オプションと同じフィルタ結果が返る
```

---

## TC-60: job finish — --dry-run オプションの動作

- **Category**: job-commands
- **Priority**: should
- **Source**: design.md AD-10

```
GIVEN: PR が作成済みの job が存在する
WHEN:  `specrunner job finish <slug> --dry-run` を実行する
THEN:  実際の merge は行われず、dry-run の出力が返る
```

---

## TC-61: request new — --type オプションによる template 種別指定

- **Category**: request-commands
- **Priority**: should
- **Source**: design.md AD-5, AD-10

```
GIVEN: 利用可能な type が存在する
WHEN:  `specrunner request new my-slug --type spec-change` を実行する
THEN:  指定した type の template が `specrunner/requests/active/my-slug/request.md` に書き出される
```

---

## TC-62: request review — file path による直接指定（後方互換）

- **Category**: request-commands
- **Priority**: should
- **Source**: design.md 判断4

```
GIVEN: 任意のパスに request.md が存在する
WHEN:  `specrunner request review /path/to/request.md` を実行する
THEN:  指定ファイルに対して architect review が実行される（file path 引数後方互換）
```

---

## TC-63: managed コマンドのサブコマンドも拒否される

- **Category**: removed-commands
- **Priority**: should
- **Source**: request.md AC

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner managed status` を実行する
THEN:  "Unknown command: managed" のようなメッセージが出力される
       （サブコマンドがあっても親コマンドで弾かれる）
```

---

## TC-64: job start — 不明 slug でのエラーメッセージ

- **Category**: job-commands
- **Priority**: should
- **Source**: TC-43 派生（Hint 文確認）

```
GIVEN: 存在しない slug を指定する
WHEN:  `specrunner job start ghost-slug` を実行する
THEN:  エラーメッセージに "specrunner request ls" への誘導が含まれる
       "specrunner request list" の参照は含まれない
```

---

## TC-65: USAGE 内に managed の参照が残っていない

- **Category**: help-output
- **Priority**: should
- **Source**: Task 6 Stale string updates

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner --help` の出力を確認する
THEN:  USAGE 内に "managed" コマンドへの参照が含まれない
       "runtime" に統一されている
```

---

## TC-66: runtime reset の USAGE 文字列が runtime を参照

- **Category**: runtime-commands
- **Priority**: should
- **Source**: Task 6 Details（RUNTIME_RESET_USAGE rename）

```
GIVEN: 特別な前提条件なし
WHEN:  `specrunner runtime reset --help` の出力を確認する
THEN:  USAGE 文字列内が "specrunner runtime reset" を参照している
       "specrunner managed reset" の参照は含まれない
```
