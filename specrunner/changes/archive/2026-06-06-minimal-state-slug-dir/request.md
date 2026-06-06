# job state を event journal / projection / liveness に分離し、slug ディレクトリで branch 同伴管理する

## Meta

- **type**: spec-change
- **slug**: minimal-state-slug-dir
- **base-branch**: main
- **adr**: true

## 背景

job state は `.specrunner/jobs/<jobId>.json`（git 追跡外）に単一 JSON で置かれ、更新のたびに全体を read-modify-write で書き換える。この1ファイルに性質の異なる3種が同居している:

- **append で失えない event** — `steps[]` の各 attempt（verdict / toolResult / 時刻）、`history` の transition、cost。
- **再計算できる projection** — 現在位置（step / status / resumePoint）。`resolveResumeStep` は実際に `steps[].outcome` を畳んで再開位置を再推論しており、現在位置は journal の射影として扱われている。
- **別マシンで無効な machine-local 値** — worktreePath（絶対パス）/ pid / session。

この同居が2つの問題を生む:

1. state が git 追跡外のため、CI のように作業ディスクが使い捨てられる環境では再開できない。
2. event を「毎回まるごと rewrite する1ファイル」に載せているため、書き込み中の crash が event ごと壊しうる。

加えて、作業単位の識別（slug）と実行の識別（jobId）が別の場所・別のキーで管理され、`job ls` / `resume` / `archive` がそれぞれ別経路で突き合わせている。

## 目標の state モデル

state を性質で3つに分離する。

| 種別 | 中身 | 置き場 | 書き方 |
|------|------|--------|--------|
| event journal（真実） | step attempt（verdict / toolResult / 時刻 / findingsPath / error / followUpAttempts）、transition（旧 history）、cost | `changes/<slug>/`（branch 同伴） | append-only |
| projection（cache） | cursor = step / status / resumePoint | `changes/<slug>/state.json`（branch 同伴） | overwrite |
| liveness（再生成） | session / pid / worktreePath | `.specrunner/local/<slug>/`（gitignore） | overwrite |

projection は event journal を畳めば再生成できる cache であり truth ではない。liveness は別マシンで無効なため永続せず、resume 時に再生成する。

## ファイルレイアウト

`changes/<slug>/`（git 追跡・step ごとに commit/push）:

- `events.jsonl` — append-only。step attempt record と transition record。fold で `steps: Record<string, StepRun[]>` 等価形に復元できる。
- `usage.json` — append-only の cost ledger（既存）。step 完了ごとに append。
- `state.json` — overwrite・小。descriptor（jobId / request{title,type} / repository / branch / pipelineId / version / createdAt）＋ cursor（step / status / resumePoint / updatedAt）＋ `pullRequest`（pr-create event から materialize した cache。merge / archive / finish / `job ls` が読む）。

`.specrunner/local/<slug>/`（gitignore・machine-local）:

- liveness（pid / session）、worktreePath、managed runtime の enumeration marker、per-attempt sessionId、session log。すべて metadata であり state の truth は持たない。

## 要件（2段で提供する）

### 段1: ファイル分割（in-place・挙動不変）

1. `.specrunner/jobs/<jobId>.json` の単一 JSON を、append-only journal（`events.jsonl`）と overwrite な cursor/descriptor（`state.json`）に分割する。パスは jobId ごとのサブディレクトリ `.specrunner/jobs/<jobId>/events.jsonl` ＋ `.specrunner/jobs/<jobId>/state.json` とし、`list()` はこの層を走査する。キー（jobId）は据え置く。段1 では `events.jsonl` の step-attempt record に `modelUsage` を**含めたまま**にする（既存挙動の保存）。`modelUsage` の除去と usage.json への per-step append 移行は段2（要件11）で同時に行う。
2. `JobStateStore` を分割レイアウトの読み書きに改める。`create` / `load` / `persist` / `update` / `appendStepRun` / `appendHistory` / `list` / `resolveId` の外部契約（戻り値・解決セマンティクス）を保つ。
3. event の追記は journal への append とし、cursor 更新の rewrite と分離する。書き込み中 crash で既存 event が失われない。fold は `events.jsonl` の不完全な末尾行（partial write）を無視し、それ以前の event をすべて復元する。
4. `steps[]` を読む消費者（`resolveResumeStep` の verdict / attempt 数、transition の `when` 節の toolResult）が、journal の fold 結果から従来同値を得る。
5. 観測可能な挙動（local resume・`job ls`・`job show`・画面出力・PR 生成）が不変。

### 段2: slug ディレクトリ移行・branch 同伴・痩せ・job.json 廃止

6. 段1 の分割ファイルを `changes/<slug>/`（change folder 配下）へ移し、既存の step ごと commit/push に同梱する。同一 branch を checkout し直した状態から resume が成立する。
7. state の配置キーを jobId から slug に変える（`.specrunner/jobs/<jobId>.json` → branch 上の `changes/<slug>/`、1 branch に 1 slug）。`jobId` は attempt の識別・cost 相関として残り、branch 名 `<prefix><slug>-<jobId8>`・worktree 名 `<slug>-<jobId8>` に既に含まれる（**1 run = 1 branch**）。再 run は新 jobId として新しい branch/worktree を生やし、**旧 attempt の push 済み branch には触れない**（force-push も上書きもしない）。同一 slug の attempt は複数併存しうる。併存分は `job ls` に jobId で区別表示し、不要な attempt は `job cancel <jobId>` で worktree/branch ごと片付ける（再 run 時の自動 supersede はしない）。
8. location が identity になることで導出可能になったフィールドを state から除く: `request.slug`（ディレクトリ名）/ `request.path`（`changes/<slug>/request.md` 規約）。
9. machine-local 値（session / pid / worktreePath）を branch 同伴 state から除外し `.specrunner/local/<slug>/` に分離する。`.specrunner/local/` は **metadata のみ**（liveness の pid / session、worktreePath、managed の enumeration marker）を持ち、state の truth（`events.jsonl`）は持たない。resume 時に再生成する。worktreePath を読む3経路（archive / cancel / resume の request-path 解決）が、sidecar もしくは slug＋machine 規約からの再導出で worktreePath を得る。
10. `fileContent`（実ファイルが真実）を除去する。
11. cost を step 完了ごとに `changes/<slug>/usage.json` へ append し step commit に同梱する。finish 一括派生（`deriveFromJobState` / `deriveAndWriteUsage`）と、それが依存する `.specrunner/jobs/` 読みを廃止する。`StepRun.modelUsage` の唯一の消費者が消えるため modelUsage を state から除く。
12. 中断事由を event として journal に1件で記録する（現在 top-level `error` / `resumePoint.reason` / `resumePoint.exhaustionPhase` に分散）。
13. `history`（transition journal）は残す。CI 再 checkout 後に唯一残る経過トレースであり、machine-local の session log は代替にならない。
14. `resumePoint` は rebuildable cache として扱う。`state.json` に保存してよいが truth は `events.jsonl` の fold。
15. archive で change folder を main に取り込む際、痩せた `state.json` / `events.jsonl` / `usage.json` を strip せず一緒に移す。cost と来歴を `job ls --all` から追える。
16. active job の列挙を worktree ベースにする。**worktree がある ⟺ job が非終端（active）** という不変量を使い、local runtime は `.git/specrunner-worktrees/*`（dir 名が slug＋jobId-short を持つ）を列挙し、各 worktree の `changes/<slug>/state.json` から step/status を読む。managed runtime はローカル worktree を持たないため、`.specrunner/local/<slug>/` の metadata marker（slug / jobId / status 等の index 情報のみ、truth は持たない）で列挙する。archived は main checkout の `changes/archive/*/`、旧形式は `.specrunner/jobs/*.json`（dual-read）。`job ls` 既定は active のみ、archive は on-demand（`--all`）。
17. 後方互換・非破壊移行: 旧 `.specrunner/jobs/<jobId>.json`（full state）を読んで新形式へ移行し resume できる。移行後も旧ファイルは削除せず残す。新規書き込みは新形式のみ。

## コマンド影響範囲

- **変わる（すべて `JobStateStore` 経由）**: `job start`(run) / `job ls` / `job show` / `job cancel` / `job resume` / `job archive`、runtime（local / managed）、finish（derive-usage / job-state-update / resolve-target）、exit-guard、doctor storage checks（jobs-writable / old-state-files）、path helper（xdg）。
- **列挙元の組み替え**: 今は `JobStateStore.list()` が `.specrunner/jobs/*.json` を単一スキャンする唯一の列挙で、`job ls`（ps.ts）と `resume`（resolve-job.ts）が両方ここを通る。これを「active = worktree 列挙（local）＋ `.specrunner/local/` の managed marker、archived = main の `changes/archive/*/`、legacy = `.specrunner/jobs/*.json`」の複合列挙へ移す。
- **worktreePath を読む3経路**: cancel / archive / resume-request-path —— sidecar 参照か再導出へ。
- **変わらない**: `request new|generate|ls|validate|review|template`、`rules new`、`init` / `login` / `runtime`、`usage`（show / summary は既に `changes/<slug>/` と archive の `usage.json` を読み、state を読まない）。
- **UX 注意**: `job show <jobId>` / `job cancel <jobId>` は jobId 入力を受ける。slug キー化後、jobId からの解決は slug-dir 横断 scan になる（slug 入力を一級にし、jobId は二次解決）。

## 不変条件（壊すと無音で壊れる）

- `resolveResumeStep` Tier 2a は loop step の最終 attempt の `outcome.verdict` と fixer の attempt 数を読む（`src/core/resume/resolve-step.ts`）。fold 結果でこれらが従来同値であること。
- transition の `when` 節は `outcome.toolResult`（`CodeReviewReportResult.fixableCount`）を読む（`src/core/pipeline/types.ts`）。fold 結果で保持されること。
- exit-guard（beforeExit）は自 worktree の branch state（`state.json` cursor ＋ `events.jsonl`）に `awaiting-resume` を記録し、worktree 存在＋branch status から resume が成立すること。ハード crash で status が stale な場合に備え、pid 突き合わせで liveness を判定できること。

## スコープ外

- CI / GitHub Actions 側のワークフロー定義（再 checkout → resume を行う Actions の実装）。本変更は「branch 同伴で resume 可能な state」を用意するところまで。
- `resolveResumeStep` の再開位置決定ロジックの簡素化（再推論）。本変更は storage の分離・移設であり routing の意味論は変えない。
- worktree の resume 時クリーン化（local 固有の別件）。
- 作業単位・実行・lifecycle 段の呼称統一（change / request / run の語彙整理）。

## 受け入れ基準

- [ ] 段1: 単一 JSON が `events.jsonl`（append）＋ `state.json`（cursor/descriptor）に分割され、置き場・キー・列挙元は不変、観測可能な挙動が不変。
- [ ] 段1: event の追記が cursor rewrite と分離され、書き込み中 crash で既存 event が失われない（回帰テスト）。
- [ ] 段1: fold が `events.jsonl` の不完全な末尾行を無視し、それ以前の event を全復元する。
- [ ] 段2: 新規 job の journal / cursor / usage が `changes/<slug>/` に作られ、step ごとの commit に同梱される。
- [ ] 段2: 同一 branch を checkout し直した状態から resume が成立する（CI 再実行相当）。
- [ ] `outcome.verdict`（resume Tier 2a）と `outcome.toolResult`（transition routing）が fold 結果で保持され、code-review approved + fixableCount>0 の routing と fixer-empty 検出の再開が従来どおり動く。
- [ ] cost が step ごとに `usage.json` へ append され、finish 一括派生と `.specrunner/jobs/` 読みが除去され、`modelUsage` が state から除かれている。`usage` show / summary が従来どおり動く。
- [ ] `worktreePath` / `pid` / `session` が branch 同伴 state に含まれず、resume が成立する。worktreePath を読む archive / cancel / resume の各経路が動作する。
- [ ] 中断事由が event として1箇所に記録されている。
- [ ] `history` が保持され、CI 再 checkout 後も経過トレースが残る。
- [ ] archive 後、main の change folder アーカイブに `state.json` / `events.jsonl` / `usage.json` が含まれる。
- [ ] active 列挙が worktree ベース（local）＋ managed marker で成立し、`job ls` が両 runtime の active を表示する。archived は `changes/archive/*/`、legacy は `.specrunner/jobs/*.json` を併せて列挙し、`job ls` 既定が active のみ・`--all` で archive を含む。
- [ ] worktree 存在 ⟺ 非終端の不変量が保たれ、exit-guard が自 worktree の branch state に `awaiting-resume` を記録して resume が成立する。
- [ ] 再 run が新 jobId / 新 branch を生やし旧 attempt の branch を破壊しない。同一 slug の複数 attempt が `job ls` に jobId で区別表示され、`job cancel <jobId>` で個別に片付けられる。
- [ ] 旧 `.specrunner/jobs/<jobId>.json`（full state）から新形式へ移行して resume でき、移行後も旧ファイルが残る（非破壊）。
- [ ] `pullRequest` が state.json に保持（pr-create event の materialize）され、merge / archive / finish / `job ls` の読み手が動作する。
- [ ] pipeline 実行・画面出力・PR 生成が不変。
- [ ] `bun run typecheck && bun run test` が green。
