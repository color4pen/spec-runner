# bite executor — 隔離 worktree で materialize 済み test を repo の runner で実行可能にする（Phase 2）

## Meta

- **type**: spec-change
- **slug**: bite-test-executor
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260716 D3 / ADR-20260717（gate が記録 OID で test を機械実行して provenance を生成）で ratify 済み。本 request はその実行 primitive `runTestsAtCommit` を、custom `verification.commands` を持つ repo（＝この repo 自身）で実際に materialize 済み test を走らせられるようにする。per-scenario（単一 test-case）実行と dogfood config への有効化は本 request の射程外（下記スコープ外）。新規 architecture ADR を要さない。 -->

## 背景

ADR-20260717 の floor は「達成 provenance」を評価するが、達成を生む唯一の機構 `RuntimeStrategy.runTestsAtCommit`（隔離 worktree で materialize 済み test を base/HEAD OID で実行）が、**この repo では一度も実 test を走らせられない**。二つの独立した欠落がある:

1. **custom commands で bail**: `LocalRuntime.runTestsAtCommit`（`src/core/runtime/local.ts:934-943`）は `config.verification.commands` が非空だと `{kind:"unavailable", reason:"Cannot scope custom verification.commands to individual test files"}` を返す。この repo の `.specrunner/config.json` は custom commands（build/typecheck/test/lint、`test`=`bun run test`=`vitest run`）を持つため、常にこの branch に落ちる。
2. **隔離 worktree に依存解決が無い**: bail しない default 経路も、隔離 worktree を `os.tmpdir()` 配下に `git worktree add --detach` で作り（`local.ts:913-922`）、**node_modules を symlink も install もしない**。node_modules は gitignore され、worktree は repo tree の外なので upward 解決も届かない。既存 test（`bite-evidence-isolated-exec.test.ts`）は `bun:test` builtin のみの fixture（依存ゼロ）なのでこの欠落を露呈しない。実際の vitest ＋依存を持つ test は、この隔離 worktree では走らない。

結果、この repo では forward job でも biteEvidence が生成されず（in-loop gate は deferred）、floor は fail-closed に倒れるだけで、歯が「緑で噛む」ことがない。本 request はこの両方を閉じ、materialize 済み test を repo の runner で隔離実行できるようにする。

## 現状コードの前提（調査済み・実装はこの前提に沿うこと）

- **`runTestsAtCommit`**（`src/core/runtime/local.ts:901-982`）: `git worktree add --detach <tmpBase> <oid>`（tmpBase=`os.tmpdir()` 配下）→ custom commands なら unavailable → さもなくば per-file `bun test <file>`（cwd=tmpBase）→ per-file `{file, passed}` → `git worktree remove --force`。`config` は既に引数に渡っている。返り値 `IsolatedTestResult`（`{kind:"ran", results:[{file,passed}]}` | `{kind:"unavailable",reason}`、`src/core/port/runtime-strategy.ts:86-88`）。
- **依存の確立点**: 通常の job worktree は `WorktreeManager.create`（`src/core/worktree/manager.ts:156-178`）が生成時に一度だけ install（`detect-install`＝`npm ci`/`<pm> install --frozen-lockfile`、または `workspace.setup` commands）する。隔離 worktree にはこの install が無い。
- **既存の PATH/node_modules 解決の前例**: 通常 verification は `spawnCommand`（`src/core/verification/commands.ts:56-99`）が `sh -c <command>` を job worktree cwd で走らせ、**`<cwd>/node_modules/.bin`（および hoist root）を PATH 先頭に付ける**。`bun run test`→`vitest` はこの .bin から解決される。
- **spike で実証済み（本 request の設計前提）**: detached worktree ＋ `<repo>/node_modules` を worktree/node_modules に symlink ＋ `bun run test <file>` を worktree cwd で実行 → `vitest run <file>` が走り test file 単位で pass/fail（exit code）が取れることを確認済み。
- **config surface**: `VerificationConfig`（`src/config/schema/types.ts:142-158`）は `commands`（`ShellCommand[]`）と `coverage` のみ。**file-scopable な test 実行を表す field は存在しない**（validation `src/config/schema/validation.ts:264-298`、未知 top-level field は strip）。`ShellCommand`=`string | {name?, run}`（types.ts:91）。
- **call sites（unavailable→fail-closed）**: in-loop gate `src/core/step/bite-evidence/gate.ts:161-163`、archive floor `src/core/archive/achieved-assurance.ts:218-220`。managed runtime は常に unavailable（`src/core/runtime/managed.ts`）。
- **backward-compat の凍結 test**: `bite-evidence-isolated-exec.test.ts:103-105`（custom commands→unavailable）。この期待は「scopedTestCommand 未設定なら unavailable」へ更新する（opt-in を保つ）。
- **per-scenario の障壁**: test-materialize prompt（`src/prompts/test-materialize-system.ts:56-78`）は TC-ID を **title でなくコメントでも可**とし、test-coverage（`src/core/verification/test-coverage.ts:204-215`）は file 全体を grep する。ゆえに `vitest -t "TC-001"` は title に ID の無い test を取りこぼす。per-scenario は命名規律の変更を要し、本 request の射程外。

## 要件

1. **隔離 worktree の依存解決**: `runTestsAtCommit` が test を走らせる前に、隔離 worktree で依存が解決されるようにする。**job worktree（`cwd`）の `node_modules` を隔離 worktree に symlink する**（spike で実証した方式）。`cwd` に node_modules が無い場合は `unavailable`（fail-closed）。base OID の source ＋ candidate（symlink 元）の node_modules で走る点は意図的（base の実装欠落で test が red になるのが目的。依存は request を跨いでほぼ不変、除去された依存は base test が resolve 失敗＝red で安全側）。

2. **file-scopable な test command の opt-in config**: `VerificationConfig` に file-scopable な test 実行 command を宣言する field を足す（例 `scopedTestCommand?: string`、provider 非依存名）。意味は「1つ以上の test file path を引数末尾に付けて実行でき、その file のみを走らせる command」。この repo では `"bun run test"`。validation を対応させる。

3. **custom commands 下での per-file 実行**: `scopedTestCommand` が設定されている場合、`runTestsAtCommit` は custom commands で bail せず、**per-file に `<scopedTestCommand> <file>` を隔離 worktree で実行**する（通常 verification と同じ `node_modules/.bin` を PATH に載せる実行手段を再利用）。per-file の `{file, passed}`（exit 0=passed）を維持する（hollow 検出が per-file 粒度に依存）。`scopedTestCommand` 未設定 かつ custom commands 有り → 従来どおり `unavailable`（backward-compat・fail-closed 保持）。

4. **クリーンアップと never-throw を維持**: 隔離 worktree（と symlink）は finally で必ず除去。spawn エラー・worktree add 失敗・OID 不正は `unavailable`。既存の never-throw 契約を保つ。

5. **実 runtime 統合テスト（指摘対応）**: 実 `LocalRuntime` を、custom `verification.commands` ＋ `scopedTestCommand` を持つ config と、**依存を要する（または repo の runner で走る）実 test file を持つ実 git repo**に対して走らせ、`runTestsAtCommit` が `{kind:"ran"}` と正しい per-file pass/fail を返すことを固定する。fake でなく実配線で「executor が実 test を走らせる」ことを証明する。

## スコープ外（理由付きで明示）

- **per-scenario（単一 test-case）実行**: `vitest run <file> -t "<TC-ID>"` による case 単位実行は、test-materialize が TC-ID を **`it(...)`/`describe(...)` の title に必ず埋める**よう命名規律を変える必要がある（現状はコメントでも可、test-coverage も title を要求しない）。それ＋`-t` 引数を運ぶ template が要る。別 request。**既知の残余**: 実 test と空洞 test が同一 file に同居する場合、file 粒度では隔離できない（Phase 2 は file 粒度、per-scenario で閉じる）。
- **dogfood の `.specrunner/config.json` への有効化**（`scopedTestCommand` 追加・`minimumAssurance` 設定）: 全 forward job に bite 実行コストを課す運用判断＋guard-config 面への変更＝別途の意図的な config PR。本 request は capability ＋実証まで。歯が実 dogfood で緑に噛むのは config 有効化時。
- **隔離 worktree で install する方式**: symlink を採用（安価）。full install は base/candidate で 2 回走り高コストのため却下。
- **R5** provenance/offline verify、**R6** fast。

## 受け入れ基準（歯を名指しする）

- [ ] **T1（実 runtime 統合・指摘対応）**: 実 `LocalRuntime` ＋ custom `verification.commands` ＋ `scopedTestCommand` の config で、実 git repo の実 test file に対し `runTestsAtCommit` が `{kind:"ran"}` と正しい per-file pass/fail を返すことをテストで固定する（fake でない）。
- [ ] **T2（依存解決）**: 隔離 worktree で、依存を要する（repo の runner で走る）test が正しく実行される。**破壊確認**: node_modules の供給（symlink）を外すと T1/T2 が `ran` でなくなる／落ちること。
- [ ] **T3（scopable command の opt-in）**: `scopedTestCommand` 未設定 かつ custom commands 有り → `unavailable`（`bite-evidence-isolated-exec.test.ts:103-105` を opt-in 前提へ更新）。設定有り → `ran`。
- [ ] **T4（per-file 粒度）**: per-file の pass/fail が維持され、materialize 済み test 群の一部だけ pass する場合に per-file で識別できることを固定する（hollow 検出が成立）。
- [ ] **T5（歯が end-to-end で噛む）**: `scopedTestCommand` 設定下で、materialize 済み test が base OID で red・candidate OID で green のとき、in-loop gate が biteEvidence を生成し／archive floor derivation が `biteEvidence` を達成とすることを固定する（fake でなく実行結果で）。
- [ ] **T6（backward-compat）**: default 経路（custom commands 無し）・managed（unavailable）・既存 bite-evidence / floor / achieved-assurance テストが無変更で green（T3 の期待更新を除く）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **隔離 worktree の依存は job worktree の node_modules を symlink**（spike 実証）。→ 却下: base/candidate で full install（2 回・高コスト）。→ 却下: worktree を job worktree 配下に nest（git worktree の入れ子は不整合源）。
- **scopable command は opt-in config field で宣言**。→ 却下: runner 自動判定（脆い）。→ 却下: 既存 `test` command を無条件に file-scopable と仮定（`make test` 等 scope 不能な command が存在）。
- **per-file ループで実行**。→ 却下: 全 file を単一 invocation ＋ JSON reporter（runner 依存、かつ単一 exit code では per-file の hollow 判定が失われる）。
- **base OID の source を candidate の node_modules で走らせる**。→ 却下: base OID で依存を install（高コスト。candidate 依存は安全な superset）。
- **本 request は file 粒度の executor まで、per-scenario は別 request**。→ 却下: 命名規律変更（title 強制）を前倒し（別 authority・test-materialize/verification に波及）。
