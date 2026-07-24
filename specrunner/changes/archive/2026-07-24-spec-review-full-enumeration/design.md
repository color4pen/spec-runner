# Design: spec-review 全量列挙規律と後出し検出

## Context

spec-review が同一 revision に対して見えているはずの finding を round ごとに 1 件ずつ
小出しにし、有限のループ予算 (1 起動あたり review 2 回) を食い潰して exhaustion 停止を
繰り返す事例が実運用で確認された。原因は reviewer の完了契約に網羅性の要求が無いこと
であり、finding 1 件でも有効な needs-fix 結果として成立するため agent が満足化する。

semantic な網羅性そのものは機械検証できないが、検証可能な近似として「後出し検出」が
成立する: round N+1 の finding の対象記述が、round N がレビューした revision に既に
存在していた場合、それは round N の見逃しであり機械判定できる。

現状コードの関連事実:

- `src/prompts/spec-review-system.ts` — `## Method` 節はレビュー観点の列挙のみで、
  finding を全量列挙する規律が無い。
- `src/kernel/report-result.ts` — `Finding` は `file: string` (必須) と `line?: number`
  (optional)、`severity`、`title`、`origin?: "scope"` を持つ。
- `src/core/step/step-completion.ts` — `deriveStepCompletion` が verdict を導出する
  純粋計算 (store 書き込みは持たない)。判定後に `runtimeStrategy.verifyFindingRefs` で
  finding-ref の実在検証を行う。
- `src/core/step/commit-orchestrator.ts` — `commitSuccess` が verdict / state を永続化し、
  その後 `applySuccessPostPersistEffects` で usage / lineage の best-effort な journal
  append を行う。lineage は `store.appendLineage` で journal-only に記録される。
- `src/state/helpers.ts` / `src/store/event-journal.ts` — `StepRun` は run ごとの
  `commitOid` (exit commit) を記録する。spec-review は canon を書かない judge step の
  ため、run N の commitOid における canon 内容は run N がレビューした内容と一致する。
- `src/store/event-journal.ts` — `events.jsonl` は tagged-union の EventRecord を
  append する。journal-only の記録種別 (lineage / operator-event) の前例がある。
- `src/core/port/runtime-strategy.ts` — git を読む seam (`verifyFindingRefs` /
  `readFileAtCommit` / `digestArtifacts` 等) は RuntimeStrategy port に集約されている。

## Goals / Non-Goals

**Goals**:

- spec-review の system prompt に全量列挙規律を追記する (行動を変える層)。
- 後出し判定の純関数を導入し、`late` / `not-late` / `indeterminate` の 3 値を返す
  (遵守を測る層)。
- iteration 2 以上の spec-review 完了で per-finding の後出し判定を event journal に
  記録し、後出しがある round では stderr に要約 1 行を出す (観測信号)。
- 後出し検出を既存の verdict 導出・escalationReason 計算・finding-ref 実在検証から
  構造的に隔離する。

**Non-Goals**:

- 後出し率に基づく gate / halt / verdict 変更 (信号の蓄積を見てから別 request で判断)。
- code-review・conformance 等 spec-review 以外の judge step への配線 (判定関数は汎用に
  作るが配線は spec-review のみ)。
- maxIterations (ループ予算) の変更。
- finding-ref 実在検証と欠落指摘 finding の衝突 (issue #916)。
- severity 閾値の復活 (low / medium も現行どおり fixer routing 対象のまま)。

## Decisions

### D1: prompt 規律 + 後出し検出の二層構成

**採用**: prompt に全量列挙規律を追記して行動を変えつつ、後出し検出で遵守を測る。
semantic な網羅性は直接機械検証できないため、検証可能な近似 (前 revision に存在した
記述への後出し指摘の検出) を歯にする。

- Rationale: prompt 規律のみでは遵守が測定不能になり、規律が効いているかを次の実運用で
  判定できない (「agent 自己申告は信頼できない」原則に反する)。後出し検出のみでは行動を
  変える梃子が無い。両層が相補的。
- Alternatives considered:
  - prompt 規律のみ (検出なし) — 却下。遵守が測定不能。
  - 後出し検出のみ — 却下。行動変容の梃子が無く、規律文が無いと agent は満足化を続ける。

### D2: 観測信号に留め verdict を変えない

**採用**: 後出し検出は journal 記録 + stderr 要約に留め、verdict / escalationReason /
finding-ref 実在検証を一切変更しない。

- Rationale: 後出しを即 gate 化すると、判定の偽陽性 (内容一致の限界) が新たな不当停止を
  生む。まず信号を蓄積し、gate 化は実測を見て別 request で判断する。
- Alternatives considered:
  - severity 閾値の復活 (low / medium は記録のみで前進) — 却下。実測で実装を壊しうる
    仕様穴が low / medium で報告されており、素通りに戻すと #913 が解決した問題が再発する。
  - maxIterations の引き上げ — 却下。小出しの根因を放置して予算で吸収する対症療法で、
    round 数が線形に増えるだけで収束性は改善しない。

### D3: 後出し検出を post-persist の best-effort 後処理として配置する

**採用**: 後出し検出の計算・journal 記録・stderr 要約を `commit-orchestrator` の
`applySuccessPostPersistEffects` (verdict 確定・永続化の後に走る best-effort ブロック、
lineage と同じ層) に配置し、`step-completion.ts` (verdict 導出) は一切変更しない。

- Rationale: D2 (verdict 不変) を構造で保証する。verdict は後出し検出が走る前に既に
  導出・永続化されており、後出し検出は verdict / state への書き戻し経路を持たない。
  `step-completion.ts` を編集しないことで、finding-ref 実在検証・escalationReason 計算・
  verdict 導出の無変更を差分ゼロで担保する。lineage が既に「digest I/O + journal append」を
  この位置で best-effort に行う前例があり、対称的に収まる。
- Alternatives considered:
  - `deriveStepCompletion` 内で計算し `StepCompletion` に結果を積んで orchestrator が
    append する (biteEvidence パターン) — 却下寄り。verdict 導出関数に後処理を差し込む
    ことになり、verdict 不変の証明が「差し込んだブロックが verdict 変数に触れていないこと」
    のレビューに依存する。post-persist 配置ならファイル自体を触らず構造で保証できる。
- 配置詳細:
  - `applySuccessPostPersistEffects` は成功した全 step で走る。gate `step.name ===
    STEP_NAMES.SPEC_REVIEW` で spec-review のみに配線する (Non-Goal: 他 judge への配線なし)。
  - この時点の `state` は projectSuccess 適用後 (当該 run が push 済) であるため、
    `state.steps["spec-review"]` は当該 run を含む。iteration = 当該配列長、
    前 round = 末尾から 2 番目の StepRun、その `commitOid` が前 revision。
  - findings は `result.completion.persistToolResult.findings` から取得し、機械合成の
    scope finding (`origin === "scope"`) を除外する。

### D4: 後出し判定を「純関数 + 薄い配線 + runtime seam」に分解する

**採用**: 後出し検出を 3 層に分ける。

1. 純関数 `classifyFindingRecency(targetLineContent, priorFileContent): FindingRecency`
   — 副作用なし。`src/core/step/finding-recency.ts`。
2. 配線 `computeFindingRecency(...)` / `recordFindingRecency(...)` — seam を呼んで
   per-finding 結果を組み立て、journal 記録 + stderr 要約を行う。同ファイル。
3. runtime seam `readRevisionContent` — 現 revision の当該 file 内容と、前 commitOid に
   おける当該 file 内容を返す。RuntimeStrategy port に追加。

- Rationale: 純関数は完全に単体テスト可能で、3 値の固定 (受け入れ基準) を最小の依存で
  行える。I/O (git 読み) は seam に隔離し、domain 層 (`finding-recency.ts` /
  orchestrator) は port 経由でのみ git に触れる (既存の DSM 規律に一致)。判定関数は汎用に
  作り (どの judge でも再利用可能)、配線だけを spec-review に限定する (Non-Goal に一致)。

- 純関数の判定規則:
  - `targetLineContent === null` → `indeterminate` (line 欠落 / 現内容取得不能)。
  - `priorFileContent === null` → `indeterminate` (前 revision 解決不能 / file 不在)。
  - `needle = targetLineContent.trim()`; `needle === ""` → `indeterminate` (空白行は
    誤検出防止のため判定不能)。
  - `priorFileContent` を行分割し各行 trim、`needle` を含めば `late`、含まなければ
    `not-late`。行番号を使わず全行走査するため行番号ずれに頑健。
  - 保守側 (偽陽性は `late`、偽陰性は `not-late`) に倒れるが、観測信号のため許容。

- `readRevisionContent` の contract:
  - 入力: `(file, priorOid, cwd, branch)`。出力: `{ current: string | null;
    prior: string | null }`。never throw。
  - local: `current` は worktree の `cwd/file` を fs 読み (失敗時 null)、`prior` は
    `git show <priorOid>:<file>` (exit 非 0 / 例外時 null)。
  - managed: `current` は `githubClient.getRawFile(owner, repo, branch, file)`
    (branch 無しは null)、`prior` は null (ローカル worktree で任意 OID を解決不能)。
    → managed では常に `indeterminate` に倒れる (偽信号を出さない)。
  - port では optional method、`RealRuntimeStrategy` では required とし、両 concrete
    runtime に実装を強制する (既存の seam 追加パターンに一致)。
  - `computeFindingRecency` は `runtimeStrategy.readRevisionContent` が未実装
    (optional fake 等) のとき当該 finding を `indeterminate` に倒す (fail-to-indeterminate)。

### D5: 後出し記録を journal-only の EventRecord にする

**採用**: `FindingRecencyRecord` (`type: "finding-recency"`) を EventRecord tagged union に
追加し、`store.appendFindingRecency` (JobJournal + JobStateStore) で `events.jsonl` に
append する。lineage / operator-event と同じ journal-only 記録 (state.json /
NormalizedJobState には materialize しない)。

- 記録内容: `{ type, step, ts, iteration, priorOid: string | null, findings:
  { file, line?, title, severity, recency }[] }`。per-finding の後出し判定を保持する。
- `fold()` は `finding-recency` 行を dispatch し `FoldResult.findingRecency?:
  FindingRecencyRecord[]` に収集する。projection (`job-state-projection.ts`) は
  lineage 同様これを state に materialize しない。
- Rationale: journal-only 記録の前例 (lineage / operator-event) に一致し、operator が
  run 後に `events.jsonl` から後出し信号を確認でき、テストは fold 経由で projection を
  読める。
- `FoldResult.findingRecency` は optional field とし、既存の FoldResult リテラル構築
  (`job-journal.ts` の ENOENT branch / `job-state-projection.ts` の初期値) を無改変で
  通す。`fold()` は本 field を常に populate する。unknown type は前方互換のため既存
  どおり無視されるので、旧 code が新 journal を読んでも安全。

## Risks / Trade-offs

- [Risk] 内容一致の偽陽性 (前 revision に偶然同一行が存在) → 誤って `late`。
  → Mitigation: 観測信号のみで verdict を変えない (D2)。空白行は `indeterminate` に倒す。
  gate 化は実測後に別 request で判断する。
- [Risk] 内容一致の偽陰性 (spec-fixer が対象行を言い換え) → 誤って `not-late`。
  → Mitigation: 保守側の見落としだが、観測信号のため許容。行 trim で軽微な空白差は吸収。
- [Risk] 前 round の commitOid が欠落 (legacy record 等) → 前 revision 解決不能。
  → Mitigation: `indeterminate` に倒す。記録は行うが late 判定はしない。
- [Risk] managed runtime では prior 内容を解決できず常に indeterminate。
  → Mitigation: 本 request の対象は local dogfooding での小出し。managed は偽信号を
    出さず indeterminate に倒れるのが正しい振る舞い。verdict は不変。
- [Risk] 後出し検出中の例外が step 完了を壊す。
  → Mitigation: lineage と同じく best-effort。orchestrator 側で try/catch し握り潰す。

## Open Questions

なし。
