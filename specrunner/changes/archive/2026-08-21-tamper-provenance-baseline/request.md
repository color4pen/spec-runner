# bite-evidence の tamper 判定基準を「認可された変更経路」ベースに変える

## Meta

- **type**: spec-change
- **slug**: tamper-provenance-baseline
- **base-branch**: main
- **adr**: true

## 背景

bite-evidence の tamper 検査は「test-cases.md は test-case-gen 以降変わらない」という暗黙の前提で、test-case-gen 時点の lineage hash と現在のファイル hash を照合する。一方 write-scope の設計では spec-fixer が test-cases.md を `writes()` で所有しており、spec-review の finding を適用する正規の編集権限を持つ。この 2 つの契約が正面衝突しているため、spec-review が test-cases.md に fixable finding を出した run は、pipeline が正しく動くほど必ず bite-evidence で偽陽性 halt する（実測 1 件）。

tamper 検査が聞くべきは「test-case-gen 時点と同一か」ではなく「現在の内容への変更は、認可された経路で説明できるか」である。（台帳: issue #1036）

## 現状コードの前提

- `src/core/step/bite-evidence/tamper.ts:37-74` — `checkTamperStatus` は最新の **test-case-gen** lineage record の test-cases.md hash のみを凍結基準とし、現在 hash と比較する（match / mismatch / inconclusive）。spec-fixer の lineage record は参照しない
- `src/core/step/bite-evidence/gate.ts:109` — mismatch → verdict failed（fail-closed）、reason は「tamper detected: test-cases.md hash does not match the frozen hash recorded at test-case-gen」固定
- `src/core/step/spec-fixer.ts:99-107` — spec-fixer は `writes()` で test-cases.md を宣言する（protected canon の所有 step）。編集後は spec-fixer の lineage record に新 hash が記録される（実測で確認済み）
- `src/core/step/write-scope.ts:62-72` — `protectedCanonPaths` に test-cases.md が含まれ、`writes()` 宣言 step のみ書き込み可
- `src/core/step/commit-orchestrator.ts:269-291` — `appendLineage` は **best-effort**（「lineage recording failure must not affect step completion」）。lineage 記録失敗は step 完了を止めない
- operator は `job resume --apply-canon` で test-cases.md を正規に変更できる（operator 適用 commit）
- pipeline は sole-committer 設計で、step の変更は executor が step 名入り commit（例: `spec-fixer: <slug>`）として branch に記録する

## 要件

1. **判定基準の変更**: tamper 判定を「認可された変更経路で説明できるか」に変える。test-cases.md を `writes()` で所有する step（test-case-gen / spec-fixer）および operator 適用（--apply-canon）による変更は tamper としない。
2. **fail-closed の維持**: 認可経路で説明できない変更は引き続き failed（fail-closed）。証跡が欠落して正否を決められないケースの扱い（既存の inconclusive → proceed を含む）は設計で明示的に決め、根拠を design.md に記す。
3. **証跡の耐久性を設計判断として明示**: `appendLineage` は best-effort のため、lineage を唯一の権威にすると「正規編集 + lineage 記録だけ失敗」で偽陽性が残る。tamper 判定に使う証跡を durable にする（記録失敗を握りつぶさない）か、既に durable な別証跡（sole-committer の step 帰属 commit 履歴等）を使うか — 採用案と却下案を design.md に明記する。

## スコープ外

- test-cases.md 以外の保護正典への tamper 検査の拡張
- write-scope / spec-fixer の権限（所有宣言）の変更
- bite-evidence の base/candidate 評価（strategy 選択・runTestsOnSynthesizedTree）側の変更

## 受け入れ基準

- [ ] test-case-gen → spec-review → spec-fixer（正規編集）→ bite-evidence の経路で tamper 扱いにならないことをテストで固定する（実測した偽陽性形の再現）
- [ ] operator 適用（--apply-canon 相当）による変更が tamper 扱いにならないことをテストで固定する
- [ ] 認可経路で説明できない変更（非所有 step・証跡外の書き換え）が引き続き failed になることをテストで固定する
- [ ] 採用した証跡が欠落するシナリオ（lineage 記録失敗等、採用設計に従う）の挙動をテストで固定する
- [ ] 既存テストのうち `src/core/step/bite-evidence/__tests__/gate.test.ts` の「test-case-gen 固定基準」を pin するケースに限り新契約への更新を許容する。それ以外の既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **内容由来 identity から出自（provenance）への移行が本 request の芯**: 「hash が同じか」ではなく「変更の出自が認可されているか」を問う。hash 照合は出自確認の実装手段の一つに格下げされる。
- **sibling と統合しない**: finding provenance（--wontfix の title drift、issue #1037）は思想上の兄弟だが、修正する正本も壊れ方も異なるため別 request とする。共有するのは「出自を最初から運ぶ」原則のみ。
