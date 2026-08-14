# Evidence Base の導入: bite-evidence の baseline を工程時系列から切り離す

## Meta

- **type**: spec-change
- **slug**: evidence-base
- **base-branch**: main
- **adr**: true

## 背景

bite-evidence の red→green 証明は、red 側 = 「最新 test-materialize run の commitOid」、green 側 = 「最新 implementer run の commitOid」という**工程時系列ベースの OID 解決**に立っている(`resolveBaseCandidateOids`)。この「base = その時点の worktree」モデルは resume・再走で壊れる:

- 再走で test-materialize が implementer より後に走ると、base に実装が混入し red 判定が成立しない。#991 はこれを `detectBaseImplementationContamination`(startedAt 全順序による検出)で strategy-deferred / archive floor fail-closed に落として**止血**したが、検出であって解決ではない。混入した job は保証を得る手段を失う
- `--adopt-commits` で採択された operator commit は synthesizedCommits ledger にのみ載り、implementer run の commitOid は更新されないため、**candidate から operator の手当てが脱落**する(operator 修正前のツリーを green 判定する)

根本対策は base の定義を工程時系列から切り離すこと:

```text
Evidence Base = 不変の job base(job 開始時点の base branch tree)
              + 今回 materialize されたテストファイル(candidate 時点の内容)の overlay
```

test-materialize が「いつ・何回」走ったかは Evidence Base の意味に影響しない。初回でも resume でも再走でも同一の意味論になり、汚染という状態自体が構成上起き得なくなる。`oids.ts` の ponytail マーカー(「startedAt 全順序に依存。Evidence Base 導入時に tree 合成へ置換」)が本 request の予告である。

## 現状コードの前提

- `src/core/step/bite-evidence/oids.ts` — `resolveBaseCandidateOids`(base = 最新 test-materialize commitOid / candidate = 最新 implementer commitOid)と `detectBaseImplementationContamination`(startedAt 順序による汚染検出、ponytail マーカー付き)
- `src/core/step/bite-evidence/gate.ts` — gate 手順(型判定 → tamper → OID 解決 → 3.5 汚染検出で strategy-deferred → runtime → テスト実行)。`FORWARD_TYPES = {bug-fix, new-feature}` は archive floor と共有
- `src/core/archive/achieved-assurance.ts` — archive floor の P2.5 前提条件(汚染 base → baseline unbuildable として両 dimension を absent に fail-closed)
- `src/core/port/runtime-strategy.ts:700` — `runTestsAtCommit(oid, testFiles, cwd, config)`: commit checkout + scoped テスト実行。managed runtime は非対応(unavailable)
- `src/config/schema/types.ts:162` — `scopedTestCommand`(未設定プロジェクトは gate 素通り = strategy-deferred)
- job state は job 開始時点の base branch OID を記録していない(branch 作成は CLI が行うが fork point の永続化は無い)
- `--adopt-commits` は採択 commit を synthesizedCommits ledger に追加する(implementer run の commitOid は不変)

## 要件

1. **Evidence Base 抽象の導入** — 「不変の job base tree + 対象テストファイル(candidate 時点の内容)の overlay」として Evidence Base を構築する。job base は job 開始時点の base branch 側 tree を指し、resume・再走・test-materialize の実行回数に依存しない。job base の同定方法(state への記録 / 最初の synthesized commit の親からの導出等)は design で確定するが、resume を跨いで同一 tree に解決されることを必須とする。
2. **red 側の置換** — bite-evidence の red 判定は「最新 test-materialize commit の checkout」ではなく Evidence Base 上で実行する。runtime port には合成 tree 上でのテスト実行(または同等の worktree 構成)を追加する。
3. **candidate 側の置換** — green 判定の candidate は「最新 implementer run の commitOid」ではなく、provenance 承認済みの effective branch 状態(pipeline synthesized + operator adopted commits の到達 tree)とする。`--adopt-commits` で採択された operator commit が candidate に含まれることを保証する。
4. **時系列依存機構の撤去** — Evidence Base では base への実装混入が構成上起き得ないため、`detectBaseImplementationContamination`・gate 手順 3.5・archive floor P2.5(baseline unbuildable)を撤去し、archive floor の当該前提を Evidence Base 意味論で再定義する。撤去対象の既存テストは design で全列挙し、置換後の保証(初回 / 再走の等価性)を固定するテストに差し替える。
5. **非対応環境の挙動維持** — `scopedTestCommand` 未設定・runtime 非対応(managed)・非 forward type の strategy-deferred 挙動、`FORWARD_TYPES` の範囲、tamper 検出、gate の「絶対に throw しない」契約は不変とする。

## スコープ外

- test-materialize step の廃止・implementer への統合(後続 request で扱う)
- hollow テスト(実装を見た鏡写しテスト)の意味的検出(red→green は「テストが変更に噛んでいる」ことの証明であり、要求検証性の証明ではない — 現状の期待値を維持)
- scopedTestCommand の既定値追加・設定拡張
- code-review / conformance / verification の挙動変更

## 受け入れ基準

- [ ] 再走 shape(implementer commit が最新 test-materialize commit より前に存在する state)で、Evidence Base の red 側に実装が混入しないことをテストで固定する(#991 で strategy-deferred に落ちていた形が保証を得られるようになる)
- [ ] 初回走行と resume 再走で Evidence Base が同一 tree に解決されることをテストで固定する
- [ ] adopt-commits で採択された operator commit が candidate に含まれることをテストで固定する
- [ ] `detectBaseImplementationContamination` / gate 3.5 / archive floor P2.5 の撤去と、それらを pin していた既存テストの更新対象を design で全列挙し根拠を明示する。列挙外は無変更で green
- [ ] scopedTestCommand 未設定 / runtime 非対応 / 非 forward type の strategy-deferred 挙動が不変であることを既存テストの green で確認する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **検出より構成** — #991 の汚染検出は「壊れた状態を見つけて判定を放棄する」防御であり、壊れた job は保証を得る手段を失う。Evidence Base は壊れた状態を構成上作れなくする。検出の歯(fail-closed)は置換後は不要になるため、残すことは二重管理でしかない。
- **candidate は provenance で定義する** — 「どの step が最後に commit したか」ではなく「provenance が承認した到達 tree か」が green 判定の対象として正しい。operator の adopt-commits は provenance 承認そのものであり、candidate から除外される現状が誤り。
- **red の証明力の期待値** — Evidence Base 上の red は import エラーでも red になる(新規 module 型では「実装が無いから落ちた」以上を証明しない)。hollow 検出の解像度は「既存 module の挙動変更」型でのみ高い。この限界は現行と同じであり、本 request は証明力を上げるものではなく、証明の**成立条件を時系列から独立させる**ものである。
