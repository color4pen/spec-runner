# Tasks: spec-review 全量列挙規律と後出し検出

## T-01: spec-review prompt の Method 節に全量列挙規律を追記する

- [ ] `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_BASE` の `## Method` 節内に
      全量列挙規律を追記する。新規の h2 見出し (`## ...`) を導入せず、既存の番号付き
      項目に整合する形 (例: 「Output Format」項の前の新規番号項) で埋め込む。
- [ ] 規律文は少なくとも次の 3 点を含める:
      (a)「この round の revision で確認できる finding は、severity を問わずすべて今回の
      findings に含める」= **全量列挙** の要求、
      (b)「1 件ずつ **小出し** にしない」、
      (c)「前 round から存在した記述への新規 finding は **後出し** として機械記録される」。
- [ ] 追記語彙に「全量列挙」「小出し」「後出し」を含める (prompt contract テストの assert 対象)。
- [ ] 既存の 5 節骨格 (Question / Contract / Method / Evidence / Completion) と順序を保持する。
- [ ] `tests/prompts/spec-review-system.test.ts` (または新規 prompt contract テスト) に、
      `## Method` 節を抽出して全量列挙規律の存在を固定するテストを追加する。節抽出に対する
      assert とし、prompt 全文への grep にはしない。

**Acceptance Criteria**:
- `## Method` 節を抽出したテキストが「全量列挙」「小出し」「後出し」の各語を含むことを
  テストで固定する (受け入れ基準 1)。
- 抽出した `## Method` 節が `## Method` 見出し以外の h2 行を含まないことを確認し、
  `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` の 5 節骨格テスト
  (TC-001) が無改変で green。
- `SPEC_REVIEW_SYSTEM_PROMPT` が `EVIDENCE_DISCIPLINE` / `SEVERITY_DEFINITION` を含む
  既存 drift-guard テストが無改変で green。

## T-02: 後出し判定の純関数を導入する

- [ ] `src/core/step/finding-recency.ts` を新規作成し、副作用の無い純関数
      `classifyFindingRecency(targetLineContent: string | null, priorFileContent:
      string | null): FindingRecency` を実装する。
      `FindingRecency = "late" | "not-late" | "indeterminate"`。
- [ ] 判定規則 (design D4):
      - `targetLineContent === null` → `indeterminate`。
      - `priorFileContent === null` → `indeterminate`。
      - `needle = targetLineContent.trim()`; `needle === ""` → `indeterminate`。
      - `priorFileContent` を行分割し各行 trim、`needle` を含めば `late`、含まなければ
        `not-late` (行番号を使わず全行走査)。
- [ ] `tests/unit/core/step/finding-recency.test.ts` を新規作成し 3 値を固定する。

**Acceptance Criteria**:
- 前 revision に存在した記述 (対象行が前内容の或る行と trim 一致) → `late` をテストで固定 (受け入れ基準 2)。
- fixer が書き足した記述への指摘 (対象行が前内容のどの行とも不一致) → `not-late` をテストで固定 (受け入れ基準 2)。
- line 欠落 (`targetLineContent === null`) → `indeterminate` をテストで固定 (受け入れ基準 2)。
- 前 revision 解決不能 (`priorFileContent === null`) → `indeterminate` をテストで固定 (受け入れ基準 2)。
- 空白のみの対象行 → `indeterminate` をテストで固定。

## T-03: 前 revision / 現 revision 内容を読む runtime seam を追加する

- [ ] `src/core/port/runtime-strategy.ts` に DTO `RevisionContentPair { current:
      string | null; prior: string | null }` を追加する。
- [ ] `RuntimeStrategy` に optional method
      `readRevisionContent?(file: string, priorOid: string, cwd: string, branch:
      string | null): Promise<RevisionContentPair>` を追加し、`RealRuntimeStrategy`
      交差型に required として追加する (両 concrete runtime に実装を強制)。
- [ ] `src/core/runtime/local.ts` `LocalRuntime.readRevisionContent` を実装する:
      `current` は `path.join(cwd, file)` を fs 読み (失敗時 null)、`prior` は
      `git show <priorOid>:<file>` (exit 非 0 / 例外時 null)。never throw。
- [ ] `src/core/runtime/managed.ts` `ManagedRuntime.readRevisionContent` を実装する:
      `current` は `githubClient.getRawFile(owner, repo, branch, file)` (branch 無しは
      null)、`prior` は null。never throw。
- [ ] `tests/unit/core/runtime/` に local 実装のテストを追加する (現内容は worktree fs、
      前内容は指定 OID の `git show`、非存在 OID / 非存在 path は null)。

**Acceptance Criteria**:
- LocalRuntime が現 file 内容と指定 commitOid の file 内容を返し、解決不能ケースを
  null に倒すことをテストで固定する。
- `RealRuntimeStrategy` を実装する両 concrete runtime が `readRevisionContent` を持つこと
  (未実装なら `typecheck` が fail する) を型で担保する。

## T-04: 後出し検出の配線 (compute / record) を実装する

- [ ] `src/core/step/finding-recency.ts` に非同期配線
      `computeFindingRecency(findings: Finding[], priorOid: string | null, cwd: string,
      branch: string | null, runtimeStrategy: RuntimeStrategy):
      Promise<FindingRecencyResult[]>` を実装する。
      - 各 finding について、`priorOid === null` / `finding.line === undefined` /
        `runtimeStrategy.readRevisionContent` 未実装 のいずれかなら `indeterminate`。
      - それ以外は `readRevisionContent(finding.file, priorOid, cwd, branch)` を呼び
        (例外時は `{current:null, prior:null}`)、`current` の `line` 行目 (範囲外は null)
        を対象行内容として `classifyFindingRecency` を呼ぶ。
      - `FindingRecencyResult = { file: string; line?: number; title: string;
        severity: FindingSeverity; recency: FindingRecency }`。
- [ ] 同ファイルに `recordFindingRecency(params)` を実装する。params は
      `{ store: FindingRecencyStore; stepName: string; iteration: number;
      priorOid: string | null; findings: Finding[]; cwd: string; branch: string | null;
      runtimeStrategy: RuntimeStrategy }`。
      `FindingRecencyStore = { appendFindingRecency(record: FindingRecencyRecord):
      Promise<void> }`。挙動:
      - `iteration < 2` なら即 return (append しない)。
      - `computeFindingRecency` を実行。結果が空 (finding 0 件) なら return。
      - `FindingRecencyRecord` を組み立て `store.appendFindingRecency` で 1 件 append。
      - 結果に `late` が 1 件以上あれば `stderrWrite` で要約 1 行 (件数内訳を含む) を出力。
      - `recordFindingRecency` は verdict / state への書き戻し経路を持たず、
        `appendFindingRecency` と `stderrWrite` 以外の store 呼び出しを行わない。
- [ ] `tests/unit/core/step/finding-recency.test.ts` に compute / record の単体テストを
      追加する (fake `FindingRecencyStore` + fake `runtimeStrategy.readRevisionContent`)。

**Acceptance Criteria**:
- `recordFindingRecency` が `iteration === 1` のとき `appendFindingRecency` を呼ばない
  ことをテストで固定する (受け入れ基準 5)。
- `iteration === 2` で 2 件の finding (一方が late、一方が not-late になる fake 内容) を
  与えたとき、per-finding の recency を持つ record が 1 件 append されることをテストで
  固定する (受け入れ基準 3)。
- `late` が 1 件以上の結果で `recordFindingRecency` が `stderrWrite` を呼び出し、stderr
  に後出し件数内訳を含む要約 1 行を出力することをテストで固定する
  (spec.md Requirement「後出しがある round では stderr に要約を出す」)。
- `late` が 0 件（全件 `not-late` / `indeterminate`）の結果では `stderrWrite` を呼ばない
  ことをテストで固定する
  (spec.md Requirement「後出しがある round では stderr に要約を出す」)。
- `computeFindingRecency` が `readRevisionContent` 未実装の runtimeStrategy で全 finding を
  `indeterminate` に倒すことをテストで固定する。

## T-05: journal 記録種別と store append を追加する

- [ ] `src/store/event-journal.ts` に `FindingRecencyRecord` を追加する:
      `{ type: "finding-recency"; step: string; ts: string; iteration: number;
      priorOid: string | null; findings: { file: string; line?: number; title: string;
      severity: FindingSeverity; recency: "late" | "not-late" | "indeterminate" }[] }`。
      `EventRecord` union に追加する。
- [ ] `fold()` に `finding-recency` 行の dispatch を追加し、`FoldResult` に optional
      field `findingRecency?: FindingRecencyRecord[]` を追加して収集する。`fold()` は
      本 field を常に populate する。既存 FoldResult リテラル (`src/store/job-journal.ts`
      の ENOENT branch、`src/store/job-state-projection.ts` の初期値) は optional のため
      無改変で通る。projection は本 field を state に materialize しない (lineage と同様)。
- [ ] `src/store/job-journal.ts` `JobJournal.appendFindingRecency(record)` を実装する
      (`appendEventRecord` 経由、`appendLineage` と同一形)。
- [ ] `src/store/job-state-store.ts` `JobStateStore.appendFindingRecency(record)` を
      `this._journal.appendFindingRecency` へ委譲する形で追加する。
- [ ] `src/store/__tests__/` に fold の finding-recency 収集テストと append の
      round-trip テストを追加する。

**Acceptance Criteria**:
- `finding-recency` 行を含む `events.jsonl` を `fold()` すると
  `findingRecency` に per-finding 判定を持つ record が復元されることをテストで固定する。
- `finding-recency` record の append が state.json / NormalizedJobState を変更しない
  (journal-only) ことをテストで固定する。
- 未知 type の journal 行が既存どおり無視される前方互換テストが無改変で green。

## T-06: spec-review 完了に後出し検出を配線する (verdict 不変)

- [ ] `src/core/step/commit-orchestrator.ts` の `applySuccessPostPersistEffects` に、
      lineage の後段で best-effort ブロックを追加する。gate は
      `step.name === STEP_NAMES.SPEC_REVIEW && deps.runtimeStrategy && deps.cwd`。
- [ ] このブロックは (post-persist の) `state.steps[step.name]` から
      iteration (= 配列長) と前 round の commitOid (= 末尾から 2 番目の StepRun の
      `commitOid ?? null`) を解決し、findings は `result.completion.persistToolResult
      .findings` から取得して `origin === "scope"` を除外する。
- [ ] `recordFindingRecency` を呼ぶ。呼び出し全体を try/catch で囲み例外を握り潰す
      (best-effort、lineage と同じ扱い)。iteration<2 の gate は `recordFindingRecency`
      内部に委譲する。
- [ ] `step-completion.ts` (verdict 導出) / `judge-verdict.ts` / verifyFindingRefs 呼び
      出しブロックは無変更のままとする。
- [ ] `STEP_NAMES` の import を commit-orchestrator に追加する (未 import の場合)。
- [ ] verdict 不変を固定するテストを追加する: late に分類される finding を含む
      iteration 2 の spec-review 完了で、後出し検出が `appendFindingRecency` (+ 該当時
      stderr) 以外の store 書き込みを行わず、当該 round の verdict が後出し検出の有無に
      依らず同一であること。

**Acceptance Criteria**:
- 後出し検出が verdict / escalationReason を変更しないことをテストで固定する
  (late な finding を含む round でも verdict は既存導出と同一) (受け入れ基準 4)。
- iteration 1 の spec-review 完了で後出し検出が実行されない (append されない) ことを
  テストで固定する (受け入れ基準 5)。
- `deriveStepCompletion` / `judge-verdict` / finding-ref 実在検証の既存テストが無改変で
  green (verdict 導出無変更の証明)。

## T-07: 全体検証

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green。

**Acceptance Criteria**:
- `typecheck && test` が green (受け入れ基準 6)。
- 既存の prompt drift-guard / judge-verdict / step-completion / event-journal テストが
  無改変で green (回帰なし)。
