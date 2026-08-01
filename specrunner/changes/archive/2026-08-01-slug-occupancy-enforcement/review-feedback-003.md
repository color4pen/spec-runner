# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff stat の確認
`git diff main...HEAD --stat` で 64 ファイル・9080 行の変更を確認した。

### 実装ファイル
- `src/core/occupancy/scan.ts` — 3 箇所スキャン（main checkout / worktrees / managed local）・dedup by jobId・fail-closed 設計を確認
- `src/core/occupancy/guard.ts` — `scanSlugOccupancy` に委譲し unreadable → `SLUG_STATE_UNREADABLE`、non-terminal → `SLUG_OCCUPIED` を確認
- `src/core/occupancy/claim.ts` — check-and-claim ロジック（absent / same jobId / terminal foreign / non-terminal foreign）を確認
- `src/core/occupancy/repair.ts` — ≥2 non-terminal → 拒否、0 → no-op、1 → sidecar re-point を確認
- `src/core/cancel/runner.ts` — liveness sidecar 削除を jobId 一致条件下で実施（通常 cancel でも）、managed state.json を cancelled 状態で上書きしてから marker unlink する順序を確認
- `src/core/resume/resolve-job.ts` — `JobStateStore.list()` ベースの state-based 解決（non-terminal 1 件 → 返す、0 件 → null、≥2 件 → `SLUG_OCCUPANCY_AMBIGUOUS` throw）を確認
- `src/cli/progress.ts` — `onPipelineComplete` が `state.status` で分岐し、`awaiting-archive` → archive ヒント、`awaiting-resume` → resume ヒント、その他 → 無出力を確認
- `src/core/inbox/run-inbox.ts` — `startJob` 実装内の occupancy pre-check と reject comment 投稿・dedup ロジックを確認
- `src/core/doctor/checks/storage/slug-occupancy.ts` — breach（≥2 non-terminal）・mismatch（sidecar と非 terminal の不一致）を区別して報告するロジックを確認
- `src/core/runtime/local.ts` — `assertNoDuplicateLiveJob` を `assertSlugUnoccupied` 委譲に置換・`writeLivenessSidecar` を check-and-claim に更新を確認
- `src/core/runtime/managed.ts` — managed runtime も `assertSlugUnoccupied` に委譲していることを確認（要件 8 充足）
- `src/errors.ts` — `SlugOccupiedError`（構造化 priorJobId / priorStatus フィールド）、3 つの factory、`EXIT_CODE_MAP` への `SLUG_OCCUPIED` / `SLUG_STATE_UNREADABLE` 追加を確認

### 削除されたファイル
- `src/core/runtime/duplicate-slug-guard.ts` — pid ベースの旧実装。削除は guard 移行の完了を示す
- `tests/unit/core/runtime/duplicate-slug-guard.test.ts` — 旧テスト（219 行削除）。`local-duplicate-guard.test.ts` が新実装に対応する形で更新されている（TC-053 UPDATED コメントで R1/R2 帰属を明示）

### テストカバレッジ確認（test-cases.md 54 件対照）
| TC 範囲 | テストファイル | 確認結果 |
|---------|--------------|---------|
| TC-001..007 | scan.test.ts | scan のコア動作・dedup・unreadable を網羅 |
| TC-008..010 | errors.test.ts | 3 error factory の構造・exit code・メッセージを網羅 |
| TC-011..022 | guard.test.ts, local-duplicate-guard.test.ts | guard 拒否条件（awaiting-resume / dead-pid / terminal-only / unreadable）、managed 対称を網羅 |
| TC-023..026 | claim.test.ts | check-and-claim の 4 ケースを網羅 |
| TC-027..032 | sidecar-teardown.test.ts | cancel の sidecar/marker jobId スコープを網羅 |
| TC-033..036 | state-based-resolve.test.ts, resolve-job.test.ts | 状態基準解決・AMBIGUOUS throw・CLI catch を網羅 |
| TC-037..039 | slug-occupancy.test.ts (doctor) | breach/mismatch 検出・clean pass を網羅 |
| TC-040..044 | repair.test.ts, doctor-repair.test.ts | repair の 4 ケース・slug validation を網羅 |
| TC-045..047 | progress-halt-guidance.test.ts | Next 案内の分岐を網羅 |
| TC-048..050 | occupancy-propagation.test.ts | inbox reject comment・dedup を網羅 |
| TC-051 | occupancy-e2e.test.ts | end-to-end halt→拒否→cancel→成功ループを確認 |
| TC-052..054 | local-duplicate-guard.test.ts, (typecheck && test) | 既存テスト旧 fail-open 期待値更新・全スイート green を確認 |

### 受け入れ基準照合
- [x] シナリオ歯（end-to-end）: TC-051 が halt → 拒否（state 作成なし） → cancel（sidecar 削除） → 成功を確認
- [x] guard 単体テスト: TC-011..014 が awaiting-resume / running+dead-pid / terminal-only / unreadable の 4 ケースを固定
- [x] cancel テスト: TC-027..028 が自 jobId 一致 → 削除、他 jobId → 残存を固定
- [x] 解決テスト: TC-033..034 が非 terminal 優先・複数 → SLUG_OCCUPANCY_AMBIGUOUS を固定
- [x] doctor テスト: TC-037..041 が検出・一意修復・非一意拒否を固定
- [x] Next 案内テスト: TC-045..046 が awaiting-resume → resume、awaiting-archive → archive を固定
- [x] 既存テスト: `duplicate-slug-guard.test.ts` の旧期待値は ファイルごと削除（R1/R2 理由をコメントで明示）
- [x] verification-result.md が存在し typecheck && test green を証明

## 検証できなかった項目

### `JobStateStore.list()` のスキャンスコープ
`resolveJobStateBySlug` が使用する `JobStateStore.list()` が worktree パスをスキャンするかどうかを `src/store/` コードを読まずに確認できなかった。TC-034 のテストは `.git/specrunner-worktrees/wt1/...` にジョブ B を書いているが、もし `JobStateStore.list()` が worktree をスキャンしない場合、テストは 1 件しか見つけず throw せずに通過する（つまりテストが壊れる）。verification-result.md が green であることを信頼し、`JobStateStore.list()` が worktree もスキャンすると推測した。

## Findings 詳細

### F-1 [SHOULD]: inbox pre-check が `scanSlugOccupancy` ではなく `JobStateStore.list()` を使用

**場所**: `src/core/inbox/run-inbox.ts` lines 379–395

**内容**: inbox の `startJob` default 実装は `JobStateStore.list()` で non-terminal を探してから `slugOccupiedError` を throw し、その後 `runRunCore` を呼ぶ。コメント「D10: … runRunCore, which swallows all exceptions internally」が示すように、`runRunCore` 内部で start guard が throw しても inbox catch ブロックに伝播しない。

`JobStateStore.list()` のスキャン範囲が `scanSlugOccupancy`（main checkout + worktrees + `.specrunner/local/<slug>/state.json`）より狭い場合、worktree にのみ存在する non-terminal 占有者はinbox pre-check を通過する。この場合 `runRunCore` 内の guard は正しく拒否するが reject comment は posted されない。

**影響**: inbox の idempotent reject comment（TC-048/TC-049 要件）が worktree-only occupant では機能しない可能性がある。

**推奨**: inbox の pre-check を `assertSlugUnoccupied` に統一するか、`runRunCore` が `SLUG_OCCUPIED` を伝播する形にする。後者は`cli/run.ts`の内部アーキテクチャ変更を必要とするため範囲外の可能性があるが、前者（assertSlugUnoccupied 呼び出し）はシンプルに差し替えられる。

### F-2 [SHOULD]: TC-034 の worktree 書き込みと `resolveJobStateBySlug` のスキャン整合性

**場所**: `tests/unit/core/resume/state-based-resolve.test.ts` TC-034

**内容**: TC-034 は 2 つ目の非 terminal ジョブを `.git/specrunner-worktrees/wt1/specrunner/changes/SLUG/state.json` に書く。`resolveJobStateBySlug` は `JobStateStore.list()` を呼ぶが、もし `JobStateStore.list()` が worktree をスキャンしなければ、テストは 1 件の non-terminal しか見つけずに resolve（throw しない）となり、テスト自体が failure になる。

verification が green であることから `JobStateStore.list()` が worktree もスキャンすると推測されるが、確認できなかった。もし `JobStateStore.list()` が worktree を見ないなら、`SLUG_OCCUPANCY_AMBIGUOUS` 分岐は実質的に dead code となり、かつ TC-034 は誤って red になっているはず（= verification が実は red）。

**推奨**: `JobStateStore.list()` のスキャンスコープを明示的にコメントで記述する。あるいは `resolveJobStateBySlug` のコメントで「JobStateStore.list() は worktree をスキャンするためこの分岐に到達できる」と説明を加える。

### F-3 [PASS]: `slugOccupiedError` ヒントの `awaiting-archive` 分岐

`awaiting-archive` 占有者に対して `Run 'specrunner job archive ${slug}' or 'specrunner job cancel ${jobId}'` を案内し、TC-017 の「advises `specrunner job archive S` or `specrunner job cancel`」を満たしている。

### F-4 [PASS]: cancel の jobId スコープが liveness sidecar・managed marker・`--purge` の全経路に適用されている

`runner.ts` の 3 箇所（lines 431, 482, 506）が `sidecar.jobId === state.jobId` / `marker.jobId === state.jobId` を確認してから削除している。`--purge` は foreign non-terminal sidecar が存在する場合ディレクトリ削除をスキップし警告する（TC-031）。

### F-5 [PASS]: managed cancel の managed state.json 上書き順序

`cancelSingleJob` は managed state.json を canceled 状態で上書き**してから** marker を unlink する（lines 453–489）。これにより `scanSlugOccupancy` の location 3 が次回 guard 時に "canceled"（terminal）を見ることができる。順序が逆だと unlink 後 state.json が "running" のままとなり新規 start が blocked される問題を防いでいる。

### F-6 [PASS]: `duplicate-slug-guard.ts` 削除の整合性

旧ファイルと旧テストが削除され、`guard.ts`/`scan.ts` に機能が移行している。`local-duplicate-guard.test.ts` の TC-053 UPDATED コメントが R1/R2 への帰属を明示しており、受け入れ基準「変更理由を要件 1/2 に帰属させる」を満たしている。
