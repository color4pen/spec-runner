# Cross-Boundary Invariants Review — issue-request-fidelity-gate — iter 2

## Scope

- **Reviewer**: cross-boundary-invariants
- **Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する
- **Iteration**: 2（iter 1 finding の対処状況 + 新規変更の確認）

## Checked paths

### iter 2 での変更点（code-fixer コミット `8e4ed64`）

- `src/core/gate/issue-fidelity-gate.ts` — `GateDecision.halt` に `haltKind` discriminant を追加
- `src/core/command/runner.ts` — `error.hint` を `haltKind` で分岐ルーティング
- `tests/unit/core/command/runner-fidelity-gate.test.ts` — TC-028（カウンタ非消費）/ TC-029/030/031（hint ルーティング）追加
- `tests/unit/core/gate/issue-fidelity-gate.test.ts` — `haltKind` assertion 追加
- `specrunner/changes/issue-request-fidelity-gate/design.md` — D2 rationale に「カウンタ非消費（意図した挙動）」説明を追記

### iter 1 からの継続確認

- `src/core/resume/safety.ts` — `checkConsecutiveEscalations` 実装（state.steps 参照）
- `src/core/notify/issue-notifier.ts` — `buildEscalationComment` / `notifyJobTerminal`
- `src/errors.ts` — FATAL_ERROR_CODES 非包含
- `src/state/lifecycle.ts` — `transitionJob`、VALID_TRANSITIONS

---

## iter 1 findings の対処状況

### CBI-001 [WARN] 対処状況：部分的に解消

**実装側（設計との乖離）**:

- D2 rationale に「**カウンタ非消費（意図した挙動）**」説明が追記された。gate halt が `state.steps["request-review"]` を変更しないことが設計上も明示された。
- `tests/unit/core/command/runner-fidelity-gate.test.ts` に TC-028（gate halt 3 回後も `checkConsecutiveEscalations` が false を返すことの明示的検証）が追加された。

**残存する不整合**（本 iter でも未解消）:

design.md の **Risks セクション**（line 261）が以下のまま残っている:

> "gate halt と request-review escalation が同一 step counter を消費"

これは D2 の「カウンタ非消費（意図した挙動）」と直接矛盾する。Risks セクションの Mitigation 文も「3 回連続で --force 要求（既存挙動）に合流するのは安全側」と書かれており、実装が意図的に「カウンタを消費しない」設計であることと食い違っている。

### CBI-002 [LOW] 対処状況：hint 精度が改善、コード区別は未解消

- `haltKind` discriminant の導入により、`error.hint` 文字列がエラー種別に応じて正確な回復手順を示すようになった（undeclared-drop → request.md 修正、fetch-error → GITHUB_TOKEN 確認、internal-error → state.json/log 確認）。
- TC-029/030/031 でそれぞれの hint 文字列が state.json に正しく格納されることを検証。
- ただし **`error.code` の overloading は未解消**：wiring error / readRequestMd failure / comparator throw の 3 ケースがいずれも `ISSUE_FETCH_FAILED` を使い続けており、state.json を直接参照する operator はコードから原因を区別できない。
- `error.hint` は `handleResult` の awaiting-resume 分岐で CLI 出力に表示されない（state.json 直接参照が必要）という可視性の問題も変化なし。

---

## Finding CBI-003 [LOW]: design.md Risks セクションと D2 の内部矛盾が未解消

### 経路再構成

1. iter 2 の code-fixer コミットで D2 に「カウンタ非消費（意図した挙動）」が追記された
2. TC-028（runner-fidelity-gate.test.ts）が `checkConsecutiveEscalations` の false 返り値を機械的に固定した
3. しかし design.md Risks セクション（line 261）は「gate halt と request-review escalation が同一 step counter を消費」と書かれたまま
4. 同 Risks の Mitigation 文「3 回連続で --force 要求（既存挙動）に合流するのは安全側」も実装と矛盾する

### 既存の不変条件への影響

機能的影響は低い。実装は正しく（カウンタ非消費）、TC-028 が機械的に固定している。問題は設計文書の内部整合性のみ。ただし:

- 将来の実装者が Risks セクションを参照した場合、カウンタ消費を前提とした変更（例：gate halt 時に `steps["request-review"]` へ dummy StepRun を書き込む）を実施し、TC-028 を破るリスクがある。
- D2 と Risks セクションの記述が互いを否定し合っているため、設計レビューの際に混乱を招く。

---

## Finding CBI-004 [LOW]: `ISSUE_FETCH_FAILED` code overloading（CBI-002 からの持ち越し）

### 経路再構成

gate halt の 4 パス（step 4: comparator undefined / step 5: readRequestMd throw / step 6: getIssue throw / step 7: comparator throw）のうち、step 6 以外はいずれも:

```ts
{ kind: "halt", code: ERROR_CODES.ISSUE_FETCH_FAILED, reason: "...", haltKind: "internal-error" | "fetch-error" }
```

を返す。runner.ts は `error.code = gateDecision.code` を state に格納する。

**`haltKind` は state に格納されない**（`GateDecision` → hint routing → hint 文字列 → `error.hint` への変換のみに使われる）。

operator が state.json の `error.code` を見た場合：
- `ISSUE_FETCH_FAILED` = "fetch 失敗"と解釈するが、wiring error / readRequestMd failure / comparator parse failure も同一コードを使うため原因特定が困難。
- `error.hint` は区別されているが CLI 出力に表示されない（`handleResult` の awaiting-resume 分岐で hint は表示しない）。

### 機能的影響

すべてのケースが awaiting-resume（resume 可能）であり、FATAL_ERROR_CODES 外であることは確認済み。operator にとっての診断コストが高いが、機能的には安全側の挙動（halt して resume 可能）を維持している。

---

## Observations（追加所見）

### OBS-5: TC-028 番号衝突

`test-cases.md` において TC-028 は「IssueFidelityComparator port が core 層に閉じる（adapter を import しない）」として定義されている（T-02 要件）。

code-fixer コミットで追加した `tests/unit/core/command/runner-fidelity-gate.test.ts` の `TC-028` は「gate halt が checkConsecutiveEscalations カウンタを消費しない」であり、異なる内容に同一番号が割り当てられた。

影響：
- vitest は TC 番号ではなくテスト名文字列で識別するため実行上の問題なし
- 両テストはそれぞれ独立して正しく pass している
- しかし test-cases.md ← → test ファイルの番号追跡が不整合になり、将来の TC 追加時に混乱を招く

---

## Invariants confirmed as preserved

| 不変条件 | 確認内容 | 結果 |
|---------|---------|------|
| FATAL_ERROR_CODES 非包含 | `ISSUE_FIDELITY_UNDECLARED_DROP` / `ISSUE_FETCH_FAILED` いずれも FATAL_ERROR_CODES に存在しない | ✓ |
| `inboxOrigin` ライフサイクル維持 | bootstrap → persist → load roundtrip テスト（TC-015/016）で保持確認。reloadJobState 経路も同様 | ✓ |
| `awaiting-resume` からの resume 遷移 | `VALID_TRANSITIONS["running"]` に `"awaiting-resume"` 含む。running → awaiting-resume 合法 | ✓ |
| worktree 保持（awaiting-resume 時） | gate halt persist 成功時は awaiting-resume → `cleanupWorktreeOnFailure` は即 return | ✓ |
| resume 経路での gate 再評価 | resumePoint.step = "request-review" → resolveResumeStep → startStep = "request-review" → gate 発火 | ✓ |
| 非伝播（構造的） | `GateDecision` に issue body フィールドなし。`log()` 引数に issue body なし。comparator 内 ephemeral のみ | ✓ |
| pipeline step 未実行（halt 時） | `buildPipelineForJob` / `pipeline.run` は `gateDecision.kind === "halt"` 分岐で短絡 | ✓ |
| `notifyJobTerminal` 二重呼び出し無し | gate halt 時は pipeline 未起動 → pipeline.ts 側 `notifyJobTerminal` 不発火 | ✓ |
| `startStep` 解決（resume 経路） | `resumePoint.step = "request-review"` → `resolveResumeStep` が StepName union 内の値を返す | ✓ |
| gate halt がカウンタを消費しない | `transitionJob` patch に steps フィールド不在 → `state.steps["request-review"]` は未変更。TC-028 で機械固定 | ✓（iter 2 で追加確認） |
| `haltKind` discriminant の型安全性 | 全 halt 返却パスに `haltKind` 含む。typecheck green 確認済み | ✓（iter 2 で追加） |
