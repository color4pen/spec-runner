# Cross-Boundary Invariants Review — issue-request-fidelity-gate — iter 4

## Scope

- **Reviewer**: cross-boundary-invariants
- **Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する
- **Iteration**: 4（iter 3 の持ち越し findings 確認 + iter 4 追加コードの確認）

## Checked paths（iter 4）

### iter 4 での主要変更

- `tests/unit/core/command/runner-fidelity-gate.test.ts` — 819 行、TC-001〜031 の gate integration / regression テスト群
- `tests/unit/core/gate/issue-fidelity-gate.test.ts` — 376 行、gate 評価ロジック unit テスト（TC-022〜025 + orchestrator edge cases）
- `tests/unit/errors/issue-fidelity-error-codes.test.ts` — 83 行、ERROR_CODES 存在と FATAL_ERROR_CODES 非包含（TC-014）
- `tests/unit/core/port/issue-fidelity-comparator-layering.test.ts` — 66 行（TC-028）
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts` — 108 行（TC-018）
- `tests/unit/state/inbox-origin-schema.test.ts` — 121 行（TC-015/TC-016）
- `tests/unit/core/command/pipeline-run-inbox-origin.test.ts` — 145 行（TC-017）

### iter 1/2/3 から継続確認

- `src/core/command/runner.ts` — gate 挿入点・halt state 構築・teardown 経路
- `src/core/gate/issue-fidelity-gate.ts` — gate 評価ロジック・error コード割り当て
- `src/core/command/resume.ts` — checkConsecutiveEscalations / startStep 解決経路
- `src/errors.ts` — FATAL_ERROR_CODES 非包含
- `src/state/lifecycle.ts` — transitionJob・VALID_TRANSITIONS
- `src/core/resume/safety.ts` — checkConsecutiveEscalations 実装
- `src/cli/run.ts` / `src/cli/resume.ts` — comparatorFactory 注入

---

## iter 3 findings の対処状況

### CBI-004 [LOW] → **STILL OPEN**

`ISSUE_FETCH_FAILED` code が wiring error / readRequestMd 失敗 / comparator throw にも使用され続けており、iter 3 から変化なし。詳細は下記 Finding CBI-004 を参照。

### OBS-5 → **STILL OPEN**

TC-028 番号衝突が未解消。iter 3 から変化なし。詳細は下記 OBS-5 を参照。

---

## Finding CBI-004 [LOW]: `ISSUE_FETCH_FAILED` code overloading（iter 2 持ち越し、iter 4 再確認）

### 経路再構成

`issue-fidelity-gate.ts` の halt step 4 / 5 / 7 がいずれも `ERROR_CODES.ISSUE_FETCH_FAILED` を返す:

```typescript
// step 4: comparator undefined (wiring error)
{ kind: "halt", code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error", ... }
// step 5: readRequestMd() throws
{ kind: "halt", code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error", ... }
// step 7: comparator throws
{ kind: "halt", code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error", ... }
```

`runner.ts` は `error: { code: gateDecision.code, ... }` を state に格納する。`haltKind` は runner の hint 文字列分岐に使われるが `ErrorInfo` schema (`types.ts`) には保存されない（`code` / `message` / `hint` のみが `ErrorInfo`）。

**機能的影響の範囲**:
- `FATAL_ERROR_CODES` に含まれないことは確認済み（TC-014 で機械固定）。resume 可能であることは変わらない
- `handleResult()` は `error.code` を `SPEC_REVIEW_RESULT_NOT_FOUND` 以外に特別扱いしない（routing なし）
- hint 分岐は `haltKind` に基づき正しい文字列を設定している
- ただし `handleResult` の `awaiting-resume` 分岐で `error.hint` は CLI に表示されないため、hint 内容は operator が state.json を直接参照しないと確認できない

**operator への影響**:
- wiring error（DI 欠落）/ readRequestMd 失敗 で `state.error.code === "ISSUE_FETCH_FAILED"` を見ると「GitHub API / network 障害」と誤診する可能性がある
- `error.message` / resumePoint.reason に実際のエラー文字列（"comparator not injected" 等）は含まれるため診断可能だが間接的

**iter 4 変化**: なし。code overloading は設計上の gap のまま。テストは `haltKind === "internal-error"` を検証しているが `code` フィールドを検証していない。

---

## OBS-5: TC-028 番号衝突（iter 2 持ち越し、iter 4 再確認）

| ファイル | TC-028 の内容 |
|---------|--------------|
| `tests/unit/core/port/issue-fidelity-comparator-layering.test.ts` | "IssueFidelityComparator port が core 層に閉じる（adapter を import しない）" |
| `tests/unit/core/command/runner-fidelity-gate.test.ts` | "gate halt が checkConsecutiveEscalations カウンタを消費しない" |

`runner-fidelity-gate.test.ts` の TC-028 は test-cases.md に対応する TC 番号エントリがない（後者は test-cases.md 内の TC-029 "カウンタ非消費" に対応する内容）。vitest はテスト名文字列で識別するため実行上の問題はない。将来の TC 追加時に番号体系が混乱する可能性がある。

**iter 4 変化**: なし。

---

## iter 4 新規コードの cross-boundary 確認

### runner-fidelity-gate.test.ts の新規テスト群（TC-026〜031）

**TC-026（破壊確認）**: gate が halt を返したとき `pipeline.run` が呼ばれないことをアサート。sabotage として halt 分岐を無効化した場合に FAIL する構造。機械歯として有効。✓

**TC-027（escalation comment）**: gate halt 時に `createIssueComment` が linked issue に対して呼ばれることを確認。`notifyJobTerminal` 経路の既存不変条件（issueNumber あり → escalation comment 書き込み）を維持している。✓

**TC-029（カウンタ非消費）**: gate halt を 3 回繰り返しても `state.steps["request-review"]` が空のまま `checkConsecutiveEscalations` は `false` を返す。`--force` 不要の挙動を機械固定。`checkConsecutiveEscalations` の `state.steps?.["request-review"]` 参照が gate halt 後も空である（`transitionJob` の patch に StepRun 記録なし）ことを実際の persist → load で確認。✓

**TC-029（hint 分岐）**: `haltKind === "undeclared-drop"` のとき `state.error.hint` に "request.md を修正" を含む。`haltKind === "fetch-error"` のとき "GITHUB_TOKEN" を含む。`haltKind === "internal-error"` のとき "gate 内部エラー" を含む。✓

**TC-030 / TC-031**: fetch-error と internal-error の hint 文字列検証。上記と同様。✓

### 既存テスト群との相互作用確認

#### `checkConsecutiveEscalations` (safety.ts) への影響

gate halt は `transitionJob` の `patch` に `state.steps["request-review"]` エントリを追加しない。`transitionJob` は `{ ...updated, ...ctx.patch }` の浅いマージで新状態を作るため、patch に含まれないフィールド（`steps`）は元のまま保持される。TC-029 が 3 回の gate halt 後に `state.steps?.["request-review"]` が `undefined` であることをアサートしており、この不変条件は機械固定済み。✓

#### `resolveResumeStep` への影響

gate halt の `resumePoint.step = STEP_NAMES.REQUEST_REVIEW`。`ResumeCommand.prepare()` での `startStepForCheck = resumePoint?.step = "request-review"`。`checkConsecutiveEscalations(state, "request-review")` は `state.steps?.["request-review"]` を見て false を返す（TC-029 固定）。`resolveResumeStep(undefined, resumePoint, ...)` は `resumePoint.step = "request-review"` を返す。したがって resume 時に `startStep = "request-review"` となり gate が再評価される。✓

#### `transitionJob` / `VALID_TRANSITIONS` への影響

- gate halt: `running → awaiting-resume`（VALID_TRANSITIONS に含まれる）✓
- resume で state を `awaiting-resume → running` に遷移させてから pipeline 実行（gate が再 halt した場合: `running → awaiting-resume`）✓

#### `inboxOrigin` フィールドの `transitionJob` 越え保持

`transitionJob` の patch に `inboxOrigin` が含まれないため、`{ ...updated, ...ctx.patch }` でフィールドは保持される。inbox job の resume でも `state.inboxOrigin === true` が維持され gate が skip される。TC-015 / TC-016 で roundtrip 保持を機械固定済み。✓

#### `comparatorFactory` 注入の wiring 確認

- `src/cli/run.ts`: `new PipelineRunCommand(..., (config) => createIssueFidelityComparator(config))` ✓
- `src/cli/resume.ts`: `new ResumeCommand(..., (config) => createIssueFidelityComparator(config))` ✓
- `src/core/inbox/run-inbox.ts` の `resumeJob`: `runResumeCore` を経由しており comparatorFactory が注入される ✓
- `createIssueFidelityComparator` はファクトリ呼び出し時点で throw しない（lazy import + object 返却）。gate が applicable でない場合（issueNumber なし / inboxOrigin / startStep ≠ request-review）は `compare()` が呼ばれないため SDK ロードも発生しない ✓

#### 非伝播不変条件の確認

`issue.body` の伝播経路:
1. `getIssue()` → `issue.body` をローカル変数に保持
2. `comparator.compare({ issueBody: issue.body, ... })` → comparator 内部で ephemeral 使用
3. `comparison.undeclaredDrops` のみが gate の return 値に現れる
4. `GateDecision.reason` は `undeclaredDrops` の文字列リストを展開したもの（`issue.body` を含まない）
5. `state.error.message` / `resumePoint.reason` には `gateDecision.reason` が格納（`issue.body` なし）
6. `state` / change folder に `issue.body` は一切保存されない

TC-005 / TC-002（sentinel 検出パターン）が pass / halt 両経路で `state` / change folder / pipeline args に sentinel が現れないことを確認。✓

注意点：LLM comparator が `undeclaredDrops` の要素として issue body の文言を verbatim 出力した場合、その文字列が `reason` に含まれる。これは prompt 制約（"issue 本文の丸写しをしない"）による mitigate のみで architecturally 未強制。この限界は design.md Risks に明記済み。

---

## Invariants confirmed（iter 4 確認分）

| 不変条件 | 確認 | 固定テスト |
|---------|------|-----------|
| gate halt 時に pipeline step が一つも実行されない | ✓ | TC-002, TC-026（破壊確認） |
| gate halt が `checkConsecutiveEscalations` カウンタを消費しない | ✓ | TC-029 |
| halt 後 resume で gate が再評価される | ✓ | TC-011（TestCommand 経由） |
| inboxOrigin が transitionJob 越えで保持される | ✓ | TC-015, TC-016 |
| comparatorFactory が run / resume 両経路で注入される | ✓ | TC-017, TC-018 確認 |
| ISSUE_FIDELITY_UNDECLARED_DROP / ISSUE_FETCH_FAILED が FATAL_ERROR_CODES 外 | ✓ | TC-014 |
| gateway halt 時に notifyJobTerminal が linked issue に comment を書く | ✓ | TC-027 |
| issue 本文が state / change folder / pipeline args に残らない | ✓ | TC-002（sentinel）, TC-005 |
| `--issue` なし run で gate も fetch も不発火 | ✓ | TC-006 |
| inbox 経路で gate skip・理由 log に残る | ✓ | TC-007 |
| fetch 失敗が pass 扱いにならず halt | ✓ | TC-008 |
| `getIssue` adapter が 200/404/401 を正しく処理 | ✓ | TC-001（github-client テスト） |
| hint 分岐が haltKind に応じた文字列を設定 | ✓ | TC-029, TC-030, TC-031 |

## Invariants confirmed（iter 1/2/3 より維持）

| 不変条件 | 結果 |
|---------|------|
| FATAL_ERROR_CODES 非包含 | ✓ |
| `awaiting-resume` からの resume 遷移（VALID_TRANSITIONS） | ✓ |
| resume 経路での gate 再評価 | ✓ |
| 非伝播（GateDecision / log に issue body なし） | ✓ |
| `transitionJob` によって `issueNumber` / `inboxOrigin` が保持される | ✓ |
| port が adapter を import しない（layering 不変条件）| ✓ |
