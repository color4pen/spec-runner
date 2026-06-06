# Design: job state を event journal / projection / liveness に分離し slug ディレクトリで branch 同伴管理する

## Context

job state は `.specrunner/jobs/<jobId>.json`（git 追跡外）に単一 JSON で置かれ、`JobStateStore` が更新のたびに `atomicWriteJson` で全体を read-modify-write する。この 1 ファイルに性質の異なる 3 種が同居している。

- **append で失えない event** — `steps: Record<string, StepRun[]>` の各 attempt（`outcome.verdict` / `outcome.toolResult` / 時刻 / `findingsPath` / `error` / `followUpAttempts`）、`history`（transition）、cost（`StepRun.modelUsage`）。
- **再計算できる projection** — `step` / `status` / `resumePoint`。`resolveResumeStep`（`src/core/resume/resolve-step.ts`）は実際に `steps[].outcome` を畳んで再開位置を再推論しており、現在位置は journal の射影である。
- **別マシンで無効な machine-local 値** — `worktreePath`（絶対パス）/ `pid` / `session`。

この同居が 2 つの問題を生む。

1. state が git 追跡外のため、CI のように作業ディスクが使い捨てられる環境では再開できない。
2. event を「毎回まるごと rewrite する 1 ファイル」に載せているため、書き込み中の crash が event ごと壊しうる。

加えて、作業単位の識別（slug）と実行の識別（jobId）が別キーで管理され、`JobStateStore.list()` が `.specrunner/jobs/*.json` を単一スキャンする唯一の列挙経路を、`job ls`（`src/cli/ps.ts`）と resume（`src/core/resume/resolve-job.ts`）の双方が通っている。

### 触れる主な seam

- `src/store/job-state-store.ts` — `JobStateStore`（永続化の唯一の権威）。
- `src/state/schema.ts` — `JobState` / `StepRun` / `StepOutcome` / `validateJobState` / `normalizeSteps` / `appendHistoryEntry` / `MAX_HISTORY_SIZE`。
- `src/state/helpers.ts` — `pushStepResult`（pure step-append）/ `getLatestStepResult`。
- `src/state/lifecycle.ts` — `transitionJob`（pure status transition + history append）。
- `src/state/job-slug.ts` — `getJobSlug`。
- `src/util/xdg.ts` — `getJobsDir` / `getJobStatePath`。`src/util/paths.ts` — `changeFolderPath` / `usageJsonPath`。`src/util/atomic-write.ts`。
- `src/core/step/executor.ts`（`finalizeStep` / `runAgentStep`）/ `executor-helpers.ts`（`recordFailedStepResult`）/ `commit-push.ts`。
- `src/core/usage/store.ts`（`deriveFromJobState` / `appendInvocation`）/ `src/core/finish/derive-usage.ts` / `job-state-update.ts` / `resolve-target.ts`。
- `src/core/resume/{resolve-job,resolve-step,resolve-request-path}.ts` / `src/core/command/{resume,pipeline-run}.ts`。
- `src/core/runtime/{local,managed}.ts` / `src/core/worktree/{manager,detection}.ts` / `src/core/lifecycle/exit-guard.ts` / `src/core/cancel/runner.ts` / `src/core/archive/orchestrator.ts`。
- `src/cli/{ps,job-show,cancel,archive,run}.ts` / `src/core/doctor/checks/storage/{jobs-writable,old-state-files}.ts`。

## Goals / Non-Goals

**Goals**:

- state を性質で 3 つに分離する: append-only な event journal（truth）、overwrite な projection（cache）、再生成可能な liveness（machine-local）。
- journal を branch 同伴（`changes/<slug>/`）にし、同一 branch を再 checkout した状態から resume を成立させる。
- 配置キーを jobId から slug（= ディレクトリ名）へ移し、location を identity にすることで導出可能なフィールドを state から除く。
- event 追記と cursor rewrite を物理的に別ファイル操作へ分離し、書き込み中 crash で既存 event を失わない。
- 2 段で提供する: 段1 = 同居 JSON のファイル分割（in-place・挙動不変）、段2 = slug ディレクトリ移行・branch 同伴・痩せ・列挙元の組み替え・`.specrunner/jobs/` の dual-read 移行。

**Non-Goals**:

- CI / GitHub Actions 側のワークフロー定義（再 checkout → resume を行う Actions の実装）。本変更は「branch 同伴で resume 可能な state」を用意するところまで。
- `resolveResumeStep` の再開位置決定ロジックの簡素化。storage の分離・移設であり routing の意味論は変えない。fold 結果は従来同値であること。
- worktree の resume 時クリーン化。
- 作業単位・実行・lifecycle 段の呼称統一（change / request / run の語彙整理）。

## Decisions

### D1: state を 3 ストアに分離する

| 種別 | 中身 | 置き場（段2） | 書き方 |
|------|------|--------------|--------|
| event journal（truth） | step attempt record（`outcome` / 時刻 / `sessionId`）、transition record（旧 `history`）、interruption record | `changes/<slug>/events.jsonl` | append-only |
| cost ledger（truth） | command/step ごとの token usage | `changes/<slug>/usage.json` | JSON 配列への atomic overwrite（read-modify-write）|
| projection（cache） | descriptor（`jobId` / `request{title,type}` / `repository` / `branch` / `pipelineId` / `version` / `createdAt`）＋ cursor（`step` / `status` / `resumePoint` / `updatedAt`）＋ `pullRequest` | `changes/<slug>/state.json` | overwrite |
| liveness（再生成） | `pid` / `session` / `worktreePath` / managed enumeration marker / per-attempt sessionId / session log | `.specrunner/local/<slug>/` | overwrite |

projection は event journal を畳めば再生成できる cache であり truth ではない。liveness は別マシンで無効なため branch 同伴 state に乗せず、resume 時に再生成する。`.specrunner/local/` は **metadata のみ**を持ち、truth（`events.jsonl`）は持たない。

**Rationale**: 3 種は寿命・正しさの根拠・有効範囲（マシン）が異なる。同一ファイルに載せると、append が rewrite に巻き込まれて壊れ（問題2）、machine-local 値が他マシンで無効化し（問題1）、再計算可能な cache が truth と混同される。配置を性質で割れば、各ファイルの書き方（append / overwrite / 再生成）が一意に決まる。

**Alternatives considered**:
- *単一 JSON のまま git 追跡に入れる*: 問題1 は解くが、毎回 rewrite の crash 脆弱性（問題2）と machine-local 値の混入が残る。却下。
- *SQLite 等の埋め込み DB*: トランザクション境界は得られるが、git diff/commit に乗らず branch 同伴・CI 再 checkout の要件（R6）を満たせない。append-only テキストの方が VCS 親和性が高い。却下。

### D2: event journal のレコードスキーマと fold アルゴリズム

`events.jsonl` は 1 行 1 JSON オブジェクトの tagged union とする。

- step-attempt record: 種別タグ + `step` 名 + `StepRun` 等価フィールド（`outcome`{`verdict`/`findingsPath`/`error`/`toolResult?`/`followUpAttempts?`}・`sessionId`・`startedAt`・`endedAt`）。段1 では `modelUsage` を含めたまま（既存挙動保存）。
- transition record: `HistoryEntry` 等価（`ts`/`step`/`status`/`message`）。
- interruption record（段2・要件12）: 中断事由 1 件（`reason` / `errorCode` / `exhaustionPhase`）。

**fold**:
1. ファイルを行単位で読み、**不完全な末尾行（partial write）を 1 行無視**し、それ以前の行をすべて parse する。
2. step-attempt record を出現順に `step` でグルーピングし、グループ内 index+1 を `attempt` に割り当て `steps: Record<string, StepRun[]>` を構成する。
3. transition record を出現順に集めて `history: HistoryEntry[]` とする。
4.（段2）末尾の interruption record から `resumePoint` / `error` cache を materialize する。

`attempt` を出現順で導出することで、現行の `pushStepResult`（`attempt = existing.length + 1`）と同値になり、`resolveResumeStep` Tier 2a が読む「fixer の attempt 数」「loop step 最終 attempt の `outcome.verdict`」、transition の `when` 節が読む `outcome.toolResult`（`fixableCount`）が fold 結果で従来同値に保たれる。

**Rationale**: JSON Lines は 1 行が 1 event に対応するため、追記が他行に影響せず、torn write は末尾 1 行に限局する。fold が末尾 partial を捨てれば「書き込み中 crash で既存 event を失わない」が成立する。`attempt` を保存値ではなく順序から導出することで、レコードの最小化と現行セマンティクスの同値を両立する。

**Alternatives considered**:
- *イベントに連番 `seq` を埋めて整合チェックする*: 単一 writer 前提では順序で十分。連番は再 run / 移行時の振り直しコストを生む。却下。
- *step ごとに別ファイル*: ディレクトリが膨らみ、列挙と fold が複雑化。1 本の jsonl で順序が自明な方が単純。却下。

### D3: 書き込み経路 — journal append と cursor overwrite の物理分離

- `events.jsonl` は **`fs.appendFile` のみ**で書く（決して rewrite しない）。
- `state.json` は **`atomicWriteJson`（tmp + rename）のみ**で全体 overwrite する。
- 2 ファイルは別の I/O 操作で書かれるため、片方の書き込み中 crash が他方を壊さない（crash 分離）。

`JobStateStore` の外部契約（`create` / `load` / `persist` / `update` / `appendStepRun` / `appendHistory` / `list` / `resolveId` の戻り値・解決セマンティクス）は保つ。内部実装を次の責務に割り直す。

- `load()`: `state.json`（cursor/descriptor/pullRequest）を読み、`events.jsonl` を fold して `steps` / `history` を合成し、従来の `NormalizedJobState` 等価を返す。fold の実行行数と `state.json` の件数カウンタを比較し、カウンタが実行行数より小さい場合（append 成功後 cursor 更新前のクラッシュ）は fold 行数でカウンタをリセット（冪等リカバリ）してから以降の delta を計算する。
- `appendStepRun(state, step, run)`: step-attempt record を 1 行 append し、cursor（`step`）を更新して返す。
- `appendHistory(state, entry)`: transition record を 1 行 append して返す。
- `persist(state)` / `update(state, patch)`: 受け取った state の `history` / `steps` のうち **journal 未記録分（delta）のみ** を append し、続けて `state.json`（cursor/descriptor/pullRequest）を overwrite する。delta は `state.json` に保持する journal 件数カウンタで O(1) に判定する。

**Rationale**: 現行の主要 writer は `transitionJob(...) + persist(...)`（status 遷移 + history 追記）と `pushStepResult(...) + persist(...)`（step 追記、`executor.finalizeStep` / `recordFailedStepResult`）である。これらは full state を `persist` に渡す。`persist` を「delta append + cursor overwrite」にすると、**呼び出し側を一切書き換えずに** journal 追記が成立し、段1 の「観測可能な挙動が不変」を最小リスクで満たせる。`appendStepRun` / `appendHistory` は単一レコードを即時 append する ergonomic API として契約どおり残す。

**Alternatives considered**:
- *append を `appendStepRun` / `appendHistory` のみに限定し、`persist` は journal に触れない*: 意味論は最も清潔だが、`transitionJob` が history を in-memory 追記する pure 関数であるため、全 transition 呼び出し点（`fail` / signal handler / resume / cancel / archive / exit-guard / timeout）を「append 経由」に書き換える必要があり、段1 の挙動不変ステージで回帰面積が大きい。delta-append を `persist` に内包する方が安全。本線として却下（将来の清掃余地として Open Questions に残す）。

### D4: history の永続truncation を撤廃し、cap は表示層へ移す

現行 `appendHistoryEntry` は `MAX_HISTORY_SIZE`（100）で古い entry を切り捨てる。journal を append-only にするため、**永続層では truncation しない**（journal は完全な経過トレース）。`job show` 等の表示層が必要なら直近 N 件に cap する。

**Rationale**: 要件13「history は CI 再 checkout 後に唯一残る経過トレース」を満たすには完全性が要る。旧 cap は「単一 JSON を毎回 rewrite するので無制限成長がファイルを肥大化させる」事情によるが、append-only journal ではその懸念が消える。また D3 の delta 判定（件数カウンタ）が truncation で破綻しないためにも、永続層で配列長 = journal 行数を保つ必要がある。表示 cap は観測可能出力の parity を保つために残す。

**Alternatives considered**:
- *journal でも cap する*: 古い transition を捨てると CI トレースが欠落し、delta カウンタ整合も崩れる。却下。

### D5: 配置キーを slug にし、location を identity にする（段2）

1 branch = 1 slug = 1 `changes/<slug>/`。state は branch 上の `changes/<slug>/` に置く。`jobId` は attempt の識別・cost 相関として残り、branch 名 `<prefix><slug>-<jobId8>`・worktree 名 `<slug>-<jobId8>`（`buildWorktreePath`）に既に含まれる（**1 run = 1 branch**）。

location が identity になることで導出可能になったフィールドを state から除く。

- `request.slug` — ディレクトリ名から自明。
- `request.path` — `changes/<slug>/request.md` 規約から自明。
- `StepOutcome.fileContent` — 実ファイル（結果ファイル）が真実。
- `StepRun.modelUsage` — 唯一の消費者（finish 一括派生）の廃止に伴い除去（D6）。

**Rationale**: slug = 作業単位、jobId = 実行。state を「作業単位のフォルダ」に置けば、再 run（新 jobId / 新 branch）が旧 attempt の push 済み branch に触れずに併存でき、CI が branch を checkout するだけで state が手に入る。冗長フィールドは location・規約・実ファイルから再導出できるため、痩せた state は truth の重複を持たない。

**Alternatives considered**:
- *jobId キーのまま branch 同伴*: 同一 slug の複数 attempt が同じ jobId 空間で衝突せず併存できるが、CI が「どの jobId を読むか」を別途知る必要がある。slug=ディレクトリなら checkout した branch の中身が一意。却下。

### D6: cost を step 完了ごとに usage.json へ append し、finish 一括派生を廃止する（段2）

cost を step 完了ごとに `changes/<slug>/usage.json` へ append し step commit に同梱する（`appendInvocation` は `atomicWriteJson`（read-modify-write）で JSON 配列全体を overwrite する実装であり、file-level の `fs.appendFile` ではない）。finish の `deriveFromJobState` / `deriveAndWriteUsage` と、それが依存する `.specrunner/jobs/` 読みを廃止する。これにより `StepRun.modelUsage` の唯一の消費者が消え、`modelUsage` を state から除ける。`usage` show / summary は既に `changes/<slug>/` と archive の `usage.json` を読むため挙動不変。

**Rationale**: cost を step commit に同梱すれば、CI 再 checkout 後も cost が branch に乗って追える。finish 時点でしか派生できない構造（`.specrunner/jobs/` 依存）は branch 同伴 state と両立しない。

### D7: 列挙元を「worktree 不変量 + dual-read」へ組み替える（段2）

**worktree がある ⟺ job が非終端（active）** という不変量を用いる。

- **local active**: `.git/specrunner-worktrees/*`（dir 名が `<slug>-<jobId8>`）を列挙し、各 worktree の `changes/<slug>/state.json` から step/status を読む。
- **managed active**: ローカル worktree を持たないため、`.specrunner/local/<slug>/` の metadata marker で列挙する。marker のスキーマは次のとおり:
  - **ファイル名**: `.specrunner/local/<slug>/marker.json`
  - **フィールド**: `slug`（string）/ `jobId`（string）/ `status`（string）/ `createdAt`（ISO 8601）— index 情報のみ。truth（`events.jsonl`）は持たない。
  - **write タイミング**: managed job 開始時（`ManagedRuntime` がジョブを起動した時点）。
  - **clear タイミング**: finish / cancel 完了時、または resume 後に新 marker で上書きする。
- **archived**: main checkout の `changes/archive/*/`。
- **legacy**: `.specrunner/jobs/*.json`（旧 full state の dual-read）。

`job ls` 既定は active のみ、archive は on-demand（`--all`）。jobId 入力（`job show <jobId>` / `job cancel <jobId>`）は slug-dir 横断 scan による二次解決とし、slug 入力を一級にする。

**Rationale**: 現行の唯一の列挙（`JobStateStore.list()`）は単一ディレクトリ前提で、branch 同伴 state とは相容れない。「worktree = active」という観測可能な不変量を列挙の根拠に据えると、local の active は git の worktree 一覧から確実に得られ、終了時に worktree が消えれば自動的に列挙から外れる。managed は worktree を持たないので marker で補い、過去分は archive / legacy を dual-read で吸収する。

**Alternatives considered**:
- *中央 index ファイルを `.specrunner/` に持つ*: 単一スキャンに戻るが、CI 再 checkout で失われ、worktree 実体と乖離して stale になりうる。worktree 実体を真とする方が壊れにくい。却下。

### D8: machine-local の sidecar 分離と worktreePath の再導出（段2）

`pid` / `session` / `worktreePath` を `.specrunner/local/<slug>/`（gitignore）へ分離し、resume 時に再生成する。worktreePath を読む 3 経路（archive / cancel / resume の request-path 解決）は、sidecar 参照、もしくは slug＋machine 規約（`buildWorktreePath(repoRoot, slug, jobId)`）からの再導出で worktreePath を得る。exit-guard（`beforeExit`）は自 worktree の branch state（`state.json` cursor ＋ `events.jsonl`）に `awaiting-resume` を記録し、ハード crash で status が stale な場合に備え pid 突き合わせで liveness を判定する。

**sidecar ファイルレイアウト** (`.specrunner/local/<slug>/`):

| ファイル名 | フォーマット | フィールド | 備考 |
|-----------|------------|-----------|------|
| `liveness.json` | JSON | `pid`（number）/ `session`（string）/ `worktreePath`（string）/ `jobId`（string） | 実行中 1 件。resume 時に再生成。 |
| `session-<attempt>.log` | テキスト | — | attempt 番号ごとの agent session ログ。attempt は 1-origin。 |
| `session-<attempt>.sessionId` | テキスト 1 行 | sessionId 文字列 | per-attempt の sessionId。fold での `sessionId` 解決に使用。 |
| `marker.json` | JSON | D7 参照 | managed runtime のみ。local runtime は不要。 |

**Rationale**: 絶対パス・pid・session は別マシンで無効なので branch に乗せてはならない。worktreePath は `slug + jobId` から決定的に再構成できるため、sidecar 喪失時も規約から復元できる。

### D9: 後方互換・非破壊移行（段2）

旧 `.specrunner/jobs/<jobId>.json`（full state）を読んで新形式（journal + cursor）へ移行して resume できる。移行後も旧ファイルは削除せず残す（非破壊）。新規書き込みは新形式のみ。列挙は legacy を dual-read で含める（D7）。

**Rationale**: 進行中の旧 job を壊さず移行するため。旧ファイルを残すことで、移行が誤っても元データから再試行できる。

## Risks / Trade-offs

- [Risk] `persist` の delta-append が二重記録 / 取りこぼしを起こす（D3）→ **Mitigation**: `state.json` に journal 件数カウンタを持ち単一 writer 前提で append 差分を確定する。D4 で永続 truncation を撤廃し「配列長 = journal 行数」を保証する。**クラッシュリカバリは `load()` 時の冪等リカバリで担保する**（D3 `load()` 参照）: append 成功後 cursor 更新前にクラッシュした場合、次回 `load()` で fold 行数がカウンタを上回り、カウンタを fold 行数にリセットしてから delta を計算するため二重 append が生じない。段1 で crash-safety 回帰テスト（追記が cursor rewrite と分離されている／既存 event が残る）と fold 同値テストを必須化する。
- [Risk] fold 結果が `resolveResumeStep` / transition `when` の読む値と非同値になり、再開 routing が無音で壊れる → **Mitigation**: `outcome.verdict`（Tier 2a）・`outcome.toolResult`（`fixableCount` routing）・fixer attempt 数を対象にした golden テストを追加し、code-review approved + fixableCount>0 の routing と fixer-empty 検出の再開を従来同値で検証する。
- [Risk] 列挙元の組み替え（D7）で active / archived / legacy のどれかが欠落し `job ls` から消える → **Mitigation**: 4 ソース（local worktree / managed marker / archive / legacy）の合成を 1 モジュールに集約し、各ソース単体と合成の両方をテストする。
- [Risk] worktreePath を sidecar 喪失時に再導出できず archive / cancel / resume が止まる → **Mitigation**: `buildWorktreePath(repoRoot, slug, jobId)` 規約を fallback に据え、sidecar → 規約再導出の 2 段で解決する。
- [Risk] 段1 と段2 の二段化で中間状態が長く残り、混在 state が増える → **Mitigation**: 段1 は in-place・挙動不変として独立に検証可能にし、段2 へ進む前に段1 の受け入れ基準を green にする。
- [Trade-off] history 永続 truncation 撤廃（D4）で長寿命 job の `events.jsonl` が線形成長する。1 job あたりの transition は数十件規模であり、表示 cap で出力 parity を保つため実害は小さいと判断する。

## Open Questions

- D3 の delta-append を将来 `appendStepRun` / `appendHistory` への一本化（append 専用 writer 化）へ収斂させるべきか。段1 では回帰面積を理由に delta-append を採るが、段2 完了後に transition 呼び出し点を append 経由へ寄せる清掃を別 change として切る余地がある。
- managed runtime の enumeration marker の更新責務（誰が marker を書き、いつ消すか）。worktree を持たない managed では active の生死を marker でしか観測できないため、marker のライフサイクルを resume / finish / cancel のどこで閉じるか要確定。
- `.specrunner/jobs/` legacy の dual-read をいつまで維持するか（移行完了の判定基準）。

## Migration Plan

2 段で提供する。

- **段1（in-place・挙動不変）**: `.specrunner/jobs/<jobId>.json` を `.specrunner/jobs/<jobId>/events.jsonl` ＋ `.specrunner/jobs/<jobId>/state.json` に分割する。キー（jobId）・列挙元（`.specrunner/jobs/` スキャン）は据え置く。`events.jsonl` は段1 では `modelUsage` を含めたまま。観測可能な挙動（local resume / `job ls` / `job show` / 画面出力 / PR 生成）が不変。
- **段2（移行・痩せ・組み替え）**: 分割ファイルを `changes/<slug>/` へ移し step commit/push に同梱する。配置キーを slug にし、導出可能フィールド（`request.slug` / `request.path` / `fileContent` / `modelUsage`）を除く。machine-local を `.specrunner/local/<slug>/` へ分離。cost を step ごと append、finish 一括派生を廃止。中断事由を interruption event 化。列挙元を worktree 不変量 + dual-read へ組み替え。旧 `.specrunner/jobs/<jobId>.json` は dual-read で吸収し、移行しても削除しない（非破壊）。

rollback: 段2 の新規書き込みは新形式のみだが旧ファイルを残すため、段2 を revert しても旧 job は `.specrunner/jobs/` の full state から従来どおり読める。
