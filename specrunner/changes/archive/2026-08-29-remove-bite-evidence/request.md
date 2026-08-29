# test-materialize 廃止後に保証モデルが成立していない bite-evidence を削除する

## Meta

- **type**: spec-change
- **slug**: remove-bite-evidence
- **base-branch**: main
- **adr**: true

## 背景

bite-evidence は、変更されたテストが「実装なしでは red、実装ありでは green」になることを機械実行し、hollow test を検出する gate として導入された。

しかし [#999](https://github.com/color4pen/spec-runner/pull/999) で `test-materialize` を implementer に統合した際、bite-evidence の対象集合を「test-materialize commit が生成したテスト」から「Evidence Base（EB）↔ HEAD で変更された、テスト名パターンに一致する全ファイル」へ置換した。これにより、元の保証が依存していた「実装前に実体化されたテスト集合」という工程境界は消滅した一方、gate 側には「選択された全ファイルは base-red になるべき」という前提が残っている。

実運用では、テスト本体ではなく pin 宣言を追加した既存 `gate-check.test.ts` が base-green / candidate-green となり、実装・verification がすべて成功しているにもかかわらず bite-evidence で halt した。LocalRuntime の隔離worktreeで同じOIDを用いて再実行し、同じ判定が再現することを確認済み。

本件は個別ファイルの除外不足ではなく、test-materialize 廃止後も旧対象集合の意味論を引き継いでいる設計上の残滓である。現行実装を部分修正せず、bite-evidence機能を削除する。

## 現在の問題

### 1. 正当な変更を偽陽性で停止する

`gate.ts` はEB↔HEADで変更されたテスト名ファイルをすべて選び、ファイル単位でbase-redを要求する。そのため次の変更は実装が正しくてもgreen→greenとなり、jobを停止させる。

- pin件数・allowlist・arbitration宣言の更新
- snapshot・期待値・メタデータだけの更新
- テスト基盤のリファクタリング
- 既存仕様が維持されることを確認するテスト
- コメントやTC-IDだけの変更
- 実装変更と独立して元からgreenになる既存テスト

同じEB・HEAD・設定でのplain resumeは決定的に同じ結果となり、回復手段にならない。

### 2. 噛んでいないテストを証明済みにできる

判定単位はtest/TCではなくファイルである。1ファイル内の1テストだけがbaseで失敗すれば、同じファイル内の他のhollow testを区別できない。

また、base側の合成treeへoverlayするのは選択されたテストファイルだけであり、変更されたhelper・fixture・setup・test config等はoverlayされない。候補実装と無関係なimport失敗・環境差でもbase-redを作れてしまう。

verificationのtest-coverageもTC-ID文字列と、同じファイル内のどこかにassertionがあることまでしか確認しないため、TCとbase-redになったassertionの対応を補完できない。

### 3. 後続修正で証拠が古くなる

verification失敗後は次の経路となる。

```
verification failed → implementer → verification
```

回復時のimplementerは実装とテストの両方を修正できるが、bite-evidenceは再実行されない。code-fixer、reopen後のhuman push等もreverificationはされる一方、base-redは再確認されない。

stateの既存`biteEvidence`はreopenでも保持される。PR attestationは具体的なbite record/candidate OIDを表示せず、journal上の過去のgate verdictだけを載せるため、最終revisionとの束縛を表現できない。

### 4. archiveの挙動が設定によって分裂する

`archive.minimumAssurance.biteEvidence`がprotected pathに適用される場合、archiveは最終HEADで同じ誤った判定を再実行し、pipelineを`--from verification`で進めても再び停止する。

floor未設定・protected path不一致・plain archive等では最終再検査が行われず、bite-evidenceを飛ばして先へ進める。現在は設定によって「二度停止する」と「保証を飛ばして通る」に分裂している。

## 影響バージョン

[#999](https://github.com/color4pen/spec-runner/pull/999) を含む以下。

- specrunner-v0.4.10
- specrunner-v0.4.11
- specrunner-v0.4.12
- specrunner-v0.5.0
- current main

v0.4.9以前は本件のEB↔HEAD全テスト差分方式を含まない。

## 方針

現行bite-evidenceを削除する。red→greenという発想自体は否定しないが、再導入する場合はTC/test単位のmutation evidence等として別途設計し、現在のfile単位gateを延命しない。

`testDerivation`のscenario revision bindingと通常のverification/test-coverageはbite-evidenceから独立しているため維持する。

## 要件

1. STANDARD pipelineから`bite-evidence` stepを削除し、implementer成功後はverificationへ遷移する。
2. step実装・registry・step name・result artifact・pipeline-managed path等、bite-evidence専用production codeを削除する。
3. `STANDARD_PROFILE.assurance.biteEvidence = "required"`を削除する。
4. archiveのbiteEvidence achieved-provenance導出と再実行を削除する。testDerivation/specReviewの導出は維持する。
5. `verification.scopedTestCommand` / `verification.scopedTestPatterns`および専用runtime primitives（`listChangedFilesBetweenCommits` / `runTestsAtCommit` / `runTestsOnSynthesizedTree`）は、他のproduction用途がないことを確認したうえで削除する。
6. `archive.minimumAssurance.biteEvidence`を黙って無視しない。指定された既存configは、削除された保証であることと移行方法が分かる明示的なvalidation errorにする。
7. legacy jobを回復可能にする。
   - `--from bite-evidence`、保存済み`resumePoint.step = bite-evidence`、bite-evidence上で停止したcurrent stepをverificationへ解決する。
   - legacy stateの`biteEvidence` recordは読み込み互換のため受理するが、新規生成・保証判定には使用しない。
   - 過去journalのbite-evidence runはfold/attestationを壊さず履歴として保持する。
8. README、configuration、architecture現況文書から現行stepとしての記述を除去する。過去ADRは履歴として変更しない。
9. 削除後にdeadとなるテスト・fixture・命名（`materializedTestFiles`等）を整理する。

## 受け入れ基準

- [ ] standardの通常経路が `implementer → verification` になる
- [ ] fast / exempt typeを含む既存pipeline遷移に回帰がない
- [ ] bite-evidenceで停止中のlegacy jobを`resume`するとverificationから継続できる
- [ ] legacy state/journalを読み込める
- [ ] `archive.minimumAssurance.biteEvidence`指定時に黙ってfloorが弱まらず、明示エラーになる
- [ ] archiveのtestDerivation/specReview floorは従来どおり機能する
- [ ] PR attestationがlegacy bite-evidence履歴を含んでも生成できる
- [ ] READMEと設定ドキュメントが現行pipelineと一致する
- [ ] typecheck / lint / testがgreen

## スコープ外

- 新しいred→green/mutation evidence機構の設計・実装
- test-coverageのTC↔assertion対応精度改善
- testDerivationのscenario freeze契約変更
