# Cross-Boundary Invariants Review Result

## 検証した項目

### 新経路の列挙

diff が導入した新経路を全列挙し、各経路で隣接機構の前提が保たれるかを検証した。

**経路 1: commitSuccess → applySuccessPostPersistEffects → 後出し検出ブロック (spec-review, iteration >= 2)**

- ゲート: `step.name === STEP_NAMES.SPEC_REVIEW && deps.runtimeStrategy && deps.cwd && iteration >= 2`
- `state` は `projectSuccess` 適用後（`pushStepResult` で当該 StepRun 追加済み）の `s` を受け取る
- `stepRuns = state.steps?.[step.name] ?? []` で StepRun 配列を取得
- `iteration = stepRuns.length`（= 当該 run を含む総数）— 配列長は `projectSuccess` 後に確定済み
- `priorOid = stepRuns[stepRuns.length - 2]?.commitOid ?? null`（末尾 -2 = 前 round の StepRun）
- `recordFindingRecency` → `appendFindingRecency` (events.jsonl append のみ) → `stderrWrite` (stderr のみ)
- `verdict:parsed` emit は finding-recency ブロックの後（順序不変）

**経路 2: commitRound → applySuccessPostPersistEffects (成功 member 全員)**

- `applySuccessPostPersistEffects` は全 member の StepRun が fold されてから呼ばれる
- `step.name === STEP_NAMES.SPEC_REVIEW` ゲートが commitRound 経由でも評価される
- spec-review は逐次ステップで parallel round の member にはなれない（パイプライン設計不変条件）
- → このゲートが commitRound 経路で起動することは現行パイプラインでは発生しない

**経路 3: recordFindingRecency の失敗パス**

- `try { await recordFindingRecency(...) } catch { /* best-effort */ }` — 例外は握り潰し
- `lineage` と同一 best-effort 層。step 完了を妨げない不変条件が保たれる

**経路 4: iteration 1 での非起動**

- `applySuccessPostPersistEffects` 内 `if (iteration >= 2)` ゲート + `recordFindingRecency` 内 `if (iteration < 2) return` 二重ガード
- 冗長だが安全側: どちらかで止まる

---

### 隣接機構の不変条件検証

#### ① verdict 導出不変条件（最重要）

- `step-completion.ts` はdiffに含まれない（変更ゼロ）
- `deriveStepCompletion`・`judge-verdict.ts`・`verifyFindingRefs` 呼び出しブロックは無変更
- 後出し検出は `store.persist(s)` の**後**、`verdict:parsed` emit の**前**に走る
- `recordFindingRecency` は `store.appendFindingRecency`（events.jsonl append） と `stderrWrite` のみを呼ぶ
- 検索結果: `outcome.commitOid`・`state.error`・`state.step`・`s.branch` 等の verdict 関連フィールドへの書き戻し経路ゼロ
- **不変条件保持: 確認**

#### ② ジャーナルカウンタ不変条件

- `events.jsonl` に `finding-recency` レコードが追加されるが、`_journal.historyCount` / `_journal.stepCounts` はいずれも `finding-recency` をカウントしない
- `persist()` の counterReversal 検出（`detectCounterReversal`）は `historyCount` + `stepCounts` のみを比較 — finding-recency は透過
- `fold()` の `historyCount` / `stepCounts` も `finding-recency` 行を無視して計算（`findingRecencyRecords` に収集するだけ）
- `finding-recency` レコードが journals に介挟されても `persist()` の delta 計算・counter 比較に影響しない
- **不変条件保持: 確認**

#### ③ journal-only 記録の不変条件（state.json 非侵食）

- `appendFindingRecency` は `appendEventRecord`（`fs.appendFile`）のみ呼ぶ
- `state.json` の `atomicWriteJson` 呼び出し経路を通らない（`persist()` を呼ばない）
- `NormalizedJobState` への materialize は `job-state-projection.ts` の折り畳みロジックが行わない（`findingRecency` は `fold()` 結果に収集されるが projection はそれを state フィールドに展開しない）
- **不変条件保持: 確認**

#### ④ `priorOid` 解決の正確性

- `applySuccessPostPersistEffects` が受け取る `state` は `projectSuccess` 適用後 → `steps["spec-review"]` に当該 StepRun が末尾追加済み
- `stepRuns[stepRuns.length - 2]?.commitOid` = 前 round StepRun のトップレベル `commitOid` フィールドを読む
- `StepRun.commitOid` は `pushStepResult` が `partial.commitOid` から設定する（トップレベル）
- `stepRunToRecord` が `run.commitOid`（トップレベル）を journal に書き出し、`fold()` がトップレベルで復元する — round-trip 保持

- `spec-review` は **read-only step**（write-set = 結果ファイルのみ）なので `finalizeStepArtifacts` がコミットする内容はレビュー対象ファイルを含まない
- → `current` を worktree の cwd/file から読むタイミング（`applySuccessPostPersistEffects`）において、レビュー対象ファイルの内容はエージェントが読んだ内容と一致する
- **不変条件保持: 確認**

#### ⑤ `commitRound` での `verdict:parsed` emit 順序

- `commitRound` の step 4 ループで `applySuccessPostPersistEffects` を呼び、最後に `skippedEntries` の `verdict:parsed` を emit する構造は変更なし
- finding-recency ブロックが spec-review gate 付きで `commitRound` 経由でも走りうるが、spec-review は逐次ステップなので現行パイプラインでは発生しない
- **不変条件保持: 確認**

---

### 観察事項（blocks なし）

**観察 A: `StepOutcome.commitOid` フィールドの journal round-trip 非保存**

`src/state/schema/types.ts` に `StepOutcome.commitOid?` が追加された（コメント: "Alternative storage site for commitOid… to support test construction patterns"）。

既存の `stepRunToRecord` は `outcome.commitOid` を journal レコードに書き出さない（`StepAttemptRecord.outcome` に対応フィールドがない）。また `fold()` も復元しない。`pushStepResult` も `outcome.commitOid` を設定しない。

結果: `StepOutcome.commitOid` を手動でセットして `persist()` → reload した場合、値は失われる。`spec-review-scope-exclusion.test.ts:150` でテスト構築時に `outcome.commitOid = PRIOR_COMMIT_OID` と記述しているが、`applySuccessPostPersistEffects` は `stepRuns[n-2]?.commitOid`（トップレベル）を読むため、テストが `recordFindingRecency` mock に渡す `priorOid` は `null` になる（`recordFindingRecency` は mock 済みのため不合格にはならない）。

この不整合は現行テストでは顕在化しないが、`StepOutcome.commitOid` を「意味のある設定先」として扱うコードが将来追加された場合に伏在バグになりうる。現行ではブロッキングではない。

**観察 B: `FindingRecencyRecord` の二重定義**

`finding-recency.ts` と `event-journal.ts` に同名・同構造の `FindingRecencyRecord` が存在する。TypeScript の structural typing で現状は互換だが、一方だけを変更した場合に型エラーが出ない経路がある（`JobStateStore.appendFindingRecency` の引数型と `FindingRecencyStore.appendFindingRecency` の引数型は別名の同構造型）。既存の他 journal レコード（`LineageRecord`, `OperatorEventRecord`）は `event-journal.ts` 一箇所で定義される規律に反する。現行ではブロッキングではない。

---

## 検証できなかった項目

なし。

## Findings 詳細

（needs-fix 相当の findings なし）

