# Design: test-materialize の自己 red 確認

## Context

test-materialize は test-cases.md の must TC をテストコードに変換して worktree に書き出す step である。
その完了時点の worktree は「テストあり・実装なし」の状態であり、これは pipeline 上で意図された正しい状態
（base OID commit）である。

現状の system prompt（`src/prompts/test-materialize-system.ts`）は、書いたテストを **実行しない**:

- `## Method` Step 6（`test-materialize-system.ts:92`）は「テストは意図的に red（fail）で構わない — 実装がまだ
  存在しないため。implementer が green にする。」と受動的に許容するのみで、実行・fail 観測の要求が無い。
- `## Evidence` 節の step 固有 evidence 要求（`test-materialize-system.ts:98-102`）は、変換した TC ID の列挙・
  実装不可能 TC の明示・TC ID 含有確認のみで、テスト実行結果の記録要求が無い。

この結果、**実装が無くても green になるテスト**（何も見張っていないテスト）が検出されずに通過する。実害として
直近の merge 済み PR で 3 件確認された（ハードコード文字列への同語反復 assertion 1 件、緩い正規表現が変更前から
存在する文字列にマッチする assertion 2 件）。

機械側の見張り確認である bite-evidence 節点（`src/core/pipeline/types.ts:248-254`）は implementer 後に位置し、
base commit での実行手段が未設定のプロジェクトでは `strategy-deferred` で verification へ素通りするため、この
欠陥型に対する歯は現在存在しない。

対策の要点: test-materialize が完了する時点の worktree はまさに「テストあり・実装なし」なので、**書いた本人が
その場で新規テストを実行し fail を観測すれば**、過去 commit への checkout や実行手段の設定・導出機構は一切
不要で、この欠陥型は著者時点で自己検出される。これは system prompt への規律追記のみで達成できる。

**現状コードの確認事項（本設計で追加検証済み）**:

- test-materialize agent は標準ツールセット（`AGENT_TOOLSET_TYPE` = `agent_toolset_20260401`）を持つ
  （`src/core/step/test-materialize.ts:30-33`）。ファイル read/write に加え shell 実行が可能であり、
  実装済みの implementer / build-fixer と同じ手段で新規テストファイルを実行できる。実行手段を CLI が知る必要はない。
- test-materialize は pipeline-parse される result file を持たない（`resultFilePath()` は `null` を返す
  — `src/core/step/test-materialize.ts:111-117`）。完了は session idle + output contract（test-coverage）で
  検出される。したがって「観測記録の記録先」は専用 result file ではなく、既存 evidence 要求（変換 TC ID の列挙等）
  と同じ **完了報告（Evidence / report_result）** である。

## Goals / Non-Goals

**Goals**:

- test-materialize の system prompt に、新規に書いた各テストを完了報告の前に実行し fail（red）を観測する義務を追加する。
- 各テスト（または describe 単位）を `expected-red` / `expected-green` に分類し、期待と観測の一致を確認する規律を追加する。
- 実行観測（コマンド・対象ファイル・fail/pass 件数・期待分類）を Evidence として記録する義務を追加する。
- 上記追記を既存 5 節骨格（Question / Contract / Method / Evidence / Completion）の内側に置き、新規 h2 見出しを追加しない。
- 既存の Method（manual / gate スキップ、トレーサビリティコメント手順）を無改変で保つ。

**Non-Goals**:

- bite-evidence 節点（機械側の見張り確認）の有効化・挙動変更・`strategy-deferred` の可視化。
- test-materialize 以外の step への同種規律の適用。
- 意図的に虚偽報告をする agent への防御（機械実行の領分。本 request は「本人が気づいていないミス」型を対象）。
- test-materialize の output contract（test-coverage）や FSM 遷移・完了検出方式の変更。
- 実行手段・テストコマンドを CLI / config に持たせる新機構の導入。

## Decisions

### D1: 実行と fail 観測の義務を Method Step 6 に置き、受動的許容文を置換する

`## Method` Step 6（現行 `test-materialize-system.ts:92` の 1 行）を、新規テストを完了報告前に実行し fail（red）を
観測する能動的義務に置換する。fail しなかった新挙動テストは「何も見張っていないテスト」であり書き直して再実行する旨、
実行は新規テストファイル単位でまとめてよい旨（turn 消費抑制）、実行方法はプロジェクトの既存テストコマンドへの
ファイル指定など agent 裁量とし新しい設定・CLI 機構を導入しない旨を含める。

- **Rationale**: 実行と観測は「テストを書く」手順の一部なので Method に属する。既存 Step 6 が担っていた
  「red は正しい / implementer が green にする」という文脈は `expected-red` 分類の定義（D2）に畳み込んで継続させる。
  追記は散文 / bullet で行い、Method 節内に新規 h2 を作らない（既存 skeleton テストの回帰を防ぐ）。
- **Alternatives considered**:
  - 機械実行（bite-evidence 節点の有効化）— プロジェクト別のテスト実行手段を CLI が知る必要があり
    （設定追加または導出機構）、確認された実害 3 件はすべて「著者が気づいていないミス」型で著者実行により
    自己修正されるため、コストが見合わない（request の architect 判断で却下済み）。
  - 新規 h2 節（例 `## Self-check`）を追加 — 5 節骨格を崩し既存 skeleton 契約テストを壊す。Method 内に畳む。

### D2: `expected-red` / `expected-green` の 2 分類と一致確認を Method に導入する

各テスト（または describe 単位）を次のいずれかに分類し、期待と観測の一致を確認する規律を Method に追加する:

- `expected-red`: 新挙動を検証するテスト。base（現在の worktree、実装なし）で fail が正常。green は欠陥
  （何も見張っていないテスト）。implementer が後続で green にする。
- `expected-green`: 既存挙動の保持確認テスト、および Method Step 3 の既存テストへのトレーサビリティコメント追記。
  base で green が正常。

不一致（`expected-red` が green / `expected-green` が red）は完了不可とし、`expected-red` が green のテストは
書き直して再実行する。修正または再分類する場合はその根拠を Evidence に記す。

- **Rationale**: 全新規テストに一律 red を要求すると、既存挙動の保持確認テストや Step 3 のトレーサビリティ
  コメント追記（実装済み挙動を検証するため base で green が正当）が書けなくなる。分類により両者を区別する。
  この分類は将来 bite-evidence 節点を有効化する際の判定カテゴリにもそのまま流用できる（request の architect 判断）。
  `expected-red` / `expected-green` は現行 prompt に存在しないリテラルであり、契約テストの discriminator として
  安全に機能する（D4 参照）。
- **Alternatives considered**:
  - 分類語を持たず「新規テストは red / 既存注記は green」と手順文だけで書く — 契約テストが名指しできる安定した
    リテラルが無く、緩い正規表現に頼らざるを得ない（本 request が対象とする欠陥そのもの）。明示リテラルを採る。

### D3: 観測記録を Evidence 節の step 固有要求に追加する（記録先は完了報告）

`## Evidence` の step 固有 evidence 要求（`test-materialize-system.ts:98-102`）に、新規テストの実行観測記録を追加する:
実行したコマンド、対象テストファイル、観測結果（fail / pass の件数）、各テスト（または describe 単位）の期待分類
（`expected-red` / `expected-green`）、および期待と観測の不一致があればその内容と対応。

- **Rationale**: 「何を根拠として提示するか」は Evidence 節の管轄であり、既存の「変換した TC ID の一覧を記録する」と
  同じ場所に並べるのが構造的に正しい。test-materialize は pipeline-parse される result file を持たない
  （`resultFilePath()` は `null`）ため、記録先は専用ファイルではなく既存 evidence と同じ **完了報告** である。
  request 本文の「result file に記録」は、result file を持たない本 step では完了報告（Evidence）に対応する。
  この読み替えを prompt 文言にも反映し（"result file" と書かない）、下流 reviewer が存在しない result file を
  探して誤 finding を上げるのを防ぐ。
- **Alternatives considered**:
  - test-materialize に新規 result file を導入する — FSM・output contract・parse 経路の変更を伴い Non-Goals に反する。
    既存の完了報告チャネルで足りる。

### D4: 契約テストは base prompt に存在しないリテラルを discriminator に使う（本 request のドッグフーディング）

受け入れ基準を固定する契約テスト（test-materialize が spec Scenario から materialize する新規ファイル）は、
現行 prompt に存在しない語（`expected-red` / `expected-green`、および fail/red の「観測」を表す新語）を assertion の
discriminator に使う。既存の "gate" / "lint" / "禁止" 等が別文脈で既出であるのと同様、緩い部分一致は変更前 prompt に
誤マッチしうるため避ける。

- **Rationale**: 本 request が対象とする欠陥は「緩い正規表現が変更前から存在する文字列にマッチする」型である。
  契約テスト自身がその型の欠陥を持てば本末転倒なので、変更前 prompt を対象に走らせたとき確実に fail する
  （＝ `expected-red` として実在する歯を持つ）リテラルを選ぶ。この契約テストは実装前 RED であることを完了条件に含める。
- **Alternatives considered**:
  - 既存の `test-materialize-*-contract.test.ts` を編集して assertion を足す — 既存テストの無改変 green（受け入れ基準）
    を崩すリスクがある。新規ファイルに分離する（既存 manual / gate scope contract と同じ流儀）。

## Risks / Trade-offs

- [契約テストが緩い部分一致で変更前 prompt に誤マッチし、実装前から green になる（本 request の欠陥型の再発）]
  → D4 のとおり `expected-red` / `expected-green` 等の base 不在リテラルを discriminator にし、契約テストが
  実装前は RED であることを検証する。必要なら Method Step 6 置換を一時的に戻すと当該テストが再び fail することを
  破壊確認し、歯の実在を証明する。
- [Method 節への追記で 5 節骨格・順序が崩れ既存 skeleton 契約が回帰する] → 追記はすべて Method / Evidence の内側に
  散文 / bullet で置き、新規 h2 を作らない。既存 `test-materialize-prompt-contract.test.ts` /
  `test-materialize-manual-scope-contract.test.ts` / `test-materialize-gate-scope-contract.test.ts` を無改変で green に保つ。
- [agent が「実行手段が分からない」と停止する] → 実行手段は既存テストコマンドへのファイル指定など裁量である旨を
  明記し、standard toolset の shell 実行で足りることを前提とする（implementer / build-fixer と同じ知識）。CLI に
  実行手段の知識は持たせない。
- [新規テストの実行で scratch / build 出力が tracked 対象に混入する] → 既存 `COMMIT_DISCIPLINE`（生成物衛生規律）が
  既に規定しており、追加規律は不要。

## Open Questions

- なし（bite-evidence 節点の機械実行化は本 request のスコープ外として request で確定済み。将来有効化する際に
  `expected-red` / `expected-green` 分類を判定カテゴリに流用する方針も request で確定済み）。
