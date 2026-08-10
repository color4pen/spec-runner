# Tasks: resume operator guidance

## T-01: 統合 halt メッセージ builder を追加する

- [ ] `src/core/resume/adopt-commits.ts` に `buildAdoptionHaltMessage` を新規 export する。引数は `{ slug: string; dirtyCanonPaths: string[]; unadoptedCommits: UnadoptedCommit[]; commitDetectionFailed?: boolean }`（または同等）とし、統合 halt 文字列を返す。
- [ ] 出力に (a) dirty canon paths の列挙（`dirtyCanonPaths` が空なら省略）、(b) 未知 commit の shortSha + subject の列挙（`unadoptedCommits` が空なら省略、各 commit の changed paths も `buildAdoptEscalationMessage` と同水準で提示）を含める。
- [ ] 完全コマンド 1 行を `specrunner job resume <slug>` に組み立てる。`dirtyCanonPaths` 非空なら `--apply-canon`、`unadoptedCommits` 非空なら `--adopt-commits` を付す。両空になる呼び出しは起こらない前提だが、防御的に少なくとも `--apply-canon` を出す。
- [ ] 代替案を提示する: dirty canon には discard（例: `git checkout HEAD -- <path>`）、未知 commit には push / revert（`egressResolutionOptions` の 2 番・3 番と同趣旨）。語り口と字下げは `egressResolutionOptions` / `buildAdoptEscalationMessage` に揃える。
- [ ] `commitDetectionFailed` が true のときは未知 commit 列挙の代わりに「未知 commit の検出に失敗した」旨を併記し、完全コマンドに `--adopt-commits` を付けない（`--apply-canon` のみ）。
- [ ] 既存 `buildAdoptEscalationMessage` の signature と出力は**変更しない**（`src/core/resume/__tests__/adopt-commits.test.ts` TC-U5 を無改変で green に保つため）。

**Acceptance Criteria**:
- `buildAdoptionHaltMessage` が canon-only / canon+commits / 検出失敗の 3 分岐で正しい完全コマンドと内訳を返す。
- dirtyCanonPaths と unadoptedCommits の両方を渡すと出力に両 path 列挙・両 commit 列挙・`--apply-canon --adopt-commits` を含む 1 行が含まれる。
- `buildAdoptEscalationMessage` の出力は本変更後も従来どおりで、`adopt-commits.test.ts` が無改変で green。

## T-02: resume Gate 1 の fail-closed halt を preflight 統合 halt に置き換える

- [ ] `src/core/command/resume.ts` の Gate 1（apply-canon gate）で、dirty canon による fail-closed halt に至る 2 つの else 枝（現 379-384 / 385-391）を、統合 halt に置き換える。`--apply-canon` 経路（313-344）と auto-quarantine 経路（356-378）は変更しない。
- [ ] halt に至る直前で `detectUnadoptedCommits(resolvedWorktreePath, updatedState.synthesizedCommits ?? [], defaultSpawnFn)` を実行する（検出のみ、ledger 追記や commit は行わない）。
- [ ] 検出失敗のハンドリングは Gate 2 と同一方針: message が `exit 128` を含むなら空配列扱い、それ以外は「検出失敗」として `commitDetectionFailed=true` で halt メッセージを組み立てる（fail-closed、pipeline 非起動）。
- [ ] `buildAdoptionHaltMessage` を呼ぶ際、`slug` 引数には `resolvedSlug`（`getJobSlug(state)` で得られる正規 slug）を渡す。Gate 2 が `buildAdoptEscalationMessage` に渡す変数（resume.ts:434）と同一であり、`this.slug`（ユーザー入力 slug、short Job ID prefix の可能性あり）は使用しない。`logError` に検出サマリ（dirty canon paths）、`stderrWrite` に統合メッセージ本文を出力してから `throw new PrepareError(1, ...)` する。既存 Gate 2 の出力慣習（logError にサマリ、stderrWrite に詳細本文）に合わせる。
- [ ] Gate 1 halt 時に Gate 2 が二重に評価されないこと（throw で抜ける現構造を維持）。

**Acceptance Criteria**:
- dirty canon + 未知 commit 併存で resume すると 1 回の halt に両検出内訳と `--apply-canon --adopt-commits` 完全コマンドが含まれる。
- dirty canon のみなら `--apply-canon` のみ、preflight で未知 commit が検出されない場合に `--adopt-commits` を含まない。
- preflight の adopt 検出が exit 128 以外で失敗した場合、検出失敗の旨が併記され `--adopt-commits` を勧めず、pipeline は起動しない（exit 1）。
- halt 前後で git HEAD・commit 数・state.json.synthesizedCommits が不変。
- `--apply-canon` / auto-quarantine の既存挙動は不変（`resume-partial-canon.test.ts`, `apply-canon-provenance.test.ts` が無改変で green）。

## T-03: JOB_RESUME_USAGE を追加し resume エントリに配線する

- [ ] `src/cli/command-registry.ts` に `JOB_RESUME_USAGE` 定数を追加する（`ARCHIVE_USAGE` / `REOPEN_USAGE` と同じテンプレートリテラル形式）。
- [ ] usage 内容: `Usage: specrunner job resume <slug> [options]`、`<slug>` 引数の説明（slug で解決し、見つからなければ Job ID prefix として fallback 解決する旨）、11 flag すべて（`--from` / `--force` / `--verbose` / `--quiet` / `--prompt` / `--prompt-file` / `--json` / `--no-worktree` / `--apply-canon` / `--adopt-commits` / `--detach`）と `--help, -h` の説明。
- [ ] 相互排他 2 組を明記: `--detach` と `--json`、`--prompt` と `--prompt-file`。
- [ ] `--from` の有効値を `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")` で列挙し（`REOPEN_USAGE` の書式に倣う）、複合 step（`custom-reviewers` fan-out / `regression-gate`）は `--from` の対象外である注記を添える。`CLI_STEP_NAMES` に含まれる `bite-evidence` は内部 step（通常の operator は使用しない）である旨を注記として添える。
- [ ] `--apply-canon` / `--adopt-commits` の説明で、fail-closed で採用を要求する意味（operator の canon 編集 / operator 自身の commit を取り込む）を 1 行で示す。
- [ ] resume サブコマンドエントリ（command-registry.ts 632-646 付近）に `usage: JOB_RESUME_USAGE` フィールドを追加する。handler・flags・positional は変更しない。

**Acceptance Criteria**:
- `specrunner job resume --help` および `-h` が exit 0 で、出力に "No detailed help available." を含まない。
- 出力に `--from` / `--prompt` / `--prompt-file` / `--apply-canon` / `--adopt-commits` / `--detach` を含む。
- `runResume` は `--help` 時に呼ばれない。

## T-04: 未解決 slug の報告文言を slug 語彙で包む

- [ ] `src/core/command/resume.ts` の resolveId fallback catch（現 135-142）で、`logError(err.message)` を slug 認識できる文言に差し替える。"Job not found" を保持しつつ "no active job with slug or job ID prefix '<slug>'" を含める（例: `Job not found: no active job with slug or job ID prefix '${this.slug}'`）。
- [ ] SpecRunnerError の `hint` は従来どおり `stderrWrite(\`Hint: ${err.hint}\`)` で出す。exit code（PrepareError(1)）は不変。
- [ ] `JobStateStore.resolveId`（`src/store/job-catalog.ts:288`）と `resolveJobStateBySlug` は変更しない。

**Acceptance Criteria**:
- 存在しない slug の resume 出力に slug で探した事実が分かる文言（slug または job ID prefix で見つからない旨）が含まれ、exit 1。
- 出力に "Job not found" も含まれ、`tests/unit/cli/resume.test.ts` TC-RESUME-010 が無改変で green。
- `tests/resolve-job-id.test.ts` が無改変で green（resolveId のメッセージ不変）。

## T-05: 既存 pin テストの期待を新挙動へ更新する

- [ ] `tests/unit/cli/help-flag-dispatch.test.ts` TC-HELP-DISPATCH-03（139-142 付近）の「"No detailed help available" を含む」assertion を、詳細ヘルプ（例: `--from` や `--apply-canon` を含む / "No detailed help available." を含まない）を検証する形へ更新する。exit 0 と `runResume` 非呼び出しの assertion は残す。理由は design.md の Risks に記載（要件 4 が挙動反転を mandate）。
- [ ] halt メッセージ・halt 回数を pin している次のテストの期待を、統合 halt（1 回・両検出内訳・完全コマンド）へ更新する: `src/core/command/__tests__/resume-apply-canon.test.ts`, `src/core/command/__tests__/resume-adopt-commits.test.ts`, `src/core/command/__tests__/resume-partial-canon.test.ts`, `tests/operator-canon-apply-on-resume-e2e.test.ts`, `tests/resume-partial-canon-quarantine-e2e.test.ts`。挙動が変わらないケース（`--apply-canon` 指定 / auto-quarantine 成立）は期待を変えない。
- [ ] `src/core/resume/__tests__/adopt-commits.test.ts`（TC-U5）は**変更しない**（`buildAdoptEscalationMessage` 不変のため）。

**Acceptance Criteria**:
- 上記許容ファイルと help-flag-dispatch のみを更新し、他の pin テストは無改変で green。
- 更新後、`typecheck && test` が green。

## T-06: 新挙動の検証テストを追加する

- [ ] dirty canon + 未知 commit 併存の resume で、1 回の halt に「dirty canon paths の列挙」「未知 commit の列挙」「実 slug 入りの `specrunner job resume <slug> --apply-canon --adopt-commits`」がすべて含まれることを固定するテストを追加する（`src/core/command/__tests__/` の resume 系、既存 mock 構造を踏襲）。
- [ ] dirty canon のみ → `--apply-canon` のみ、未知 commit のみ → `--adopt-commits` のみを含む完全コマンドが提示されることを固定するテストを追加する。
- [ ] preflight halt の前後で git 履歴（HEAD・commit 数）と state.json の synthesizedCommits が不変（検出のみで副作用なし）であることを固定するテストを追加する。
- [ ] preflight の未知 commit 検出が exit 128 以外で失敗した場合に、検出失敗が併記され `--adopt-commits` を勧めず fail-closed（exit 1）になることを固定するテストを追加する。
- [ ] `job resume --help` の出力が `NO_DETAILED_HELP_USAGE` ではなく、`--from` / `--prompt` / `--prompt-file` / `--apply-canon` / `--adopt-commits` / `--detach` を含むことを固定するテストを追加する（`tests/unit/cli/doctor-help.test.ts` と同型）。
- [ ] resume に存在しない slug を渡した場合の出力に slug で探した事実が分かる文言が含まれることを固定するテストを追加する。

**Acceptance Criteria**:
- 上記すべてのテストが green。
- 追加テストは既存の resume 系 mock（`logError` / `stderrWrite` / git spawn の mock）を用い、新規フレームワーク・fixture を導入しない。
- `typecheck && test` が green。
