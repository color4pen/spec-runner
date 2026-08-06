# Cross-Boundary Invariants Review — issue-request-fidelity-gate — iter 3

## Scope

- **Reviewer**: cross-boundary-invariants
- **Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する
- **Iteration**: 3（iter 2 findings の対処状況確認 + 新規コード追加の確認）

## Checked paths（iter 3）

### iter 3 での変更点

- `specrunner/changes/issue-request-fidelity-gate/design.md` — Risks セクション更新（CBI-003 修正）
- `src/core/inbox/draft-writer.ts` — `writeDraft` を独立モジュールとして抽出（新規 12 行）
- `src/core/inbox/run-inbox.ts` — `writeDraft` import + `inboxOrigin: true` wiring（4 行変更、T-05 完成）
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts` — inbox origin 伝播の単体テスト（108 行新規）
- `tests/unit/inbox/draft-writer.test.ts` — draft-writer 単体テスト（29 行新規）
- `tests/unit/state/inbox-origin-schema.test.ts` — inboxOrigin schema 確認テスト（121 行新規）
- `tests/unit/core/command/pipeline-run-inbox-origin.test.ts` — PipelineRunCommand.prepare の inboxOrigin 設定確認（145 行新規）
- `tests/unit/core/port/issue-fidelity-comparator-layering.test.ts` — port layering テスト（66 行新規、TC-028）

### iter 1 / iter 2 から継続確認

- `src/core/command/runner.ts` — gate 挿入点・halt state 構築・teardown 経路
- `src/core/gate/issue-fidelity-gate.ts` — gate 評価ロジック・error コード割り当て
- `src/errors.ts` — FATAL_ERROR_CODES 非包含
- `src/state/lifecycle.ts` — transitionJob・VALID_TRANSITIONS
- `src/core/resume/safety.ts` — checkConsecutiveEscalations 実装
- `specrunner/changes/issue-request-fidelity-gate/design.md` — Risks セクション vs D2 整合性

---

## iter 2 findings の対処状況

### CBI-003 [LOW] → **RESOLVED**

**対処内容**: `design.md` Risks セクション（旧 line 261 付近）が iter 3 で更新された。

旧記述（iter 2 時点、D2 と矛盾していた）:
```
gate halt と request-review escalation が同一 step counter を消費
```

現在の記述:
```
gate halt は StepRun を記録せず `checkConsecutiveEscalations` のカウンタを消費しない（D2「カウンタ非消費」参照）。
operator は `--force` なしで何度でも request.md 修正 → resume を繰り返せる。`--force` は gate を迂回しない（fail-closed）ため、
反復は request.md 修正の正常な収束過程であり、3 回 gate halt 後も `--force` 不要（TC-028 で機械固定）。
```

D2 の「カウンタ非消費（意図した挙動）」との整合が取れた。TC-028（runner-fidelity-gate.test.ts）の機械固定とも一致。✓

### CBI-004 [LOW] → **STILL OPEN**

`ISSUE_FETCH_FAILED` code が wiring error / readRequestMd 失敗 / comparator throw にも使われ続けており、変化なし。詳細は下記 Finding CBI-004 を参照。

### OBS-5 → **STILL OPEN**

TC-028 番号衝突が未解消。詳細は下記 OBS-5 を参照。

---

## Finding CBI-004 [LOW]: `ISSUE_FETCH_FAILED` code overloading（iter 2 持ち越し）

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

`runner.ts` は `error: { code: gateDecision.code, ... }` を state に格納する。`haltKind` は runner の hint 文字列分岐に使われるが state.json には保存されない。

**operator が state.json を直接参照した場合**:
- `ISSUE_FETCH_FAILED` を見て「GitHub API / network 障害」と誤解する可能性がある
- wiring error（比較器が DI されていない）と実際の fetch 失敗が区別できない
- `error.hint` は区別されているが `handleResult` の awaiting-resume 分岐が hint を表示しないため CLI でも不可視

**機能的影響**: 低。すべてのケースが awaiting-resume（resume 可能）であり FATAL_ERROR_CODES 外であることは確認済み。operator は resume を繰り返すことが可能。診断コストが高いのみ。

---

## Finding OBS-5: TC-028 番号衝突（iter 2 持ち越し）

### 経路再構成

| ファイル | TC-028 の内容 |
|---------|--------------|
| `specrunner/changes/issue-request-fidelity-gate/test-cases.md` | "IssueFidelityComparator port が core 層に閉じる（adapter を import しない）" |
| `tests/unit/core/port/issue-fidelity-comparator-layering.test.ts` | "TC-028: IssueFidelityComparator port が core 層に閉じる（adapter を import しない）" |
| `tests/unit/core/command/runner-fidelity-gate.test.ts` | "TC-028: gate halt が checkConsecutiveEscalations カウンタを消費しない" |

test-cases.md の TC-028（port layering）に対応するテストは `comparator-layering.test.ts` が正しく実装している。`runner-fidelity-gate.test.ts` の TC-028 はカウンタ非消費を扱う別内容であり、test-cases.md に対応する TC 番号エントリがない。

**機能的影響**: なし。vitest はテスト名文字列で識別するため実行上の問題なし。将来の TC 追加時に番号体系が混乱する可能性がある。

---

## iter 3 新規追加コードの cross-boundary 確認

### `draft-writer.ts` 抽出（純粋リファクタリング）

`run-inbox.ts` が直接呼んでいた `write(repoRoot, slug, content)` を `writeDraft(repoRoot, slug, content)` に移譲。動作は同一。既存テスト（`orchestrator.test.ts` 等）は `writeDraft` を mock 可能になった。境界不変条件への影響なし。✓

### `inboxOrigin: true` wiring（run-inbox.ts T-05 完成）

```typescript
await runRunCore(draftPath, { cwd: repoRoot, issue: issueNumber, inboxOrigin: true });
```

`inboxOrigin: true` は `PipelineRunCommand.prepare()` → `jobState.inboxOrigin = true` → `workspaceOpts.bootstrapState` 経由で disk に永続化される。resume 経路では `transitionJob` の patch に `inboxOrigin` が含まれないため保持される。`run-inbox-inbox-origin.test.ts` が AC6 の runRunCore 引数を spy で機械固定。✓

### `pipeline-run-inbox-origin.test.ts`（TC-017）

`PipelineRunCommand.prepare()` が `inboxOrigin: true` option を受けて `jobState.inboxOrigin === true` を設定することを、fake runtime を使って検証している。gate が `jobState.inboxOrigin` を参照する経路（runner.ts 内）を間接的に保護。✓

---

## Invariants confirmed（iter 3 確認分）

| 不変条件 | 確認内容 | 結果 |
|---------|---------|------|
| design.md Risks と D2 の整合性 | Risks セクション更新で「カウンタを消費しない」と明示。D2「カウンタ非消費」と一致 | ✓ RESOLVED |
| `draft-writer.ts` 抽出の行動等価性 | `writeDraft` は `write` の thin wrapper（動作変化なし）。`draft-writer.test.ts` が確認 | ✓ |
| inbox 経路の `inboxOrigin` 伝播 | `runRunCore(…, { inboxOrigin: true })` → `jobState.inboxOrigin = true` → persist → load で保持 | ✓ |
| inbox 経路の gate skip 機械固定 | `run-inbox-inbox-origin.test.ts` が `inboxOrigin: true` 引数を spy で確認。gate は `inboxOrigin === true` で skip | ✓ |
| resume 経路での `inboxOrigin` 保持 | `transitionJob` patch に `inboxOrigin` 不在 → shallow spread で保持（lifecycle.ts 確認済み） | ✓（iter 1 より維持） |

## Invariants confirmed（iter 1/2 より維持）

| 不変条件 | 結果 |
|---------|------|
| FATAL_ERROR_CODES 非包含 | ✓ |
| `awaiting-resume` からの resume 遷移（VALID_TRANSITIONS） | ✓ |
| worktree 保持（gate halt persist 成功時）| ✓ |
| resume 経路での gate 再評価 | ✓ |
| 非伝播（GateDecision / log に issue body なし） | ✓ |
| pipeline step 未実行（halt 時） | ✓ |
| `notifyJobTerminal` 二重呼び出しなし（gate halt 時は pipeline 未起動） | ✓ |
| gate halt が checkConsecutiveEscalations カウンタを消費しない | ✓（TC-028 で機械固定）|
| `haltKind` discriminant の型安全性 | ✓ |
| `ISSUE_FIDELITY_UNDECLARED_DROP` / `ISSUE_FETCH_FAILED` が FATAL_ERROR_CODES 外 | ✓ |
