# test-materialize の自己 red 確認: 新規テストは fail を観測してから完了する

## Meta

- **type**: spec-change
- **slug**: test-materialize-red-check
- **base-branch**: main
- **adr**: false

## 背景

test-materialize は「実装が無いのでテストが red でも構わない」と指示されるだけで、書いたテストを実行しない。その結果、**実装が無くても green になるテスト**(何も見張っていないテスト)が検出されないまま通過する。実例として、直近の merge 済み PR のテストに 3 件が確認された: ハードコード文字列への同語反復 assertion 1 件(code-review が捕捉・削除)と、緩い正規表現が変更前から存在する文字列にマッチしてしまう assertion 2 件(全 gate を素通りし、事後の人手精読で発見)。

機械側の見張り確認(bite-evidence 節点)は base commit での実行手段が未設定のプロジェクトでは strategy-deferred で素通りするため、この型の欠陥に対する歯が現在存在しない。

対策の要点: **test-materialize が完了する時点の worktree は、まさに「テストあり・実装なし」の状態である**。書いた本人がその場で新規テストを実行し fail を観測すれば、過去 commit への checkout や実行コマンドの設定・導出機構は一切不要で、この欠陥型は著者時点で自己検出される。

## 現状コードの前提

- `src/prompts/test-materialize-system.ts:92` — Method 6 に「テストは意図的に red（fail）で構わない — 実装がまだ存在しないため。implementer が green にする。」とあり、実行・fail 観測の要求は無い
- 同ファイルの Evidence 節(`step 固有の evidence 要求`)は、変換した TC ID の列挙・実装不可能 TC の明示・TC ID 含有確認のみで、テスト実行結果の記録要求は無い
- 同ファイル Method 3 — 既存テストが TC を充足する場合はトレーサビリティコメント追記で対応する(この経路のテストは実装済み挙動を検証しており green が正当)
- `src/core/pipeline/types.ts:248-254` — bite-evidence 節点は implementer 後に位置し、strategy-deferred は素通りして verification へ遷移する

## 要件

1. **実行と fail 観測の義務化** — test-materialize の system prompt に追加する: 新規に書いた各テストは、完了報告の前に実行し、fail(red)することを観測する。fail しなかった新挙動テストは「何も見張っていないテスト」であり、書き直してから再実行する。実行は新規テストファイル単位でまとめて行ってよい(turn 消費を抑える)。実行方法はプロジェクトの既存テストコマンドへのファイル指定など agent の裁量とし、新しい設定・CLI 機構は導入しない。

2. **期待分類の導入** — 各テスト(または describe 単位)を次の 2 分類のいずれかに割り当て、期待と観測の一致を確認する:
   - `expected-red`: 新挙動のテスト。base(現在の worktree)で fail が正常。green は欠陥
   - `expected-green`: 既存挙動の保持確認テスト、および既存テストへのトレーサビリティコメント追記。green が正常
   不一致(expected-red が green / expected-green が red)は完了不可とし、修正または再分類の根拠を evidence に記す。

3. **観測記録の義務化** — Evidence 要求に追加する: 実行したコマンド、対象テストファイル、観測結果(fail/pass の件数)、各テストの期待分類を result file に記録する。

## スコープ外

- bite-evidence 節点(機械側の見張り確認)の有効化・挙動変更・strategy-deferred の可視化
- test-materialize 以外の step への同種規律の適用
- 意図的に虚偽報告をする agent への防御(機械実行の領分であり、本 request は「本人が気づいていないミス」型を対象とする)

## 受け入れ基準

- [ ] test-materialize system prompt に「新規テストを実行し fail を観測してから完了する」指示が含まれることをテストで固定する
- [ ] test-materialize system prompt に expected-red / expected-green の期待分類とその一致確認の指示が含まれることをテストで固定する
- [ ] test-materialize system prompt の Evidence 要求に観測記録(コマンド・対象ファイル・観測結果・分類)が含まれることをテストで固定する
- [ ] 既存テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **機械実行(bite-evidence 節点の有効化)ではなく著者の自己確認を選ぶ** — 確認された実害 3 件はすべて「著者が気づいていないミス」型であり、著者がその場で実行すれば自己修正される。機械実行はプロジェクト別のテスト実行手段を CLI が知る必要があり(設定追加または導出機構)、コストが見合わない。却下した代替案: base commit checkout での機械実行(時間旅行と実行手段の設定が必要)、偽の失敗テストによる実行系較正(仕掛けが本末転倒)、全 suite の base 実行(実行時間が過大)。
- **expected-green 分類を認める** — 既存挙動の保持確認テストと既存テストへの注記は base で green が正当。分類なしに全テストへ red を要求すると、正当な保持確認テストが書けなくなる。この分類は将来 bite-evidence 節点を有効化する際の判定カテゴリにもそのまま流用できる。
- **実行方法は agent 裁量** — implementer / build-fixer が既にプロジェクトのテスト実行を日常的に行っており、同じ知識で足りる。CLI に実行手段の知識を持たせる必要はない。
