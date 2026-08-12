# Tasks: test-materialize の自己 red 確認

## 全体制約（全タスク共通）

- 変更対象は `src/prompts/test-materialize-system.ts` の system prompt 文言のみ。FSM 遷移・output contract・
  完了検出方式・test-materialize agent 定義は変更しない。
- 追記はすべて既存 5 節骨格（Question / Contract / Method / Evidence / Completion）の内側に散文 / bullet で置き、
  新規 h2 見出しを追加しない。既存の manual / gate スキップ block・トレーサビリティコメント手順は改変しない。
- `expected-red` / `expected-green` はリテラル（ハイフン付きの英字トークン）でそのまま prompt に記述する。
- 実行手段・テストコマンドを CLI / config に持たせる新機構は導入しない。実行方法は agent の裁量である旨を prompt に明記する。
- test-materialize は pipeline-parse される result file を持たない（`resultFilePath()` は `null`）。記録先は完了報告
  （Evidence）であり、prompt に "result file" を記録先として名指ししない。
- 既存テストは無改変で green。新規挙動を固定するテストは既存テストファイルを編集せず別ファイルに置く。
- `typecheck && test` が green。

## T-01: Method 節に実行・fail 観測・期待分類を追加する

- [x] `src/prompts/test-materialize-system.ts` の `## Method` Step 6（現行 `test-materialize-system.ts:92` の
      「テストは意図的に red（fail）で構わない — 実装がまだ存在しないため。implementer が green にする。」の 1 行）を、
      新規テストの実行と fail 観測を義務化する記述に置換する:
  - 新規に書いた各テストは、完了報告の **前に** 実行し、fail（red）することを観測してから完了する。
  - fail しなかった新挙動テストは「何も見張っていないテスト」であり、書き直してから再実行する。
  - 実行は新規テストファイル単位でまとめて行ってよい（turn 消費を抑える）。実行方法はプロジェクトの既存テスト
    コマンドへのファイル指定など agent の裁量とし、新しい設定・CLI 機構は導入しない。
- [x] 同 Step 6 に `expected-red` / `expected-green` の 2 分類と一致確認を追加する:
  - `expected-red`: 新挙動を検証するテスト。base（現在の worktree、実装なし）で fail が正常。green は欠陥
    （何も見張っていないテスト）。implementer が後続で green にする。
  - `expected-green`: 既存挙動の保持確認テスト、および Method Step 3 の既存テストへのトレーサビリティコメント追記。
    base で green が正常。
  - 期待と観測の不一致（`expected-red` が green / `expected-green` が red）は完了不可とし、`expected-red` が green の
    テストは書き直して再実行する。修正または再分類する場合はその根拠を Evidence に記す。
- [x] 追記は `## Method` 節の内側に置き、新規 h2 見出しを作らない。既存 Step 1〜5・manual/gate スキップ block・
      トレーサビリティコメント手順は改変しない。リポジトリ固有のテスト配置パスを参照しない。

**Acceptance Criteria**:

- `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Method` 節に、新規テストを完了報告の前に実行し fail（red）を観測して
  から完了する旨と、fail しない新挙動テストは書き直して再実行する旨が含まれる（spec の実行・red 観測 Scenario を満たす）。
- `## Method` 節に `expected-red` / `expected-green` の 2 分類リテラルと、それぞれの base での期待（fail / green）、
  および不一致時の完了不可・修正/再分類根拠の Evidence 記載が含まれる（spec の期待分類 Scenario を満たす）。
- Question / Contract / Method / Evidence / Completion の 5 節構成と順序が維持され、Method 節内に新規 h2 見出しが無い。
- 既存 `test-materialize-prompt-contract.test.ts` / `test-materialize-manual-scope-contract.test.ts` /
  `test-materialize-gate-scope-contract.test.ts` の assertion は無改変で green。

## T-02: Evidence 節に実行観測記録を追加する

- [x] `src/prompts/test-materialize-system.ts` の `## Evidence` 節の step 固有 evidence 要求
      （現行 `test-materialize-system.ts:98-102`）に、新規テストの実行観測記録の項目を追加する:
  - 実行したコマンド。
  - 対象テストファイル。
  - 観測結果（fail / pass の件数）。
  - 各テスト（または describe 単位）の期待分類（`expected-red` / `expected-green`）。
  - 期待と観測の不一致があればその内容と対応（書き直し / 再分類の根拠）。
- [x] 既存の evidence 要求（変換した TC ID の一覧を記録する / 実装不可能 TC の明示列挙 / 各テストコードが対応
      TC ID を含む確認）は保持したまま追記する。記録先は完了報告（Evidence）とし、"result file" を記録先として
      名指ししない。新規 h2 見出しを作らない。

**Acceptance Criteria**:

- `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Evidence` 節に、実行したコマンド・対象テストファイル・観測結果
  （fail / pass の件数）・各テストの期待分類（`expected-red` / `expected-green`）の記録要求が含まれる
  （spec の観測記録 Scenario を満たす）。
- 既存の evidence 要求（変換 TC ID の一覧記録 等）が残存している。
- 5 節骨格・順序が維持され、Evidence 節内に新規 h2 見出しが無い。

## テストの取り扱い（downstream 参照用）

以下のテストは spec.md の Scenario から test-case-gen が採番し、test-materialize が materialize する。
implementer は T-01 / T-02 でこれらを green にする。新規テストは既存テストファイルを編集せず別ファイルに置く
（例: `tests/unit/prompts/test-materialize-red-check-contract.test.ts`。既存 `test-materialize-prompt-contract.test.ts`
/ `test-materialize-manual-scope-contract.test.ts` / `test-materialize-gate-scope-contract.test.ts` は編集しない）。

- test-materialize prompt red-check contract（新規ファイル）:
  - `## Method` 節に、新規テストを完了報告の前に実行し fail（red）を観測してから完了する旨と、fail しない新挙動
    テストは書き直して再実行する旨が含まれることを固定（T-01 完了までは RED）。
  - `## Method` 節に `expected-red` / `expected-green` の 2 分類リテラルと不一致時の完了不可・Evidence 記載が含まれる
    ことを固定。
  - `## Evidence` 節に実行観測記録（コマンド・対象ファイル・fail/pass 件数・期待分類）の記録要求が含まれることを固定。
  - 5 節骨格・順序が維持され、Method / Evidence 節に新規 h2 見出しが無いことを固定（regression）。
- **discriminator 規律（本 request の要点）**: 上記 assertion は現行 prompt に存在しないリテラル
  （`expected-red` / `expected-green`、fail/red の「観測」を表す新語）を判定に使う。緩い部分一致で変更前 prompt に
  誤マッチするもの（既出の "gate" / "lint" / "禁止" 等の単独部分一致）を判定に使わない。これにより契約テスト自身が
  「何も見張っていないテスト」にならないことを担保する。
- **破壊確認**: T-01 の Method Step 6 置換を一時的に元へ戻すと当該 red-check contract が fail することを
  verification / code-review の過程で確認し、歯の実在（fail-open でないこと）を証明する。
- **回帰**: 既存 3 契約テスト（prompt-contract / manual-scope / gate-scope）は無改変で green を維持する。

## T-03: 検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。

**Acceptance Criteria**:

- `typecheck && test` が green。
- 既存テスト（prompt-contract / manual-scope / gate-scope 群を含む）が無改変で green のまま（回帰なし）。
- 新規 red-check contract テストが green。破壊確認で歯の実在が確認済み。
