# Cross-Boundary Invariants Review — post-fixer-reverification

- **verdict**: approved
- **iteration**: 1
- **reviewer**: cross-boundary-invariants

---

## 観点

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストが green でも、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検査した不変条件と判定

### INV-1: `verification passed → code-review` ルーティングの既存動作

**前提**: これまで `verification passed` は無条件で `code-review` へ遷移していた。

**新挙動**: `when: conformanceApprovedLatest` 付き行を先頭に挿入し、条件成立時のみ `adr-gen` へ遷移する。

**評価**: `conformanceApprovedLatest` が true になるのは「conformance が最後に `approved` を返した状態でかつ verification が完了した直後」に限る。初回 verification（implementer 後）のとき conformance は未実行（runs = []）→ `false` → 従来通り `code-review` へ遷移する。`find` の先頭優先評価により fallback 行は条件不成立時のみ選ばれる。**既存動作を破壊しない。** ✓

---

### INV-2: `conformance approved → adr-gen` ルーティングの既存動作

**前提**: `conformance approved` は無条件で `adr-gen` へ遷移していた。

**新挙動**: `when: codeChangedSinceLastVerification` 付き行を先頭に挿入し、条件成立時のみ `verification` へ遷移する。

**評価**: 条件が false のとき fallback 行 `conformance approved → adr-gen` が選ばれ、既存動作を維持する。clean run（fixer 未実行）では実装者直後に verification が走るため `vTime > mTime` → false → fallback 行が選ばれる。**既存動作を破壊しない。** ✓

---

### INV-3: verification ↔ build-fixer 収束ループの既存バジェット

**前提**: verification loop は paired fixer（build-fixer）との episode reset 機構で fresh バジェットを得る。バジェット = `maxIterations`。

**新挙動**: `conformance approved → verification` という新たな入場経路ができた。

**評価**: pipeline.ts の episode-reset ロジック（line 365-379）は「nextStep が loop step、かつ currentStep が paired fixer でない場合」に `loopIters[verification] = 0` / `fixerIters[build-fixer] = 0` をリセットする。`conformance` は build-fixer ではない → reset が発火し、re-verification は iteration=0 から数え直す。続く exhaustion check（line 416-419）は reset 後の 0 を参照するため即打ち切りされない。**既存バジェット機構を破壊しない。** ✓

---

### INV-4: conformance ループカウンタの lifetime 保存

**前提**: conformance は paired fixer を持たないため `loopIters[conformance]` はリセットされず lifetime カウンタとして機能する（exhaustion は `tryExhaust` が lifetime 値で判定）。

**新挙動**: `conformance approved → verification` 遷移が追加された。

**評価**: episode-reset ロジック（line 365-379）が対象とするのは `pairedFixerForNext !== undefined`（nextStep に paired fixer が存在する loop step）の場合のみ。conformance の counter は対象外。また line 401 の "unpaired fixer loop step exhaustion" チェックは `outcome !== "approved" && outcome !== "passed"` 条件付きのため、`conformance approved` の遷移では発火しない。conformance の lifetime カウンタは変更されない。**既存収束保証を破壊しない。** ✓

---

### INV-5: `composeReviewerDescriptor` のフィルタが新行を除去しないこと

**前提**: custom reviewer 構成時、`composeReviewerDescriptor` は `code-review`, `code-fixer`, `regression-gate`, custom reviewer 名の遷移行だけを除去し再生成する。

**新挙動**: `conformance approved → verification`（`t.step = CONFORMANCE`）と `verification passed → adr-gen`（`t.step = VERIFICATION`）の 2 行を追加した。

**評価**: フィルタ条件（`t.step !== CODE_REVIEW && t.step !== CODE_FIXER && t.step !== REGRESSION_GATE_STEP_NAME && !snapshots.some(s => t.step === s.name)`）のいずれにも該当しないため、両行は composed descriptor に保持される。TC-007 で保持を固定済み。**custom reviewer 構成でも新行が有効。** ✓

---

## 軽微な観察（ブロックしない）

### OBS-1: `conformanceApprovedLatest` の暗黙依存 [LOW]

`verification passed → adr-gen` の `when` 述語は「conformance が run されているなら re-verification 文脈である」という推論をする。これは「conformance は code-review の後にしか到達できない」という pipeline 構造上の不変条件に依存しており、述語自体に防御ロジックはない。現行の遷移表ではこの不変条件は構造的に保証されている。将来 conformance への経路が code-review 以外から追加された場合、述語の意味的前提が崩れる可能性がある。現時点では bug でないが、design D3 で明示的に文書化されている点を確認した。

### OBS-2: `codeChangedSinceLastVerification` の strict `>` 比較 [LOW/INFO]

`mTime > vTime`（厳密大）を使うため、code-mutator と verification が同一ミリ秒に完了すると `false` を返し re-verification をスキップする。逐次実行の production では実質発生しない。test では `makeTick()` による単調 timestamp で正しく対処済み。design D4 の Risks に既記。

### OBS-3: build-fixer 回復路での LLM 再レビュースキップ [INFO]

`conformance(approved) → verification(fail) → build-fixer → verification(pass) → adr-gen` 経路において、build-fixer の変更はコードレビューを経ずに機械検証のみで pr-create へ進む。`conformanceApprovedLatest = true` が保持されているためこの routing は正しい。本 request のスコープ（機械検証の保証）と整合する意図的 trade-off として design D3 に記録済み。

---

## 結論

3 つの観察はいずれも設計文書（D3/D4 Risks）に明示的に記録済みのものである。新挙動は既存の verification バジェット機構・conformance lifetime カウンタ・composereviewer フィルタ・routing fallback のいずれの不変条件も黙って破っていない。

- **verdict**: approved
