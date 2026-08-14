# Cross-Boundary Invariants Review — strip-test-authority

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Scope**: 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかの検出

---

## 観点と判定基準

diff が触っていないコードが持つ「このコンテキストでは常に真」な前提を列挙し、新しい挙動がその前提を静かに破っていないかを確認する。実装が正しくテストが green であっても、既存機構との相互作用にだけ宿るクラスのバグを対象とする。

---

## 前周 Finding 1 の確認（再読後判定）

前周（iteration 1）の Finding 1: **archive floor が汚染ベースラインを評価する経路が新規開通する**

`src/core/archive/achieved-assurance.ts` を再読した結果、D6 の実装が確認できた。

**変更内容（`achieved-assurance.ts` diff 確認済み）**:

```typescript
// (P2.5) Base must be free of implementation contamination (re-run shape).
const contaminatingOid = detectBaseImplementationContamination(state);
if (contaminatingOid !== null) {
  diagnostics.push(
    `biteEvidence/testDerivation: baseline unbuildable — implementer commit ${contaminatingOid} ` +
      "predates the base test-materialize commit (implementation mixed into base)",
  );
  return { achieved: achieved as ProfileAssurance, diagnostics };
}
```

- `detectBaseImplementationContamination` が `oids.ts` からインポートされ、P2.5 として P1/P2（finalHeadOid / baseOid 確認）の直後・P3（runtime 確認）の前に組み込まれた。
- 汚染検知時に **biteEvidence/testDerivation 両次元を absent のまま早期 return**（provenance I/O は一切実行しない）。
- 理由を `diagnostics` に記録 → `merge-then-archive.ts` の escalation メッセージに surfaced される。
- `achieved-assurance.test.ts` の新規テストが汚染形状で **`neverCalled` mock**（I/O が呼ばれたら throw）を使い、診断メッセージ・両次元 absent を固定する。

**判定: 前周 Finding 1 は解消済み。** 以下、再指摘しない。

---

## 今周の調査対象（実際に読んだファイル）

| ファイル | 変化 | 確認した観点 |
|---|---|---|
| `src/core/step/bite-evidence/oids.ts` | Δ: `detectBaseImplementationContamination` 追加 | 関数仕様・呼び出し一貫性 |
| `src/core/step/bite-evidence/gate.ts` | Δ: step 3.5 汚染検知追加 | 既存 step 順序との矛盾 |
| `src/core/archive/achieved-assurance.ts` | Δ: P2.5 汚染検知追加 | 前周 Finding 1 の解消確認 |
| `src/core/archive/__tests__/achieved-assurance.test.ts` | 新規 | 汚染形状テストのカバレッジ |
| `src/core/step/implementer.ts` | Δ: testsMaterialized=true 分岐書き換え | write-scope との矛盾・archive floor への波及 |
| `src/prompts/test-materialize-system.ts` | Δ: red 強制の削除 | 観測記録要求の維持確認 |
| `src/core/step/bite-evidence/step.ts` | 変更なし | strategy-deferred の result file 書き出しと parseResult |
| `src/core/pipeline/types.ts` | 変更なし | strategy-deferred → verification 遷移の存在確認 |
| `src/core/archive/merge-then-archive.ts` | 変更なし | deriveAchievedAssurance 呼び出しと diagnostics の surfacing |
| `src/state/schema/types.ts` | 変更なし | StepRun.startedAt 必須 string の確認 |

---

## 前提のカタログと確認結果（今周）

### 前提 A: `gate.ts` と `achieved-assurance.ts` の汚染検知は同一関数・同一 state から判定する

- 両者とも `detectBaseImplementationContamination(state)` を呼ぶ。
- `gate.ts` は pipeline 実行時の state、`achieved-assurance.ts` は archive 時の state を受け取る。
- gate 実行後から archive までに追加される step runs は test-materialize / implementer 以外（verification / code-review / conformance 等）であり、汚染検知の判定キー（implementer 実行歴 × 最新 test-materialize の startedAt）は変化しない。
- 両者の判定結果は一致する。**前提は維持される。** ✓

### 前提 B: `resolveBaseCandidateOids` の全呼び出し元が汚染検知も一緒に呼ぶ

production code の呼び出し元:
- `src/core/step/bite-evidence/gate.ts` → `detectBaseImplementationContamination` を step 3.5 で呼ぶ ✓
- `src/core/archive/achieved-assurance.ts` → P2.5 で呼ぶ ✓

テストコード `oid-capture.test.ts` は `resolveBaseCandidateOids` 単体をテストする目的で呼ぶが production 挙動に影響しない。production 消費者は 2 ファイルのみであり、両方とも汚染検知を適用している。**前提は維持される。** ✓

### 前提 C: tamper check は汚染検知より優先される（gate.ts の step 順序）

`gate.ts`:
1. Non-forward type check → strategy-deferred
2. **Tamper check** → failed（step 2）
3. OID 解決 → strategy-deferred if null
4. **汚染検知** → strategy-deferred（step 3.5）
5. Runtime check

tamper mismatch は always "failed" を返し、汚染検知に到達しない。`achieved-assurance.ts` では tamper は blob freeze（step b）で検知され、汚染検知（P2.5）より後になる。両者の順序が異なるが、**どちらの経路でも「汚染あり + tamper あり」の場合に矛盾した verdict を出すことはない**（gate: tamper 優先 failed、archive: P2.5 先行で provenance I/O を呼ばないため blob freeze には到達しない）。**前提は維持される。** ✓

### 前提 D: `detectBaseImplementationContamination` が `testsMaterialized=true` mode の新経路で誤作動しないか

implementer が canon-alignment mode（今回の変更）でテストを修正・追加しても、`state.steps["test-materialize"]` や `state.steps["implementer"]` の startedAt には影響しない（commit する step は executor が担い、startedAt は session 開始時刻で固定）。汚染検知は run の startedAt 大小比較のみであり、worktree の内容変化には依存しない。**前提は維持される。** ✓

### 前提 E: archive floor の `testDerivation` も汚染時に absent になる（D6 の仕様）

D6 では「汚染検知時は biteEvidence / testDerivation を absent のまま残す（既存の precondition 群と同じ fail-closed 早期 return）」と明記。P2.5 の実装は `return { achieved, diagnostics }` で両次元とも absent のまま返す。これは:
- `floor.biteEvidence` のみ制約している場合 → biteEvidence absent ✓
- `floor.testDerivation` のみ制約している場合 → testDerivation absent ✓（`floorConstrainsDerivation=true` かつ `floorConstrainsBite=false` でも P2.5 まで到達する）
- 両方制約している場合 → 両方 absent ✓

**前提は維持される。** ✓（ただし `testDerivation` のみ制約したケースのテストは `achieved-assurance.test.ts` にない。D6 の spec が「biteEvidence を制約している」場合のみを明記しているため spec 上は問題なし。）

---

## 今周の発見：新規クロスバウンダリ懸念

### 観察事項 O-1 [LOW]: biteEvidence gate の「テスト内容同一性」前提が機械的に保証されなくなった

**概要**

変更前: `testsMaterialized=true` 時の implementer は「production code only / テスト変更禁止」モードであり、materialized test files の内容は baseOid（test-materialize コミット）と candidateOid（implementer コミット）で同一だった。gate.ts の `runBiteEvidenceGate` はこの同一性を前提に「同じテストを base と candidate で実行した結果の比較」として `base-red → candidate-green` を検証していた。

変更後: implementer が canon-alignment モードでテストを修正できるため、candidateOid 時点のテスト内容が baseOid と異なる場合がある。gate は `listCommitChangedFiles(baseOid)` でファイルパスを取得し、**同一パスを base と candidate で実行**するが、candidate 側のテスト内容が変わっていれば「テスト仕様の緩和 → trivial に green」という false positive が生じうる。

**影響の評価**

- archive floor の blob freeze check（`diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)`）がテスト変更を検出し `testDerivation` を absent にするため、「凍結されたシナリオ」の証明は失われる。
- しかし `biteEvidence = "required"` は、テスト内容が変化していても base-red → candidate-green であれば付与される。弱体化したテストでも bite を満たした扱いになる。
- 本プロジェクトの `.specrunner/config.json` は `minimumAssurance` を未設定のため現状実害なし。

**設計との対応**

本リスクは request.md の「スコープ外」に明示されている:

> 鏡写しテスト対策(implementer 内の論理フェーズ分離等)— 統合を扱う後続 request の論点

design D2 も「テスト変更の妥当性は code-review / conformance が canon 突合で裁く」と明記しており、機械の歯を足さないことが architect 評価済みの設計判断。この観察事項は action 不要であり、記録にとどめる。

---

## 確認済み前提のサマリー（今周）

| ID | 前提 | 確認結果 |
|----|------|----------|
| 前周 Finding 1 | archive floor 汚染経路の新規開通 | **解消済み（D6 実装確認）** |
| A | gate/archive floor の汚染検知が同一関数・同一判定を使う | ✓ 維持 |
| B | `resolveBaseCandidateOids` 全 production 呼び出し元が汚染検知を同伴する | ✓ 維持 |
| C | tamper check と汚染検知の優先順序に矛盾がない | ✓ 維持 |
| D | canon-alignment mode の新経路が汚染検知に誤作動しない | ✓ 維持 |
| E | P2.5 早期 return が biteEvidence/testDerivation 両次元を absent にする | ✓ 維持 |
| O-1 | biteEvidence gate のテスト内容同一性前提 | LOW 観察事項（設計上 defer 済み）|
