# Tasks: custom reviewer に周回知識(前周 findings・operator 裁定)を注入する

## T-01: OperatorAdjudication レコード型と JobState 永続化基盤を追加する

- [ ] `src/state/schema/types.ts` に `OperatorAdjudication` interface を追加する:
      `{ text: string; step: string; recordedAt: string }`（自由記述 + 対象 step + ISO 8601 時刻）。
- [ ] `JobState` に optional top-level field `operatorAdjudications?: OperatorAdjudication[]` を追加する。
      doc コメントで「issue-comment 由来の `decisions` とは別。自由記述の operator 裁定を append-only で
      記録。backward compat: 不在は空 ledger 扱い」を明記する。
- [ ] `src/state/schema/operations.ts` に pure helper `appendOperatorAdjudication(state, record)` を追加する
      （`appendSynthesizedCommit` と同型: 既存配列に record を append した新 state を返す。I/O なし）。
- [ ] `validateJobState`（operations.ts）に `operatorAdjudications` の lightweight 検証 block を追加する
      （`reviewerStatuses` / `biteEvidence` の検証と同型: 存在時は配列であること、各 entry の
      `text` / `step` / `recordedAt` が string であること。不在はエラーにしない）。

**Acceptance Criteria**:
- `OperatorAdjudication` と `operatorAdjudications` field が型として存在し、`typecheck` が通る。
- `appendOperatorAdjudication` が既存 state を変更せず、append 済みの新 state を返す（配列不在時は 1 要素配列を作る）。
- `operatorAdjudications` を含む JobState が `JSON.stringify` → `validateJobState` の round-trip で保持される。
- 不正な `operatorAdjudications`（非配列 / entry の必須 field 欠落）で `validateJobState` が throw する。

## T-02: DynamicContext に custom reviewer 専用の 2 field を追加する

- [ ] `src/git/dynamic-context.ts` の `DynamicContext` interface に以下を追加する（inline structural type、
      cross-layer import なし。既存 `priorRoundContext` / `postFixContext` の doc スタイルに合わせる）:
  - `customReviewerPriorRound?: { findings: { severity: string; resolution: string; file: string; title: string }[]; changedFiles: string[] }`
  - `operatorAdjudicationContext?: { adjudications: { text: string; step: string; recordedAt: string }[]; decisions: { step: string; title: string; file: string; selectedOption: string; consequence: string; rationale: string }[] }`
- [ ] 両 field の doc コメントに「custom reviewer の prepareRoundContext が populate。in-memory only、
      state/journal へ非永続。他 step では absent」を明記する。
- [ ] `collectDynamicContext` は変更しない（両 field は prepareRoundContext 経由でのみ付与される）。

**Acceptance Criteria**:
- 2 field が optional として型に存在し、`typecheck` が通る。
- `collectDynamicContext` の戻り値には両 field が付与されない（既存挙動不変）。

## T-03: 導出と block 構築モジュール custom-reviewer-round-context.ts を新設する

- [ ] `src/core/step/custom-reviewer-round-context.ts` を新設する。prior-round-context.ts /
      post-fix-context.ts の「pure block builder + async derivation(port 背後 I/O)」構成を踏襲する。
- [ ] `deriveCustomReviewerPriorRound(params: { state, reviewerName, iteration, cwd, runtimeStrategy })`
      を実装する:
  - iteration < 2 → null。
  - `getLatestJudgeFindings(state, reviewerName)`（fixer-helpers.ts の既存 export）が null → null（前周 findings 欠落）。
  - `runtimeStrategy?.listCommitChangedFiles` 不在 → null。
  - 前周 round endedAt = `state.steps[reviewerName]` 末尾 run の endedAt を解決する。
  - `resolveCodeFixerRounds(state)`（post-fix-context.ts の既存 export を import 再利用）で得た
    `{commitOid, endedAt}[]` を endedAt > 前周 endedAt で filter し、各 commitOid の
    `listCommitChangedFiles` 結果を union する。1 件でも非 success or throw なら null（all-or-nothing）。
  - 成功時は `{ findings, changedFiles }`（findings は projection、changedFiles は重複除去済み union）を返す。
  - 例外を投げない（内部 try/catch で null に degrade）。
- [ ] `buildCustomReviewerPriorRoundBlock(ctx)` を実装する（pure）: `<prior-round-context>` XML タグで囲み、
      前周 findings（空なら「前周指摘なし」）、変更 file（空なら「変更なし(machine-derived)」）、
      再指摘プロトコル（対象 file を Read で読み直す / 再指摘には rationale を明示 / 全量列挙を維持）を含む。
- [ ] `deriveOperatorAdjudicationContext(state)` を実装する（pure・no I/O）:
      `state.operatorAdjudications ?? []` と `state.decisions ?? []` を projection する
      （decisions は step / finding.title / finding.file / selectedOption.label / selectedOption.consequence /
      finding.rationale を抽出）。両方空なら null。いずれか非空なら `{ adjudications, decisions }` を返す。
      `DecisionRecord.resumeComment` は projection に含めない（`operatorAdjudications[*].text` と
      内容が重複するため除外。operator の裁定文は `text` field 経由で注入される）。
- [ ] `buildOperatorAdjudicationBlock(ctx)` を実装する（pure）: `<operator-adjudication>` XML タグで囲み、
      各裁定/decision を step ラベル付きで列挙し、「裁定済み事項を再指摘する場合は裁定 rationale への
      反論を明示せよ」プロトコル text を含む。
      `operatorAdjudications[*].text` および decisions 由来の text フィールド（title / rationale 等）は
      XML タグ内に埋め込む前に XML 特殊文字をエスケープする（`<` → `&lt;`、`>` → `&gt;`、`&` → `&amp;`）。

**Acceptance Criteria**:
- 4 関数が export され `typecheck` が通る。
- `deriveCustomReviewerPriorRound` が iteration<2 / 前周 findings null / listCommitChangedFiles 不在 /
  diff 失敗のいずれでも null を返し、throw しない。成功時に `{findings, changedFiles}` を返す。
- `deriveOperatorAdjudicationContext` が両 ledger 空で null、いずれか非空で projection を返す。
- 各 block builder の出力が対応する XML タグで囲まれ、規律プロトコル text を含む。

## T-04: custom-reviewer.ts に prepareRoundContext を実装し message に block を注入する

- [ ] `src/core/step/custom-reviewer.ts` の `createCustomReviewerStep` が返す step object に
      `prepareRoundContext(state, cwd, runtimeStrategy)` を実装する（`snapshot.name` を closure 参照）:
  - `iteration = nextIteration(state, snapshot.name)` を算出する。
  - `deriveCustomReviewerPriorRound(...)` と `deriveOperatorAdjudicationContext(state)` を呼ぶ。
  - 得られた非 null 値を `{ customReviewerPriorRound?, operatorAdjudicationContext? }` に載せて返す。
    両方 null なら null を返す（seam は null を no-op として扱う）。
- [ ] `buildCustomReviewerMessage` を拡張し、`opts.dynamicContext?.customReviewerPriorRound` があれば
      `buildCustomReviewerPriorRoundBlock` を、`opts.dynamicContext?.operatorAdjudicationContext` があれば
      `buildOperatorAdjudicationBlock` を、既存 `contextSection` / `constraintsSection` と並べて
      user message に append する。
- [ ] `buildMessage` は既存どおり `deps.dynamicContext` を `buildCustomReviewerMessage` に渡す
      （seam が enrich 済みの dynamicContext を deps 経由で届ける。追加配線は不要）。

**Acceptance Criteria**:
- `createCustomReviewerStep(...).prepareRoundContext` が関数として存在する。
- iteration ≥ 2 + 前周 findings + fixer commit のある state で、buildMessage 出力が前周 context block を含む。
- iteration 1 の state で、buildMessage 出力が前周 context block を含まない。
- operatorAdjudications / decisions が存在する state で、buildMessage 出力が operator 裁定 block を含む。
- 両 ledger 空の state で、buildMessage 出力が operator 裁定 block を含まない。

## T-05: job resume --prompt の内容を JobState に永続化する

- [ ] `src/core/command/resume.ts` の `prepare()` で、`transitionJob()` の戻り値 `transitioned` を取得した
      直後（worktree / no-worktree 両 path の `persist()` 呼び出しより前）に、
      `this.options.prompt` が非空文字列なら
      `appendOperatorAdjudication(transitioned, { text: this.options.prompt, step: startStep, recordedAt: new Date().toISOString() })`
      を適用し、戻り値を `stateToWrite` に代入する。prompt が空の場合は `stateToWrite = transitioned`。
- [ ] 既存の persist 経路（worktree path の `runStore.persist(transitioned)` / no-worktree path の
      `noWorktreeStore.persist(transitioned)`）を `persist(stateToWrite)` に置き換える。
      persist ブロック末尾の `updatedState = transitioned` は `updatedState = stateToWrite` に変更する。
      これにより最初の「running」遷移 persist が裁定込みの state を 1 回にまとめて書き出す。
- [ ] 既存の one-shot deps 注入（`resumePrompt: this.options.prompt` → pipeline.ts の `<resume-context>`）は
      変更しない（永続化は追加のみ）。

**Acceptance Criteria**:
- `job resume --prompt "<text>"` 相当の呼び出し後、永続化された state に text/step/recordedAt を持つ
  裁定記録が 1 件追加される。
- prompt 無しの resume では裁定記録が増えない。
- resume の one-shot deps 注入挙動（`deps.resumePrompt`）が従来どおり伝播する。

## T-06: テストを追加して受け入れ基準を固定する

- [ ] `src/core/step/__tests__/custom-reviewer-round-context.test.ts`（新規）: T-03 の 4 関数を単体で固定する
      （derive の各 degrade 分岐、block の XML タグ / 規律 text）。fake runtimeStrategy で
      listCommitChangedFiles の success / unavailable / throw を注入する。
- [ ] `src/core/step/__tests__/custom-reviewer-step.test.ts`（既存に追記）:
  - iteration ≥ 2 の buildMessage に前周 context block（findings projection + 変更 file + 再指摘プロトコル）が
    含まれること、iteration 1 では含まれないこと。
  - operatorAdjudications / decisions のある state で裁定 block が含まれ、両空で含まれないこと。
  - `prepareRoundContext` が iteration<2 / 導出失敗で null を返し throw しないこと。
- [ ] `src/state/__tests__/`（新規または既存に追記）: `appendOperatorAdjudication` の pure 挙動と
      `validateJobState` の round-trip / 不正入力 throw を固定する。
- [ ] `src/core/command/__tests__/`（resume 系テストに追記または新規）: `--prompt` 付き resume で state に
      裁定記録が永続化されること、`--prompt` 無しで増えないことを固定する。

**Acceptance Criteria**:
- 上記テストが追加され、`bun run typecheck && bun run test` が green。
- 受け入れ基準の各項目（iteration≥2 注入 / iteration1 非注入 / 導出失敗 degrade / resume 永続化 /
  裁定 block 注入・空時非注入）に対応するテストが少なくとも 1 件ずつ存在する。
