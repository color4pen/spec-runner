# Conformance Result — spec-review-full-enumeration — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Reviewed Against

- **rules.md**: identity priming 確認
- **tasks.md**: T-01〜T-07 全チェックボックス [x] 確認
- **design.md**: D1–D5 確認
- **spec.md**: 6 Requirements / 7 Scenarios 確認
- **request.md**: 受け入れ基準 6 件確認
- **git diff main...HEAD --stat**: 39 files, +4965 / -6

## 検証した項目

### 1. spec.md Requirements vs. Implementation

**Requirement: spec-review prompt は finding の全量列挙を要求する**

`src/prompts/spec-review-system.ts` line 49 に Method 節の番号付き項目 5 として「全量列挙の規律」を追記。「全量列挙」「小出し」「後出し」の 3 語を含む。新規 h2 見出しを導入せず既存 5 節骨格（Question / Contract / Method / Evidence / Completion）を保持している。

Scenario「Method 節に全量列挙規律が含まれる」は `extractSection` / `extractMethodSection` による節抽出テストで固定（`src/prompts/__tests__/spec-review-full-enumeration-prompt.test.ts` TC-001、`tests/prompts/spec-review-system.test.ts` TC-001）。✅

**Requirement: 後出し判定は純関数として 3 値を返す**

`src/core/step/finding-recency.ts` の `classifyFindingRecency(targetLineContent, priorFileContent)` が副作用なしの純関数として実装。D4 の 4 ステップ判定ルール（null チェック → trim 空白チェック → 全行走査）に準拠。

- Scenario「前 revision に存在した記述 → late」: TC-002 ✅
- Scenario「fixer が書き足した記述 → not-late」: TC-003 ✅
- Scenario「判定不能はすべて indeterminate」: TC-004（targetLineContent null / priorFileContent null / 両方 null）✅
- 空白行 → indeterminate: TC-010 ✅

**Requirement: iteration 2 以上の spec-review 完了で後出し判定を journal に記録する**

`recordFindingRecency` が `iteration < 2` でガードし、`computeFindingRecency` → `store.appendFindingRecency` で 1 件 append を実行。前 round の commitOid は `state.steps["spec-review"]` の末尾から 2 番目 StepRun の `commitOid ?? null` から解決（`commit-orchestrator.ts` 内）。

Scenario「iteration 2 で per-finding の後出し判定が記録される」: TC-005（2 件 finding で `appendFindingRecency` 1 回呼び出し、late 1 件 / not-late 1 件）✅

**Requirement: iteration 1 では後出し判定を実行しない**

`recordFindingRecency` 先頭で `if (iteration < 2) return`。

Scenario「iteration 1 では finding-recency 記録が append されない」: TC-006 ✅

**Requirement: 後出し検出は verdict を変更しない**

配置: `commit-orchestrator.ts` の `applySuccessPostPersistEffects`（`store.persist(s)` の後段に best-effort ブロックとして配置）。`FindingRecencyStore` インターフェースが `appendFindingRecency` のみを公開するため、`recordFindingRecency` は verdict / state への書き戻し経路を構造的に持たない（D3）。

Scenario「late な finding を含む round でも verdict は不変」: TC-007（`appendFindingRecency` のみを持つ fake store で完了し、他の store メソッド呼び出しがないことを確認）✅

**Requirement: 後出しがある round では stderr に要約を出す**

`recordFindingRecency` が `lateCount > 0` のとき `stderrWrite` で件数内訳付き要約 1 行を出力。

- Scenario「late が 1 件以上で stderr 要約が出る」: TC-008 ✅
- late が 0 件のとき stderr に出さないこと: TC-017 ✅

### 2. 受け入れ基準 (request.md) の充足

| # | 受け入れ基準 | テスト | 状態 |
|---|-------------|--------|------|
| 1 | prompt Method 節に全量列挙規律を **節抽出** テストで固定 | TC-001（2 ファイル） | ✅ |
| 2 | 純関数 3 値: late / not-late / indeterminate をテストで固定 | TC-002, 003, 004, 010 | ✅ |
| 3 | iteration 2 で per-finding の後出し判定が journal に記録されることをテストで固定 | TC-005 | ✅ |
| 4 | verdict/escalationReason 不変をテストで固定 | TC-007 + D3 構造保証 | ✅ |
| 5 | iteration 1 で後出し検出が実行されないことをテストで固定 | TC-006 | ✅ |
| 6 | `typecheck && test` が green | verification-result.md（全フェーズ passed） | ✅ |

### 3. design.md 設計判断の実装確認

| 決定 | 確認 |
|------|------|
| D1: prompt 規律 + 後出し検出の二層 | spec-review-system.ts (行動層) + finding-recency.ts (検出層) で分離 ✅ |
| D2: 観測信号に留め verdict を変えない | journal append + stderr のみ。verdict 変更 API なし ✅ |
| D3: post-persist best-effort として配置 | `commitSuccess` の `store.persist(s)` 後段で `applySuccessPostPersistEffects` を呼ぶ ✅ |
| D4: 純関数 + 配線 + runtime seam の 3 分解 | `classifyFindingRecency` / `computeFindingRecency` + `recordFindingRecency` / `readRevisionContent` ✅ |
| D5: journal-only EventRecord | `FindingRecencyRecord` が `EventRecord` union に追加。`fold()` で収集。state.json には materialize しない ✅ |

### 4. runtime seam 実装

- `RuntimeStrategy` に optional `readRevisionContent?` を追加（port layer、test fake が省略可能）✅
- `RealRuntimeStrategy` に required `readRevisionContent` を追加（compile-time enforcement）✅
- `LocalRuntime.readRevisionContent`: fs 読み（current）+ `git show <oid>:<file>`（prior）、never throw ✅
- `ManagedRuntime.readRevisionContent`: getRawFile（current）+ null（prior、OID 解決不能）、never throw ✅

### 5. journal 機構

- `FindingRecencyRecord` が `event-journal.ts` の `EventRecord` union に追加 ✅
- `fold()` が `finding-recency` type を dispatch し `findingRecency?: FindingRecencyRecord[]` に収集。既存 FoldResult リテラルは optional field のため無改変で通る ✅
- `JobJournal.appendFindingRecency` → `appendEventRecord` 経由で events.jsonl に append ✅
- `JobStateStore.appendFindingRecency` → `this._journal.appendFindingRecency` に委譲 ✅
- TC-019（fold 収集）、TC-020（state への materialize なし）、TC-021（未知 type 前方互換）✅

### 6. scope finding 除外

`commit-orchestrator.ts` line 279–281 で `origin === "scope"` の finding をフィルタして `agentFindings` を構成し、`recordFindingRecency` に渡す。TC-022（spec-review-scope-exclusion.test.ts）で検証 ✅

### 7. tasks.md チェックボックス

T-01 〜 T-07 の全チェックボックス: すべて [x] ✅

## 検証できなかった項目

None

## Findings 詳細

None
