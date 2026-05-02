# Test Cases: cli-finish-command

## Summary

- **Total**: 65 cases
- **Automated** (unit/integration/e2e): 59
- **Manual**: 6
- **Priority**: must: 42, should: 18, could: 5

## Test Cases

---

### TC-001: jobId で state file を解決して PR 番号・branch・slug を取得できる

**Category**: unit
**Priority**: must
**Source**: tasks.md §2.2, design.md §6

**GIVEN** `~/.local/share/specrunner/jobs/<uuid>.json` が存在し `pullRequest.number`, `branch`, `request.path` を含む
**WHEN** `resolveTarget({ jobId: "<uuid>" })` を呼ぶ
**THEN** `{ prNumber, branch, slug }` が正しく返る

---

### TC-002: --slug で単一の state file を解決できる

**Category**: unit
**Priority**: must
**Source**: tasks.md §2.3, design.md §6

**GIVEN** jobs/ ディレクトリに `request.path` の basename が `<slug>` と一致する state が 1 件だけ存在する
**WHEN** `resolveTarget({ slug: "<slug>" })` を呼ぶ
**THEN** その state が採用されて `{ prNumber, branch, slug }` が返る

---

### TC-003: --slug で複数 state が該当する場合は最新 updatedAt を採用して stdout 通知が出る

**Category**: unit
**Priority**: should
**Source**: tasks.md §2.3, design.md §6

**GIVEN** jobs/ ディレクトリに同じ `<slug>` を持つ state が 2 件存在し、updatedAt が異なる
**WHEN** `resolveTarget({ slug: "<slug>" })` を呼ぶ
**THEN** 最新 updatedAt の state が採用され、stdout に複数該当の通知メッセージが出力される

---

### TC-004: awaiting-merge dir に slug が 1 件のみのとき自動検出される

**Category**: unit
**Priority**: must
**Source**: tasks.md §2.4, request.md §2 入力解決

**GIVEN** jobId も --slug も未指定で `openspec-workflow/requests/awaiting-merge/` に slug が 1 件だけ存在する
**WHEN** `resolveTarget({})` を呼ぶ
**THEN** その slug が採用されて処理が続行される

---

### TC-005: awaiting-merge dir に slug が 0 件のとき exit code 2 で停止する

**Category**: unit
**Priority**: must
**Source**: tasks.md §2.4

**GIVEN** jobId も --slug も未指定で `openspec-workflow/requests/awaiting-merge/` が空
**WHEN** `resolveTarget({})` を呼ぶ
**THEN** exit code 2 で停止し、usage が stdout / stderr に出力される

---

### TC-006: awaiting-merge dir に slug が 2 件以上のとき exit code 2 で停止する

**Category**: unit
**Priority**: must
**Source**: tasks.md §2.4, request.md §2 入力解決

**GIVEN** jobId も --slug も未指定で `openspec-workflow/requests/awaiting-merge/` に slug が 2 件存在する
**WHEN** `resolveTarget({})` を呼ぶ
**THEN** exit code 2 で停止し、使用可能な slug 一覧と --slug 指定を促すメッセージが出力される

---

### TC-007: OPEN_MERGEABLE 状態にマップされる

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.2, request.md §3 PR 状態検知

**GIVEN** `gh pr view` が `{ state: "OPEN", mergeStateStatus: "CLEAN" }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"OPEN_MERGEABLE"` が返る

---

### TC-008: OPEN_BEHIND 状態にマップされる

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.2, request.md §3

**GIVEN** `gh pr view` が `{ state: "OPEN", mergeStateStatus: "BEHIND" }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"OPEN_BEHIND"` が返る

---

### TC-009: OPEN_CONFLICTS 状態にマップされる

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.2, request.md §3

**GIVEN** `gh pr view` が `{ state: "OPEN", mergeStateStatus: "DIRTY" }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"OPEN_CONFLICTS"` が返る

---

### TC-010: OPEN_CHECKS_FAILING 状態にマップされる（BLOCKED）

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.2, request.md §3

**GIVEN** `gh pr view` が `{ state: "OPEN", mergeStateStatus: "BLOCKED" }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"OPEN_CHECKS_FAILING"` が返る

---

### TC-011: OPEN_CHECKS_FAILING 状態にマップされる（statusCheckRollup failure）

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.3, request.md §3

**GIVEN** `gh pr view` が `{ state: "OPEN", mergeStateStatus: "CLEAN", statusCheckRollup: [{ conclusion: "FAILURE" }] }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"OPEN_CHECKS_FAILING"` が返る（CLEAN でも checks failing なら OPEN_CHECKS_FAILING に倒す）

---

### TC-012: MERGED 状態にマップされる

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.2, request.md §3

**GIVEN** `gh pr view` が `{ state: "MERGED" }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"MERGED"` が返る

---

### TC-013: CLOSED 状態にマップされる

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.2, request.md §3

**GIVEN** `gh pr view` が `{ state: "CLOSED" }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"CLOSED"` が返る

---

### TC-014: 未知の mergeStateStatus は OPEN_CHECKS_FAILING にフォールバックする

**Category**: unit
**Priority**: must
**Source**: tasks.md §3.4, design.md §7

**GIVEN** `gh pr view` が `{ state: "OPEN", mergeStateStatus: "FUTURE_UNKNOWN_VALUE" }` を返す fixture
**WHEN** `normalizePrState(ghOutput)` を呼ぶ
**THEN** `"OPEN_CHECKS_FAILING"` が返る（safe default フォールバック）

---

### TC-015: OPEN_MERGEABLE のとき feature PR が通常 merge される

**Category**: unit
**Priority**: must
**Source**: tasks.md §4.1, request.md §4

**GIVEN** PR 状態が `OPEN_MERGEABLE` で `--force` フラグが未指定
**WHEN** feature PR merge ステップが実行される
**THEN** `gh pr merge <PR> --squash --delete-branch` が呼ばれ、exit code 0 で完了する

---

### TC-016: OPEN_CHECKS_FAILING + --force で admin merge が呼ばれる

**Category**: unit
**Priority**: must
**Source**: tasks.md §4.2, request.md §3, 受け入れ基準

**GIVEN** PR 状態が `OPEN_CHECKS_FAILING` で `--force` フラグが指定されている
**WHEN** feature PR merge ステップが実行される
**THEN** `gh pr merge <PR> --squash --delete-branch --admin` が呼ばれる

---

### TC-017: MERGED 状態のとき merge ステップが skip され stdout に通知が出る

**Category**: unit
**Priority**: must
**Source**: tasks.md §4.3, request.md §3

**GIVEN** PR 状態が `MERGED`
**WHEN** feature PR merge ステップが実行される
**THEN** `gh pr merge` は呼ばれず、"feature PR already merged, skipping" 相当のメッセージが stdout に出力される

---

### TC-018: --cleanup-only 指定のとき merge ステップが skip される

**Category**: unit
**Priority**: must
**Source**: tasks.md §4.3, request.md §1 CLI シグネチャ

**GIVEN** `--cleanup-only` フラグが指定されている
**WHEN** feature PR merge ステップが実行される
**THEN** `gh pr merge` は呼ばれず、skip メッセージが stdout に出力される

---

### TC-019: OPEN_BEHIND のとき escalation が出力されて non-zero exit する

**Category**: unit
**Priority**: must
**Source**: tasks.md §9.4, request.md §3, 受け入れ基準

**GIVEN** PR 状態が `OPEN_BEHIND`
**WHEN** `specrunner finish <jobId>` を実行する
**THEN** escalation block（失敗ステップ名 / 検知状態 `OPEN_BEHIND` / rebase 推奨コマンド / 再実行コマンド）が stdout に出力され、exit code が non-zero になる

---

### TC-020: OPEN_CONFLICTS のとき escalation が出力されて non-zero exit する

**Category**: unit
**Priority**: must
**Source**: tasks.md §9.4, request.md §3, 受け入れ基準

**GIVEN** PR 状態が `OPEN_CONFLICTS`
**WHEN** `specrunner finish <jobId>` を実行する
**THEN** escalation block（失敗ステップ名 / 検知状態 `OPEN_CONFLICTS` / 手動 conflict 解消案内 / 再実行コマンド）が stdout に出力され、exit code が non-zero になる

---

### TC-021: OPEN_CHECKS_FAILING（--force なし）のとき --force 案内付き escalation が出力される

**Category**: unit
**Priority**: must
**Source**: tasks.md §9.4, request.md §3, 受け入れ基準

**GIVEN** PR 状態が `OPEN_CHECKS_FAILING` で `--force` フラグが未指定
**WHEN** `specrunner finish <jobId>` を実行する
**THEN** escalation block に `--force` フラグの案内が含まれ、non-zero exit する

---

### TC-022: CLOSED のとき "use specrunner cancel" エラーで停止する

**Category**: unit
**Priority**: must
**Source**: request.md §3, 受け入れ基準

**GIVEN** PR 状態が `CLOSED`
**WHEN** `specrunner finish <jobId>` を実行する
**THEN** "use specrunner cancel" の案内を含むエラーメッセージが出力されて non-zero exit する

---

### TC-023: escalation block に必須フィールドが 4 つ揃っている（snapshot）

**Category**: unit
**Priority**: must
**Source**: tasks.md §9.1, request.md §8 escalation 出力フォーマット

**GIVEN** `formatEscalation({ failedStep, detectedState, recommendedAction, resumeCommand })` が呼ばれる
**WHEN** OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / subprocess 失敗 の各パターンで出力文字列を生成する
**THEN** 失敗ステップ名・検知状態・推奨人間操作・再実行コマンドの 4 要素が全パターンで出力文字列に含まれる（snapshot 一致）

---

### TC-024: openspec/changes/<slug>/ が存在するとき openspec archive が呼ばれる（delta spec あり）

**Category**: unit
**Priority**: must
**Source**: tasks.md §5.2, §5.3, request.md §5

**GIVEN** `openspec/changes/<slug>/` が存在し `specs/` 配下に `.md` ファイルが 1 件以上ある
**WHEN** archive openspec ステップが実行される
**THEN** `openspec archive <slug>` が呼ばれる（`--skip-specs` なし）

---

### TC-025: openspec/changes/<slug>/specs/ が空のとき --skip-specs で呼ばれる

**Category**: unit
**Priority**: must
**Source**: tasks.md §5.3, request.md §5, 受け入れ基準

**GIVEN** `openspec/changes/<slug>/` が存在し `specs/` 配下に `.md` ファイルが 0 件
**WHEN** archive openspec ステップが実行される
**THEN** `openspec archive <slug> --skip-specs` が呼ばれる

---

### TC-026: openspec/changes/<slug>/ が存在しないとき archive ステップ全体が skip される

**Category**: unit
**Priority**: must
**Source**: tasks.md §5.2, request.md §5, 受け入れ基準

**GIVEN** `openspec/changes/<slug>/` が存在しない
**WHEN** archive openspec ステップが実行される
**THEN** `openspec archive` は呼ばれず、skip メッセージが出力される

---

### TC-027: awaiting-merge → merged の git mv が実行される

**Category**: unit
**Priority**: must
**Source**: tasks.md §6.1, request.md §5

**GIVEN** `openspec-workflow/requests/awaiting-merge/<slug>/` が存在し `merged/<slug>/` が存在しない
**WHEN** requests dir 移送ステップが実行される
**THEN** `git mv awaiting-merge/<slug> merged/<slug>` が呼ばれる

---

### TC-028: merged/ 存在 + awaiting-merge/ 不在のとき mv が skip される（冪等）

**Category**: unit
**Priority**: must
**Source**: tasks.md §6.2, request.md §9 冪等性

**GIVEN** `merged/<slug>/` が存在し `awaiting-merge/<slug>/` が存在しない
**WHEN** requests dir 移送ステップが実行される
**THEN** `git mv` は呼ばれず、skip 通知が stdout に出力される

---

### TC-029: 全ステップ成功後に JobStatus が archived に更新される

**Category**: unit
**Priority**: must
**Source**: tasks.md §8.1, request.md §7, 受け入れ基準

**GIVEN** 全ステップが成功し、state.status が `success` の job state が存在する
**WHEN** job state 更新ステップが実行される
**THEN** `status` が `"archived"` に、history に `{ step: "finish", status: "ok" }` のエントリが追記される

---

### TC-030: escalation 終了時は job state が変更されない

**Category**: unit
**Priority**: must
**Source**: tasks.md §8.2, request.md §9 冪等性

**GIVEN** PR 状態が `OPEN_BEHIND` で escalation が発生する
**WHEN** `specrunner finish <jobId>` を実行する
**THEN** 終了後も job state の `status` は変更されていない

---

### TC-031: status=running の job への finish 実行が拒否される

**Category**: unit
**Priority**: must
**Source**: tasks.md §8.4

**GIVEN** job state の `status` が `"running"`
**WHEN** `specrunner finish <jobId>` を実行する
**THEN** エラーメッセージ（`JOB_NOT_FINISHABLE` 相当）が出力されて non-zero exit する

---

### TC-032: JobStatus archived を含む state file が ps で問題なく読める（後方互換）

**Category**: unit
**Priority**: must
**Source**: tasks.md §11.1, request.md 受け入れ基準, design.md §5

**GIVEN** `status: "archived"` を含む state file が存在する
**WHEN** `specrunner ps` を実行する
**THEN** クラッシュせず、archived ステータスが適切に表示される

---

### TC-033: archived 追加前の既存 state file（status=success）が ps で読める（後方互換）

**Category**: unit
**Priority**: must
**Source**: tasks.md §11.1, design.md §5 Migration Plan

**GIVEN** `status: "success"` を含む古い形式の state file が存在する
**WHEN** `specrunner ps` を実行する
**THEN** クラッシュせず正常に読み込まれ表示される

---

### TC-034: specrunner ps --active フィルタが archived を除外する

**Category**: unit
**Priority**: must
**Source**: tasks.md §11.2

**GIVEN** `archived` と `running` の state file が混在する
**WHEN** `specrunner ps --active` を実行する
**THEN** `archived` の job は結果に含まれず、`running` の job のみ表示される

---

### TC-035: archive PR が auto-merge で作成される

**Category**: integration
**Priority**: must
**Source**: tasks.md §7.1-7.3, request.md §6, 受け入れ基準

**GIVEN** feature PR が MERGED 済みで archive ブランチが正常に作成される
**WHEN** archive PR ステップが実行される
**THEN** `git push -u origin chore/archive-<slug>` → `gh pr create` → `gh pr merge --auto --squash --delete-branch` の順で呼ばれ、archive PR URL が返る

---

### TC-036: auto-merge 利用不可時に即時 merge で fallback される

**Category**: integration
**Priority**: must
**Source**: tasks.md §7.4, request.md §6, design.md §1

**GIVEN** `gh pr merge --auto` が non-zero exit し、エラー文字列に auto-merge 不可を示すメッセージが含まれる
**WHEN** archive PR ステップが実行される
**THEN** `gh pr merge --squash --delete-branch <archive PR URL>` で fallback 実行される

---

### TC-037: archive PR 作成に使う body が tempfile 経由で渡される

**Category**: unit
**Priority**: should
**Source**: tasks.md §7.2, module-analysis.md §2.3

**GIVEN** archive PR ステップが実行される
**WHEN** `gh pr create` が呼ばれる
**THEN** `--body-file <tempfile>` オプションが使われ、tempfile は `try/finally` で cleanup される

---

### TC-038: git push 失敗時に escalation block が出力される

**Category**: unit
**Priority**: should
**Source**: tasks.md §7.5

**GIVEN** `git push -u origin chore/archive-<slug>` が non-zero exit する
**WHEN** archive PR ステップが実行される
**THEN** escalation block（失敗ステップ "archive PR creation" / 推奨操作 / 再実行コマンド）が stdout に出力され non-zero exit する

---

### TC-039: loadJobState が ENOENT のとき JOB_NOT_FOUND エラーを throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md §1.5, module-analysis.md §2.4

**GIVEN** 存在しない jobId を指定する
**WHEN** `loadJobState(jobId)` を呼ぶ
**THEN** `JOB_NOT_FOUND` 相当のエラーが throw される

---

### TC-040: loadJobState が parse failure のとき STATE_FILE_INVALID エラーを throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md §1.5, module-analysis.md §2.4

**GIVEN** state file の JSON が破損している
**WHEN** `loadJobState(jobId)` を呼ぶ
**THEN** `STATE_FILE_INVALID` 相当のエラーが throw される

---

### TC-041: updateJobState が atomic write プロトコルに準拠する

**Category**: unit
**Priority**: should
**Source**: tasks.md §8.3, module-analysis.md §2.4

**GIVEN** 有効な state file が存在する
**WHEN** `updateJobState(jobId, mutator)` を呼ぶ
**THEN** `*.tmp.<random>` → `fs.rename` の atomic write パターンで書き込まれる

---

### TC-042: gh subprocess が non-zero exit したとき feature PR merge が escalation で停止する

**Category**: unit
**Priority**: should
**Source**: tasks.md §4.4

**GIVEN** `gh pr merge` が non-zero exit code を返す
**WHEN** feature PR merge ステップが実行される
**THEN** escalation block が stdout に出力され non-zero exit する

---

### TC-043: openspec subprocess が non-zero exit したとき escalation で停止する

**Category**: unit
**Priority**: should
**Source**: tasks.md §5.4

**GIVEN** `openspec archive <slug>` が non-zero exit code を返す
**WHEN** archive openspec ステップが実行される
**THEN** escalation block（失敗ステップ "openspec archive" / 推奨操作 / 再実行コマンド）が出力され non-zero exit する

---

### TC-044: git commit で変更がない場合は commit を skip する

**Category**: unit
**Priority**: should
**Source**: tasks.md §6.3

**GIVEN** `git mv` で移送すべき変更がない（既に移送済みで追加変更なし）
**WHEN** commit ステップが実行される
**THEN** `git commit` は呼ばれず、skip メッセージが出力される

---

### TC-045: OPEN_MERGEABLE から archive PR 作成まで全ステップが通しで成功する

**Category**: integration
**Priority**: must
**Source**: request.md 受け入れ基準, design.md Goals

**GIVEN** stub された subprocess で全コマンド（gh / git / openspec）が成功を返す
**WHEN** `runFinishCore({ jobId, flags: {} })` を実行する
**THEN** feature PR merge → archive ブランチ作成 → openspec archive → dir 移送 → git commit → git push → archive PR 作成 → state 更新 の順序で全ステップが完了し exit code 0 になる

---

### TC-046: 部分実行状態（feature merged 済み、archive 未完了）から resume できる

**Category**: integration
**Priority**: must
**Source**: tasks.md §10.5, request.md §9 冪等性, 受け入れ基準

**GIVEN** feature PR が `MERGED` 済みだが `merged/<slug>/` が存在せず `awaiting-merge/<slug>/` がまだ存在する
**WHEN** `specrunner finish <jobId>` を実行する
**THEN** feature PR merge ステップが skip され、archive 以降のステップから resume されて最終的に exit code 0 で完了する

---

### TC-047: 全ステップ完了済みの 2 回目実行が no-op になる

**Category**: integration
**Priority**: must
**Source**: tasks.md §10.4, §10.6, request.md §9 冪等性, 受け入れ基準

**GIVEN** state.status が `"archived"` で `merged/<slug>/` が存在し archive PR が MERGED 済み
**WHEN** `specrunner finish <jobId>` を 2 回目実行する
**THEN** `"Already finished, nothing to do."` 相当のメッセージが stdout に出力されて exit code 0 で終了する

---

### TC-048: specrunner finish --help が usage とフラグ一覧を出力する

**Category**: unit
**Priority**: should
**Source**: tasks.md §11.3

**GIVEN** なし
**WHEN** `specrunner finish --help` を実行する
**THEN** `<jobId>` 引数と `--force` / `--cleanup-only` / `--slug` フラグの説明を含む usage が stdout に出力される

---

### TC-049: specrunner --help に finish の 1 行説明が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md §11.4

**GIVEN** なし
**WHEN** `specrunner --help` を実行する
**THEN** 6 サブコマンド（init / login / run / ps / doctor / finish）が列挙されて finish の説明が含まれる

---

### TC-050: 引数解析エラーは exit code 2 になる

**Category**: unit
**Priority**: should
**Source**: tasks.md §9.3, request.md §1

**GIVEN** 無効な引数（例: `specrunner finish --unknown-flag`）を渡す
**WHEN** `specrunner finish --unknown-flag` を実行する
**THEN** exit code 2 で停止し、usage が出力される

---

### TC-051: LLM 呼び出しコードが finish 実装に含まれていない

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準, design.md Goals

**GIVEN** `src/cli/finish.ts` および `src/core/finish/` 配下のソースが実装されている
**WHEN** `anthropic` import および Managed Agents API 呼び出しを grep する
**THEN** いずれも 0 件である

---

### TC-052: dogfooding-006 で PR #48 を finish ターゲットに E2E 実行する

**Category**: e2e
**Priority**: should
**Source**: tasks.md §12.4, request.md 補足 dogfooding-006

**GIVEN** `specrunner finish` が main に merge 済みで PR #48 (readme-status-section) が OPEN_MERGEABLE な状態
**WHEN** `specrunner finish <jobId>` を実行する（実際の GitHub + gh CLI 環境）
**THEN** PR がマージされ、openspec が archive され、archive PR が作成されて auto-merge され、state が `archived` に更新される

---

### TC-053: spawnCommand 抽出後も pr-create の既存テストが PASS のまま

**Category**: unit
**Priority**: should
**Source**: tasks.md §1.4, module-analysis.md §2.1

**GIVEN** `spawnCommand` が `src/util/spawn.ts` に移送され、`src/core/pr-create/runner.ts` が import に変更されている
**WHEN** pr-create の既存 unit / integration test を実行する
**THEN** 全テストが PASS する（リグレッションなし）

---

### TC-054: TypeScript が JobStatus exhaustive-switch の欠落を型エラーで検出する

**Category**: manual
**Priority**: must
**Source**: tasks.md §1.6, module-analysis.md Risk #7

**GIVEN** `src/state/schema.ts` の `JobStatus` に `"archived"` が追加されている
**WHEN** `tsc --noEmit` を実行する
**THEN** `archived` ケースが未追加の exhaustive-switch 箇所（`ps.ts:formatJobRow` 等）で型エラーが発生し、修正漏れが検出される

---

### TC-055: archive PR auto-merge と fallback の両方が失敗したとき escalation で停止する

**Category**: unit
**Priority**: should
**Source**: tasks.md §7.4, design.md Risks §2

**GIVEN** `gh pr merge --auto` と `gh pr merge` の両方が non-zero exit を返す
**WHEN** archive PR ステップが実行される
**THEN** escalation block（失敗ステップ "archive PR creation" / auto-merge fallback 両失敗 / 手動 merge 案内 / 再実行コマンド）が出力されて non-zero exit する

---

### TC-056: specrunner finish のビルド成果物に LLM 依存ライブラリが含まれない

**Category**: manual
**Priority**: should
**Source**: tasks.md §12.2, §12.3

**GIVEN** `npm run build` でビルドが完了している
**WHEN** ビルド成果物の依存ツリーを確認する
**THEN** `@anthropic-ai/*` 等の LLM 依存がエントリポイントから到達できない

---

### TC-057: chore/archive-<slug> ブランチが remote に存在し archive PR が MERGED の場合 archive 全体が skip される

**Category**: unit
**Priority**: should
**Source**: tasks.md §10.3, request.md §9 冪等性

**GIVEN** `chore/archive-<slug>` が remote に存在し、それに対応する archive PR が `MERGED` 状態
**WHEN** archive ステップが実行される
**THEN** `git push` / `gh pr create` は呼ばれず、skip メッセージが出力されて次ステップへ進む

---

### TC-058: 不明サブコマンドで usage に finish を含む 6 サブコマンドが列挙される

**Category**: manual
**Priority**: could
**Source**: tasks.md §11.5

**GIVEN** `bin/specrunner.ts` に `case "finish"` が追加されている
**WHEN** `specrunner unknown` を実行する
**THEN** usage に finish を含む 6 サブコマンドが列挙される

---

### TC-059: --force は OPEN_BEHIND / OPEN_CONFLICTS には効かず escalation が継続する

**Category**: unit
**Priority**: should
**Source**: request.md §3 状態検知テーブル（--force 時の挙動）

**GIVEN** PR 状態が `OPEN_BEHIND` または `OPEN_CONFLICTS` で `--force` フラグが指定されている
**WHEN** `specrunner finish <jobId> --force` を実行する
**THEN** escalation が出力されて non-zero exit する（`--force` は OPEN_CHECKS_FAILING にのみ効く）

---

### TC-060: --cleanup-only + OPEN_MERGEABLE のとき merge せずに archive から開始される

**Category**: unit
**Priority**: could
**Source**: request.md §1 CLI シグネチャ, tasks.md §4.3

**GIVEN** PR 状態が `OPEN_MERGEABLE` で `--cleanup-only` が指定されている
**WHEN** `specrunner finish <jobId> --cleanup-only` を実行する
**THEN** feature PR merge は実行されず、archive ステップから開始される

---

### TC-061: --slug + --cleanup-only の組み合わせが正常動作する

**Category**: integration
**Priority**: could
**Source**: request.md §1 CLI シグネチャ

**GIVEN** jobId は不明だが `<slug>` を持つ state が 1 件存在し PR が `MERGED` 済み
**WHEN** `specrunner finish --slug <slug> --cleanup-only` を実行する
**THEN** slug から state が解決され、merge ステップが skip されて archive 以降が実行される

---

### TC-062: specrunner finish の typecheck と lint が通る

**Category**: manual
**Priority**: must
**Source**: tasks.md §12.2

**GIVEN** `src/cli/finish.ts` および `src/core/finish/` 配下のファイルが実装されている
**WHEN** `tsc --noEmit` と lint コマンドを実行する
**THEN** 型エラー・lint エラーがゼロで完了する

---

### TC-063: git commit で `chore: archive <slug>` メッセージが使われる

**Category**: unit
**Priority**: could
**Source**: tasks.md §6.3, request.md §5

**GIVEN** `awaiting-merge/<slug>` → `merged/<slug>` の git mv が完了している
**WHEN** commit ステップが実行される
**THEN** `git commit -m "chore: archive <slug>"` が呼ばれる

---

### TC-064: archive PR のタイトルとベースブランチが仕様通り

**Category**: unit
**Priority**: could
**Source**: tasks.md §7.2, request.md §6

**GIVEN** archive ブランチが正常に作成されている
**WHEN** `gh pr create` が呼ばれる
**THEN** `--title "chore: archive <slug>"` と `--base main` と `--head chore/archive-<slug>` が引数に含まれる

---

### TC-065: local main への直 push が実装コードに存在しない

**Category**: manual
**Priority**: must
**Source**: request.md §5, design.md §1, 受け入れ基準

**GIVEN** `src/core/finish/` 配下のソースが実装されている
**WHEN** `git push origin main` 等のパターンをソース grep する
**THEN** `origin main` への直 push は 0 件である
