# job state を event journal / projection / liveness に分離し slug ディレクトリで branch 同伴管理する

**Date**: 2026-06-06
**Status**: accepted
**Supersedes**: `specrunner/adr/2026-05-25-usage-json-cost-tracking.md` (D2: finish 一括派生を廃止し step ごと append に変更)
**Related**: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md`（`.specrunner/jobs/` 配置の決定を段2で移行）

## Context

job state は `.specrunner/jobs/<jobId>.json`（git 追跡外）に単一 JSON で置かれ、更新のたびに `atomicWriteJson` で全体を read-modify-write する。この 1 ファイルに性質の異なる 3 種が同居している。

- **append で失えない event** — `steps[]` の各 attempt（`outcome.verdict` / `outcome.toolResult` / 時刻）、`history`（transition）、cost（`StepRun.modelUsage`）。
- **再計算できる projection** — `step` / `status` / `resumePoint`。`resolveResumeStep` は実際に `steps[].outcome` を畳んで再開位置を再推論しており、現在位置は journal の射影として扱われている。
- **別マシンで無効な machine-local 値** — `worktreePath`（絶対パス）/ `pid` / `session`。

この同居が 2 つの問題を生んでいた。

1. state が git 追跡外のため、CI のように作業ディスクが使い捨てられる環境では再開できない。
2. event を「毎回まるごと rewrite する 1 ファイル」に載せているため、書き込み中の crash が event ごと壊しうる。

加えて、作業単位の識別（slug）と実行の識別（jobId）が別キーで管理され、`job ls` / `resume` / `archive` がそれぞれ別経路で突き合わせている。

## Decision

### D1: state を 3 ストアに分離する

| 種別 | 中身 | 置き場（段2） | 書き方 |
|------|------|--------------|--------|
| event journal（truth） | step attempt record（`outcome` / 時刻 / `sessionId`）、transition record（旧 `history`）、interruption record | `changes/<slug>/events.jsonl` | append-only |
| cost ledger（truth） | command/step ごとの token usage | `changes/<slug>/usage.json` | JSON 配列への atomic overwrite（read-modify-write）|
| projection（cache） | descriptor（`jobId` / `request{title,type}` / `repository` / `branch` / `pipelineId` / `version` / `createdAt`）＋ cursor（`step` / `status` / `resumePoint` / `updatedAt`）＋ `pullRequest` | `changes/<slug>/state.json` | overwrite |
| liveness（再生成） | `pid` / `session` / `worktreePath` / managed enumeration marker / per-attempt sessionId / session log | `.specrunner/local/<slug>/` | overwrite |

projection は event journal を畳めば再生成できる cache であり truth ではない。liveness は別マシンで無効なため branch 同伴 state に乗せず、resume 時に再生成する。`.specrunner/local/` は **metadata のみ**を持ち、truth（`events.jsonl`）は持たない。

**Rationale**: 3 種は寿命・正しさの根拠・有効範囲（マシン）が異なる。同一ファイルに載せると、append が rewrite に巻き込まれて壊れ、machine-local 値が他マシンで無効化し、再計算可能な cache が truth と混同される。配置を性質で割れば、各ファイルの書き方（append / overwrite / 再生成）が一意に決まる。

### D2: event journal のレコードスキーマと fold アルゴリズム

`events.jsonl` は 1 行 1 JSON オブジェクトの tagged union とする。

- **step-attempt record**: 種別タグ + `step` 名 + `StepRun` 等価フィールド（`outcome` / 時刻 / `sessionId`）。
- **transition record**: `HistoryEntry` 等価（`ts` / `step` / `status` / `message`）。
- **interruption record**: 中断事由 1 件（`reason` / `errorCode` / `exhaustionPhase`）。

**fold**:
1. ファイルを行単位で読み、**不完全な末尾行（partial write）を 1 行無視**し、それ以前の行をすべて parse する。
2. step-attempt record を出現順に `step` でグルーピングし、グループ内 index+1 を `attempt` に割り当て `steps: Record<string, StepRun[]>` を構成する。
3. transition record を出現順に集めて `history: HistoryEntry[]` とする。
4. 末尾の interruption record から `resumePoint` / `error` cache を materialize する。

`attempt` を出現順で導出することで、現行の `pushStepResult`（`attempt = existing.length + 1`）と同値になり、`resolveResumeStep` Tier 2a が読む「fixer の attempt 数」「loop step 最終 attempt の `outcome.verdict`」、transition の `when` 節が読む `outcome.toolResult`（`fixableCount`）が fold 結果で従来同値に保たれる。

**Rationale**: JSON Lines は 1 行が 1 event に対応するため、追記が他行に影響せず、torn write は末尾 1 行に限局する。fold が末尾 partial を捨てれば「書き込み中 crash で既存 event を失わない」が成立する。

### D3: 書き込み経路 — journal append と cursor overwrite の物理分離

- `events.jsonl` は **`fs.appendFile` のみ**で書く（決して rewrite しない）。
- `state.json` は **`atomicWriteJson`（tmp + rename）のみ**で全体 overwrite する。
- 2 ファイルは別の I/O 操作で書かれるため、片方の書き込み中 crash が他方を壊さない（crash 分離）。

`JobStateStore` の外部契約（`create` / `load` / `persist` / `update` / `appendStepRun` / `appendHistory` / `list` / `resolveId` の戻り値・解決セマンティクス）は保つ。内部実装:

- `load()`: `state.json` を読み、`events.jsonl` を fold して `steps` / `history` を合成し、従来の `NormalizedJobState` 等価を返す。append 成功後 cursor 更新前のクラッシュは `load()` 時の冪等リカバリで担保する（fold 行数がカウンタを上回る場合はカウンタをリセット）。
- `persist(state)` / `update(state, patch)`: `state.json` の journal 件数カウンタで delta を O(1) に判定し、**未記録分のみ append**してから cursor/descriptor を overwrite する。

**Rationale**: 現行の主要 writer は `transitionJob(...) + persist(...)` と `pushStepResult(...) + persist(...)` であり、full state を `persist` に渡す。`persist` を「delta append + cursor overwrite」にすると、呼び出し側を一切書き換えずに journal 追記が成立し、挙動不変を最小リスクで満たせる。

### D4: history の永続 truncation を撤廃し、cap は表示層へ移す

現行 `appendHistoryEntry` は `MAX_HISTORY_SIZE`（100）で古い entry を切り捨てる。journal を append-only にするため、**永続層では truncation しない**（journal は完全な経過トレース）。表示層が必要なら直近 N 件に cap する。

**Rationale**: CI 再 checkout 後に唯一残る経過トレースとして完全性が要る。旧 cap は単一 JSON rewrite 時の肥大化懸念によるものであり、append-only journal ではその懸念が消える。また delta 判定（件数カウンタ）が truncation で破綻しないためにも「配列長 = journal 行数」を保つ必要がある。

### D5: 配置キーを slug にし、location を identity にする（段2）

1 branch = 1 slug = 1 `changes/<slug>/`。state は branch 上の `changes/<slug>/` に置く。`jobId` は attempt の識別として残り、branch 名 `<prefix><slug>-<jobId8>`・worktree 名 `<slug>-<jobId8>` に含まれる（**1 run = 1 branch**）。

location が identity になることで導出可能になったフィールドを state から除く。

- `request.slug` — ディレクトリ名から自明。
- `request.path` — `changes/<slug>/request.md` 規約から自明。
- `StepOutcome.fileContent` — 実ファイルが真実。
- `StepRun.modelUsage` — 唯一の消費者（finish 一括派生）の廃止に伴い除去（D6）。

再 run は新 jobId として新しい branch/worktree を生やし、**旧 attempt の push 済み branch には触れない**。同一 slug の複数 attempt は `job ls` に jobId で区別表示し、`job cancel <jobId>` で個別に片付ける。

**Rationale**: slug = 作業単位、jobId = 実行。state を「作業単位のフォルダ」に置けば、CI が branch を checkout するだけで state が手に入り、再 run が旧 attempt を破壊せず併存できる。

### D6: cost を step 完了ごとに usage.json へ append し finish 一括派生を廃止する（段2）

cost を step 完了ごとに `changes/<slug>/usage.json` へ append し step commit に同梱する。finish の `deriveFromJobState` / `deriveAndWriteUsage` と、それが依存する `.specrunner/jobs/` 読みを廃止する。これにより `StepRun.modelUsage` の唯一の消費者が消え、`modelUsage` を state から除ける。

**Rationale**: cost を step commit に同梱すれば CI 再 checkout 後も cost が branch に乗って追える。finish 時点でしか派生できない構造（`.specrunner/jobs/` 依存）は branch 同伴 state と両立しない。`usage` show / summary は既に `changes/<slug>/` と archive の `usage.json` を読むため挙動不変。

**Note**: この決定は `2026-05-25-usage-json-cost-tracking.md` の D2（state file を source of truth とし finish 時に一括 derive する）を廃止し、step ごとの append に移行する。

### D7: 列挙元を「worktree 不変量 + dual-read」へ組み替える（段2）

**worktree がある ⟺ job が非終端（active）** という不変量を用いる。

- **local active**: `.git/specrunner-worktrees/*`（dir 名が `<slug>-<jobId8>`）を列挙し、各 worktree の `changes/<slug>/state.json` から step/status を読む。
- **managed active**: `.specrunner/local/<slug>/marker.json`（`slug` / `jobId` / `status` / `createdAt`）で列挙。index 情報のみ、truth は持たない。managed job 開始時に write、finish / cancel 完了時に clear。
- **archived**: main checkout の `changes/archive/*/`。
- **legacy**: `.specrunner/jobs/*.json`（旧 full state の dual-read）。

`job ls` 既定は active のみ、archive は on-demand（`--all`）。jobId 入力（`job show <jobId>` / `job cancel <jobId>`）は slug-dir 横断 scan による二次解決とし、slug 入力を一級にする。

**Rationale**: 「worktree = active」という観測可能な不変量を列挙の根拠に据えると、local の active は git worktree 一覧から確実に得られ、終了時に worktree が消えれば自動的に列挙から外れる。managed は worktree を持たないので marker で補い、過去分は archive / legacy を dual-read で吸収する。

### D8: machine-local の sidecar 分離と worktreePath の再導出（段2）

`pid` / `session` / `worktreePath` を `.specrunner/local/<slug>/`（gitignore）へ分離し、resume 時に再生成する。

sidecar ファイルレイアウト (`.specrunner/local/<slug>/`):

| ファイル名 | フォーマット | フィールド |
|-----------|------------|-----------|
| `liveness.json` | JSON | `pid` / `session` / `worktreePath` / `jobId` |
| `session-<attempt>.log` | テキスト | agent session ログ |
| `session-<attempt>.sessionId` | テキスト 1 行 | per-attempt の sessionId |
| `marker.json` | JSON | D7 参照（managed runtime のみ）|

worktreePath を読む 3 経路（archive / cancel / resume）は、sidecar 参照もしくは `buildWorktreePath(repoRoot, slug, jobId)` 規約からの再導出で worktreePath を得る。exit-guard（`beforeExit`）は自 worktree の branch state に `awaiting-resume` を記録し、ハード crash で status が stale な場合に備え pid 突き合わせで liveness を判定する。

**Rationale**: 絶対パス・pid・session は別マシンで無効なので branch に乗せてはならない。worktreePath は `slug + jobId` から決定的に再構成できるため、sidecar 喪失時も規約から復元できる。

### D9: 後方互換・非破壊移行（段2）

旧 `.specrunner/jobs/<jobId>.json`（full state）を読んで新形式（journal + cursor）へ移行して resume できる。移行後も旧ファイルは削除せず残す（非破壊）。新規書き込みは新形式のみ。列挙は legacy を dual-read で含める（D7）。

**Rationale**: 進行中の旧 job を壊さず移行するため。旧ファイルを残すことで、移行が誤っても元データから再試行できる。

## Alternatives Considered

### Alternative 1: 単一 JSON のまま git 追跡に入れる（D1 の代替）

- **Pros**: ファイル分割不要で `JobStateStore` の実装変更が最小
- **Cons**: 毎回 rewrite の crash 脆弱性が残る（問題2）。machine-local 値（`pid`/`session`/`worktreePath`）が branch に乗り別マシンで無効化する
- **Why not**: crash 安全性と branch 同伴の両要件を同時に解決できない

### Alternative 2: SQLite 等の埋め込み DB を使う（D1 の代替）

- **Pros**: トランザクション境界が得られ crash 安全性が高い
- **Cons**: git diff/commit に乗らず branch 同伴・CI 再 checkout の要件を満たせない。依存追加が発生し minimal-deps の方針に反する
- **Why not**: VCS 親和性が要件であり append-only テキストが最も自然

### Alternative 3: イベントに連番 `seq` を埋めて整合チェックする（D2 の代替）

- **Pros**: partial write 以外の整合問題（ファイル破損等）も検出できる
- **Cons**: 単一 writer 前提では順序で十分。再 run・移行時の連番振り直しコストが発生する
- **Why not**: 末尾 partial の無視で求める crash 安全性が成立し、連番は過剰

### Alternative 4: step ごとに別ファイルで events を保持する（D2 の代替）

- **Pros**: step 単位のファイルが明確に分離できる
- **Cons**: ディレクトリが膨らみ、列挙と fold が複雑化する。1 つの step に複数 attempt があるため命名規則も複雑になる
- **Why not**: 1 本の jsonl で順序が自明な方が単純であり、fold も容易

### Alternative 5: append を `appendStepRun` / `appendHistory` のみに限定し `persist` は journal に触れない（D3 の代替）

- **Pros**: 書き込み経路が最も清潔で、journal と cursor の責務が完全に分離される
- **Cons**: `transitionJob` が history を in-memory 追記する pure 関数であるため、全 transition 呼び出し点（`fail` / signal handler / resume / cancel / archive / exit-guard / timeout）を append 経由に書き換える必要があり、段1 の挙動不変ステージで回帰面積が大きい
- **Why not**: 段1 の「観測可能な挙動が不変」要件に対して変更範囲が広すぎる。将来の清掃余地として留保

### Alternative 6: journal でも `MAX_HISTORY_SIZE` で cap する（D4 の代替）

- **Pros**: 現行挙動との parity がある。長寿命 job での `events.jsonl` 肥大化を防ぐ
- **Cons**: 古い transition を捨てると CI 再 checkout 後のトレースが欠落する。delta カウンタ（配列長 = journal 行数）が truncation で破綻する
- **Why not**: append-only journal では transition 件数（数十件規模）による肥大化懸念が消え、CI トレースの完全性が要件として上位にある

### Alternative 7: jobId キーのまま branch 同伴にする（D5 の代替）

- **Pros**: 既存の jobId-based コードの変更が最小
- **Cons**: CI が「どの jobId を読むか」を別途知る必要がある。同一 slug の複数 attempt が同じブランチ上に乗れず、CI からの jobId 特定が複雑になる
- **Why not**: slug=ディレクトリなら checkout した branch の中身が一意であり、CI からの参照が自明

### Alternative 8: finish 一括派生（`deriveFromJobState`）を維持し `.specrunner/jobs/` 読みを branch 同伴経路と並走させる（D6 の代替）

- **Pros**: 既存の finish orchestrator の変更が最小。usage が step ごとに branch に出なくても archive 時に一括で取り込まれる
- **Cons**: `.specrunner/jobs/` を読む依存が残り、CI 再 checkout で state が失われた場合に usage も失われる（段2 が解決したいシナリオそのもの）。branch 同伴 state と二重管理になる
- **Why not**: CI 再 checkout 後の cost 追跡は段2 の要件であり、step commit 同梱が唯一の解

### Alternative 9: 中央 index ファイルを `.specrunner/` に持つ（D7 の代替）

- **Pros**: 単一スキャンに戻り、列挙ロジックが単純
- **Cons**: CI 再 checkout で失われ、worktree 実体と乖離して stale になりうる。worktree を削除してもindex に残るゾンビが生じる
- **Why not**: worktree 実体を列挙の根拠にする方が壊れにくく、branch 同伴 state との一貫性がある

## Migration Plan

2 段で提供する。

- **段1（in-place・挙動不変）**: `.specrunner/jobs/<jobId>.json` を `.specrunner/jobs/<jobId>/events.jsonl` ＋ `.specrunner/jobs/<jobId>/state.json` に分割する。キー（jobId）・列挙元は据え置く。観測可能な挙動（local resume / `job ls` / `job show` / 画面出力 / PR 生成）が不変。
- **段2（移行・痩せ・組み替え）**: 分割ファイルを `changes/<slug>/` へ移し step commit/push に同梱する。配置キーを slug にし、導出可能フィールド（`request.slug` / `request.path` / `fileContent` / `modelUsage`）を除く。machine-local を `.specrunner/local/<slug>/` へ分離。cost を step ごと append、finish 一括派生を廃止。列挙元を worktree 不変量 + dual-read へ組み替え。

## Consequences

### Positive

- CI 再 checkout で branch を取り直すだけで resume に必要な state が揃う。
- event と cursor の書き込みが物理分離され、crash で既存 event が失われない。
- machine-local 値が branch に乗らないため、別マシンでの resume が成立する。
- location が identity になることで state の冗長フィールドが除去され、truth の重複がなくなる。
- cost が step commit に同梱され、CI 再 checkout 後も cost 追跡が継続する。
- archive 後の main に `state.json` / `events.jsonl` / `usage.json` が含まれ、`job ls --all` から cost と来歴を追える。

### Negative

- 段1 と段2 の二段化で中間状態が存在し、混在期間に両形式を並列サポートする必要がある。
- fold のコスト: `load()` のたびに `events.jsonl` を全行読む。1 job あたりの event 数は数十〜数百件規模であり実害は小さいと判断する（将来の部分 fold / checkpoint は別件）。
- `history` 永続 truncation の撤廃で長寿命 job の `events.jsonl` が線形成長する。transition 件数は数十件規模であり表示 cap で出力 parity を保つため実害は小さい。
- managed runtime の marker ライフサイクル（誰が書き、いつ消すか）が要確定。

### Known Debt

- D3 の delta-append を将来 `appendStepRun` / `appendHistory` への一本化（append 専用 writer 化）へ収斂させる余地がある。
- managed runtime enumeration marker の更新責務を resume / finish / cancel のどこで閉じるか要確定。
- `.specrunner/jobs/` legacy の dual-read をいつまで維持するか（移行完了の判定基準）が未定。

## References

- Request: `specrunner/changes/minimal-state-slug-dir/request.md`
- Design: `specrunner/changes/minimal-state-slug-dir/design.md`
- Superseded: `specrunner/adr/2026-05-25-usage-json-cost-tracking.md`（D2: finish 一括派生を step ごと append に変更）
- Related: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md`（`.specrunner/jobs/` 配置の決定）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（JobStateStore の DI パターン）
- Related: `specrunner/adr/2026-05-21-job-cancel-audit-trail-over-delete.md`（cancel の audit trail）
