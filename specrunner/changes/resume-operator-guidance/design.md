# Design: resume operator guidance — 採用系 halt の preflight 統合と詳細ヘルプ

## Context

`job resume` は operator の介入結果を取り込むために fail-closed で halt する 2 つの gate を直列に持つ（`src/core/command/resume.ts`）:

- **Gate 1（apply-canon gate, 296-393）**: worktree で dirty な protected canon paths を `detectCanonDirtyPaths` で検出する。`--apply-canon` 指定時は operator-apply commit を作る。未指定時は auto-quarantine 条件（interruption-backed な interrupted-step partial canon）を満たせば退避して通過し、満たさなければ fail-closed halt する（else 枝 379-384 / 385-391）。
- **Gate 2（adopt gate, 398-440）**: publish range にある未知 commit（ledger 外 OID）を `detectUnadoptedCommits` で検出する。`--adopt-commits` 未指定なら `buildAdoptEscalationMessage` で halt する。

Gate 1 が halt すると Gate 2 は評価されない。運用上の案内に 4 つの不揃いがある:

1. dirty canon と未知 commit が併存すると halt → flag 追加 → また halt と最大 3 往復になる。
2. Gate 1 の halt Hint（382 / 389）は flag 名を言うだけで、実 slug 入りのコピペ可能コマンドを出さない。Gate 2 は `egressResolutionOptions(slug)` で完全コマンドを出す。
3. `job resume --help` は `usage` フィールド未配線のため `NO_DETAILED_HELP_USAGE`（"No detailed help available."）を返す（`bin/specrunner.ts:74`）。運用上重要な `--from` / `--prompt` はどのヘルプにも出ない。
4. slug 未解決時は `JobStateStore.resolveId` の "Job not found: no job ID starts with '...'" を素通しし、usage の `<slug>` 語彙と繋がらない（resume.ts 131-143）。

fail-closed の意味論（自動採用しない）は正しい前提とし、案内を完全にして往復を 1 回に減らす。

**制約となる既存 pin テスト（request の許容リスト外）**:

- `tests/unit/cli/help-flag-dispatch.test.ts:139-142`（TC-HELP-DISPATCH-03）が `job resume --help` に "No detailed help available" が**含まれる**ことを pin している。要件 4 はこの挙動を反転させるため、この assertion の更新が不可避。
- `tests/unit/cli/resume.test.ts:357-363`（TC-RESUME-010）が resume 未解決出力に "Job not found" が**含まれる**ことを pin している。
- `src/core/resume/__tests__/adopt-commits.test.ts`（TC-U5）が `buildAdoptEscalationMessage` の出力を pin している。

## Goals / Non-Goals

**Goals**:

- Gate 1 が fail-closed halt する時、halt 前に Gate 2 の検出も走らせ、両検出を 1 つの halt に統合する。
- 統合 halt に、検出内訳・実 slug 入りの完全コマンド 1 行・取り込まない代替案を含め、既存 `egressResolutionOptions` の丁寧さに揃える。
- `job resume --help` に 11 flag・相互排他 2 組・`--from` 有効値を載せた詳細ヘルプを追加する。
- resume 経路の未解決エラーを slug 語彙で報告する（resolveId 本体は不変）。

**Non-Goals**:

- dirty canon / 未知 commit の自動採用（fail-closed のまま）。
- TTY での y/N 対話確認。
- escalation 状態による gate 挙動の分岐。
- auto-quarantine（interrupted-step partial canon）の条件・挙動の変更。
- resume 以外のコマンドのヘルプ整備。

## Decisions

### D1: preflight は halt 境界で遅延実行し、gate 順・採用処理の実体は変えない

Gate 1 の 2 つの fail-closed halt 枝（379-384 / 385-391）に到達した時点でのみ `detectUnadoptedCommits` を追加実行し、両検出結果を統合 halt にまとめて throw する。`--apply-canon` 経路・auto-quarantine 経路・Gate 2（Gate 1 通過後の commits-only halt）は現状のまま。

- **Rationale**: 追加の git 呼び出しは halt する時だけに限定でき、`--apply-canon` 指定時の apply → adopt gate 合成（ledger に apply-canon OID を積んでから adopt を評価する composability）を壊さない。halt するのは検出のみで、commit / ledger 追記の副作用は持たない（`detectUnadoptedCommits` は `git rev-list` / `show` / `diff-tree` の read-only）。
- **Alternatives considered**: 両検出を gate 前に常時実行して gate を単一化する案 — 却下。diff が大きく、`--apply-canon` 時の ledger 合成順や auto-quarantine 判定経路に副作用リスクが出る。architect 判断「preflight は検出の統合のみ」に反する。

### D2: 統合 halt builder は「canon-only」「canon+commits」を担当し、Gate 2 の「commits-only」は既存 `buildAdoptEscalationMessage` を不変で使い続ける

新しい builder（`src/core/resume/adopt-commits.ts` に追加する `buildAdoptionHaltMessage`）は `slug` / `dirtyCanonPaths` / `unadoptedCommits` / 検出失敗フラグを受け取り、統合 halt 文字列を返す。Gate 2 の commits-only 経路と、その pinned 単体テスト（TC-U5）は無改変で維持する。

- **Rationale**: `buildAdoptEscalationMessage` は既に slug 入りの完全 `--adopt-commits` コマンドを丁寧に提示しており、受け入れ基準「未知 commit のみ → `--adopt-commits` のみ」は Gate 2 を通る経路で無改変に満たされる。その出力を pin する `adopt-commits.test.ts`（TC-U5）は request の許容リスト外のため、触らないのが最小リスク。新 builder は同 module の `egressResolutionOptions` と同じ語り口を踏襲して形式を揃える。
- **Alternatives considered**: 3 組合せを 1 builder に統合し `buildAdoptEscalationMessage` を廃止する案 — 却下。許容リスト外の pinned 単体テストの改変を強いる。

### D3: 完全コマンドの flag は検出結果から導出し、検出失敗時は fail-closed を維持する

統合 halt の完全コマンドは `specrunner job resume <slug>` に、dirty canon があれば `--apply-canon`、未知 commit があれば `--adopt-commits` を付す。preflight の adopt 検出が git exit 128 の場合は非 git 環境として空扱い（既存 carve-out と同じ）。exit 128 以外で失敗した場合は「未知 commit の検出に失敗した」旨を halt に併記し、`--adopt-commits` は勧めず（未検証のため）dirty canon の `--apply-canon` 案内のみで halt する。いずれも throw し pipeline は起動しない。

- **Rationale**: 検出できていない採用を勧めない方が安全側。dirty canon 解消後の再 resume で Gate 2 が publish range を再チェックするため、未検証 commit も取りこぼさない。
- **Alternatives considered**: 検出失敗を握り潰して `--adopt-commits` も併記する案 — 却下。fail-closed 原則に反する（未検証の採用誘導）。

### D4: `JOB_RESUME_USAGE` 定数を追加し、resume エントリに `usage` として配線する

`src/cli/command-registry.ts` に `JOB_RESUME_USAGE` を定義し、resume サブコマンドエントリに `usage: JOB_RESUME_USAGE` を追加する（`job ls` / `reopen` / `archive` と同じ `usage` フィールド機構。`bin/specrunner.ts:73-74` の `emitHelp(subDef.usage)` がそのまま拾う）。内容は `<slug>` 引数（slug 解決 → 失敗時 Job ID prefix fallback）、11 flag すべて、相互排他 2 組（`--detach`/`--json`、`--prompt`/`--prompt-file`）、`--from` の有効値（`AGENT_STEP_NAMES` + `CLI_STEP_NAMES`、複合 step = `custom-reviewers` fan-out / `regression-gate` は `--from` 対象外である注記付き）。

- **Rationale**: dispatch 機構は既存で、定数追加 + フィールド配線の最小変更で済む。複合 step は flag-parser の `values` 検証（command-registry.ts:634）に載らず `--from` では選べないため、注記で誤用を防ぐ。
- **Alternatives considered**: dispatch 側でヘルプを動的生成する案 — 却下。他コマンドと不整合な独自機構になる。

### D5: 未解決エラーの slug 文言は resume 側で additive に包み、resolveId は不変

resume.ts の resolveId fallback catch（135-142）で `logError(err.message)` を、slug と Job ID prefix の両方で探した事実が分かる文言に差し替える。文言は "Job not found" を保持したまま "no active job with slug or job ID prefix '<slug>'" を含める（例: `Job not found: no active job with slug or job ID prefix '<slug>'`）。`JobStateStore.resolveId`（job-catalog.ts:288）自体は job show / cancel と共用のため無改変。

- **Rationale**: TC-RESUME-010（許容リスト外）が "Job not found" 含有を pin するため、additive にすれば新旧両基準を同時に満たす。resolveId を触らないので `tests/resolve-job-id.test.ts` は無改変で green。
- **Alternatives considered**: resolveId のメッセージ自体を slug 化 — 却下。共用のため他コマンドに波及し、request の明示制約に反する。

## Risks / Trade-offs

- [Risk] 要件 4 は `job resume --help` を "No detailed help available" から詳細ヘルプへ反転させるが、その旧挙動を pin する `help-flag-dispatch.test.ts:139-142`（TC-HELP-DISPATCH-03）は request の許容リスト（halt メッセージ / halt 回数の pin テストに限定）に含まれない。→ **Mitigation**: 要件 4 の受け入れ基準（"NO_DETAILED_HELP_USAGE ではなく..."）が挙動変更を必須としており、旧挙動 assertion の更新は不可避。カテゴリが異なる（help dispatch であって halt メッセージではない）ため許容リストの射程外だが、要件 4 が上位で mandate する。exit 0 と runResume 非呼び出しの assertion は保持し、"No detailed help available" を pin する 1 件のみを新挙動へ更新する。T-05 に明示。
- [Risk] `buildAdoptEscalationMessage`（TC-U5, 許容リスト外）を壊すと green を失う。→ **Mitigation**: D2 で無改変維持。新 builder は別関数。
- [Risk] resume 未解決文言の変更が TC-RESUME-010（許容リスト外）を壊す。→ **Mitigation**: D5 の additive 文言で "Job not found" を保持。
- [Risk] preflight で git 呼び出しが増える。→ halt する場合のみ 1 回追加で、正常経路のコストは不変。
- [Trade-off] commits-only（Gate 2）は旧 builder、canon 系（Gate 1）は新 builder と、内部的に 2 経路が残る。形式は `egressResolutionOptions` の語り口で揃えるため operator 体験は一貫するが、コード上は完全な単一化ではない。単一化には許容リスト外テストの改変が要るため見送る。

## Open Questions

- 未解決の terminal-only slug 経路（resume.ts 122-128）は既に別文言（"has status '...', cannot transition to 'running'"）を出す。本変更のスコープ外とし、D5 は resolveId fallback 経路（真の not-found）のみを対象とする。symmetry を求めて terminal 経路の文言も揃えるかは将来課題。
