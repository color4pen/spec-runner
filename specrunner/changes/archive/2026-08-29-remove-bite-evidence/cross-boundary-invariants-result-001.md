# Cross-Boundary Invariants Review — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 確認範囲

- `git diff main...HEAD --stat` で 113 files changed、4961 insertions、10950 deletionsを確認した。
- `specrunner/reviewers/cross-boundary-invariants.md` の観点・判定基準を確認した。
- `design.md` の D1〜D12 と `tasks.md` の T-01〜T-13 を通読した。
- diff の周囲にある pipeline engine、resume command、attach policy、journal fold、state projection、archive floor、profile resolution の未変更コードを追跡した。

## 新しい経路と隣接不変条件

### 1. 通常経路: implementer → verification

`STANDARD_TRANSITIONS` は `implementer/success` の guarded 3 経路を、単一の無条件 `verification` edge に縮退している。

確認した不変条件:

- transition lookup は宣言順の `.find()` だが、同じ `(step, outcome)` の競合行は残っておらず、一対一性は改善されている。
- verification は従来も初回・test-gen-exempt・verification failure 後の全経路で到達先だったため、step executor の entry-HEAD capture、verification loop budget、failure 時の implementer 再入条件に新しい呼び出し文脈は持ち込まれていない。
- `verificationFailedLast` は遷移 guard から外れたが、implementer prompt/context の再入判定として維持されている。したがって verification failure → implementer → verification の fixer 文脈は失われない。
- verification passed 後の `conformanceApprovedForVerifiedRevision` guard と、conformance 後の reverification 判定は変更されておらず、直結 edge によって short-circuit 条件が広がらない。
- FAST / DESIGN_ONLY descriptor はもともと bite-evidence を含まず、変更後もそれぞれの transition/role/loop 構造に多対一 lookup や未登録 step は生じていない。

### 2. Legacy recovery: bite-evidence → verification

`LEGACY_STEP_ALIASES["bite-evidence"]` は `--from`、`resumePoint.step`、`state.step` の各 branch で、allowed-step validation と member→coordinator mapping より先に適用される。

確認した不変条件:

- alias 後の `verification` は static allowed-step set と STANDARD descriptor の両方に存在するため、pipeline は削除済み step を dispatch しない。
- attach policy も `resolveResumeStep` を経由し、解決後の verification の `reads()` を descriptor から検査するため、削除済み step の lookup を行わない。
- `JobState.step` / `ResumePoint.step` / journal の step key は string-compatible であり、state validation と journal fold は削除済み step 名を reject しない。
- journal fold は step 名を動的な record key として group 化するため、過去の `bite-evidence` attempt と `strategy-deferred` verdict はそのまま履歴に残る。PR body/attestation の既存処理にも step enum による全件 lookup はない。
- resume command の自動 resume context は legacy alias 後には引き継がれないが、verification は agent prompt context を消費しない deterministic step であり、legacy gate の途中コンテキストを verification に渡す契約もないため、実行不変条件の破壊には該当しない。

### 3. Archive assurance: 3 次元 → 2 次元

archive provenance は `specReview` と `testDerivation` のみを導出し、runtime dependency は `readFileAtCommit` のみに縮退している。

確認した不変条件:

- `satisfiesFloor` は残存 2 次元について、要求値があるのに achieved 値が欠ける場合を引き続き false とする。
- `deriveAchievedAssurance` は各次元を floor が拘束する場合だけ検査し、OID・slug・runtime・blob の欠落または I/O failure を absent として返す fail-closed 性を維持する。
- legacy profile 内の `biteEvidence` は index signature と legacy-read-only field により読み込めるが、`AssuranceFloor` に同次元がないため新しい保証判定へ混入しない。
- 新規 config の `archive.minimumAssurance.biteEvidence` は raw object に対する key-presence check で、値が `required`、`optional`、`null` のいずれでも明示的に拒否される。schema の unknown-key strip による黙殺は起きない。
- archive 呼び出し側から削除された test execution runtime は他の archive 分岐の前提ではなく、protected-path matching、changed-file truncation guard、merge 前停止条件は維持されている。

### 4. State/journal の read-only compatibility

- `JobState.biteEvidence`、`BiteEvidenceRecord`、`BiteEvidenceLevel`、`ProfileAssurance.biteEvidence`、`strategy-deferred` は read compatibility のため残っている。
- `ParsedStepResult` → `StepCompletion` → `commit-orchestrator` の producer chain は削除され、新規 record が生成される経路はない。
- `validateJobState` は legacy `biteEvidence` 配列を引き続き validation し、split-layout projection は journal の任意 step 名を保持する。read path と write path の非対称性は意図どおり成立している。

## 組み合わせシナリオ

以下の連続実行をコードとテストで確認した。

1. 初回 implementer success → verification passed → code-review。
2. verification failed → implementer 再入（failure context あり）→ verification。
3. conformance 後に code change あり → verification 再実行 → verified revision と conformance OID 一致時のみ adr-gen/pr-create。
4. legacy `resumePoint.step = bite-evidence` → verification → 通常 transition 継続。
5. legacy `state.step = bite-evidence` かつ resumePoint なし → verification hard-crash recovery。
6. historical bite-evidence journal record を fold → legacy step group を保持したまま現行 state を構成。
7. protected path + testDerivation/specReview floor → provenance 導出 →不足時は merge 前に停止。
8. stale `archive.minimumAssurance.biteEvidence` config → semantic validation で `CONFIG_INVALID`。

## 実行 evidence

次の targeted suite を実行し、66 tests / 0 failures を確認した。

- `tests/unit/core/resume/resolve-step.test.ts`
- `src/core/pipeline/__tests__/standard-transitions.test.ts`
- `src/config/__tests__/remove-bite-evidence-config-validation.test.ts`
- `tests/unit/core/archive/merge-then-archive-floor.test.ts`

また、既存の `verification-result.md` で build、typecheck、test、lint、changed-line-coverage がすべて passed であることを確認した。

## 検証できなかった項目

- 実在する v0.4.10〜v0.5.0 の checkpoint fixture を使った end-to-end attach/resume は実行していない。ただし persisted shape、projection、alias、attach policy の各境界をコードで追跡し、3 種類の resume 入口は unit test で確認した。

## Findings

typed finding として報告すべき、未変更コードの不変条件を破る具体的な実行列は確認されなかった。
