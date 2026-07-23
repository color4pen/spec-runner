# Tasks: 既存テストによる must TC 充足のトレーサビリティコメント規約

## 全体制約（全タスク共通）

- `src/core/verification/test-coverage.ts` は **無変更**（検査ロジックを変えない）。
- `specrunner/changes/<slug>/test-cases.md` に `covered-by` 等の新フィールドを追加しない。
- test-coverage の既存テスト（`tests/unit/core/verification/test-coverage.test.ts` ほか）は
  無改変で green を維持する。新規の fixture テストは既存テストファイルを編集せず別ファイルに置く。
- `typecheck && test` が green。

## T-01: test-materialize system prompt に既存テスト充足の正規手順を追記する

- [x] `src/prompts/test-materialize-system.ts` の `TEST_MATERIALIZE_BASE` の `## Method` 節内に、
      既存テスト充足時の分岐手順を追記する。手順の要点:
  - 各 must TC について、変更前から存在するテストで当該振る舞いが既に検証されているかを確認する。
  - 既に充足されている場合: 新規テストを重複作成せず、その既存テストの該当箇所（describe / it の近傍）に
    `// TC-0XX: <TC 名>` トレーサビリティコメントを 1 行追記する。これが coverage 検査
    （test file 内の TC-ID リテラル走査）を満たす正式手段である。**充足不能として停止しない**。
  - 既存テストがない場合: 従来どおり新規テストコードを書く。
  - いずれの場合も test-cases.md は変更禁止（新フィールドを足さない）。
- [x] 追記は新しい `##`（h2）見出しを作らず `## Method` 節の内側に置く。
- [x] 手順は「既存テスト」という汎用語で記述し、`architecture/` 等のリポジトリ固有パスを参照しない。

**Acceptance Criteria**:

- `TEST_MATERIALIZE_SYSTEM_PROMPT` に、既存テスト充足時のトレーサビリティコメント手順・コメント形式
  （`// TC-`）・重複作成しない旨・停止しない旨が含まれる（prompt contract テストで固定される）。
- prompt contract テストは、上記手順の文言を prompt 全文でなく **`## Method` 節の抽出結果**
  （セクション抽出ヘルパで `## Method` から次の `##` までを切り出した範囲）に対して assert し、
  Method 節外への追記が AC を通過する経路を塞ぐ（5 節構成 drift-guard は節の存在・順序のみで
  位置を検証しないため）。
- `TEST_MATERIALIZE_SYSTEM_PROMPT` に `architecture/` が含まれない。
- `TEST_MATERIALIZE_SYSTEM_PROMPT` の Question/Contract/Method/Evidence/Completion 5 節構成と順序が
  維持される（`prompt-skeleton-drift-guard.test.ts` が green）。
- `src/core/verification/test-coverage.ts` は無変更。

## T-02: 走査規約とトレーサビリティ規約を docs に明文化する

- [x] `docs/test-coverage.md`（新規）を作成し、以下を記述する:
  - test-coverage が must TC のカバレッジを test file 内の TC-ID リテラル走査で検証すること
    （出現形式を区別しない / found TC は per-file で assertion 存在を確認すること）。
  - 既存テストが既に must TC を充足している場合、その既存テストに `// TC-0XX: <TC 名>`
    トレーサビリティコメントを追記することが充足の正式表明手段であること。
  - コメントのみで assertion を伴わないファイルは assertionless で failed になる点（追記先は
    assertion を持つ既存テストであること）。
- [x] `docs/README.md` の「docs/ ファイル一覧」表に `test-coverage.md` の行を追加する。

**Acceptance Criteria**:

- `docs/test-coverage.md` に「TC-ID リテラル走査」と「トレーサビリティコメントによる既存カバレッジの表明」
  の双方が記述されている。
- `docs/README.md` のファイル一覧に `test-coverage.md` が載っている。
- `guarantees.md` の版号・保証番号（G1-1〜G1-6）は変更しない。

## テストの取り扱い（downstream 参照用）

以下のテストは test-case-gen → test-materialize が本 spec の Scenario から生成・materialize する。
実装者（implementer）は T-01 / T-02 でこれらを green にする（コメント形式カバレッジのテストは
現行 test-coverage 実装で既に green になる characterization テストである）:

- prompt contract テスト: `TEST_MATERIALIZE_SYSTEM_PROMPT` が既存テスト充足手順を含むことを固定
  （T-01 完了までは red）。
- coverage fixture テスト: TC-ID がコメント形式でのみ + 同一ファイルに assertion があるとき passed に
  なることを固定（test-coverage.test.ts を編集せず新規ファイルに配置）。
- docs 規約テスト（存在する場合）: docs に走査規約 + トレーサビリティ規約が記述されていることを固定
  （T-02 完了までは red）。
