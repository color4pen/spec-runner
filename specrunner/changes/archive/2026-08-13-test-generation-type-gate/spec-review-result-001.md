# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### ソースコード attestation の照合（request.md の前提）

- `src/config/type-config.ts:28` — `TYPE_CONFIG` が行 28 から始まることを確認。5 type 定義済み。chore の `specRequired: false` を確認
- `src/config/type-config.ts:105` — `isSpecRequired()` が `TYPE_CONFIG[type]?.specRequired ?? true` パターンであることを確認。unknown type は fail-closed (true)
- `src/core/pipeline/types.ts:236` — `SPEC_REVIEW approved → TEST_CASE_GEN` (unconditional) の行番号一致を確認
- `src/core/pipeline/types.ts:239/241/244/248/251-252` — TEST_CASE_GEN/TEST_MATERIALIZE/IMPLEMENTER/BITE_EVIDENCE の各遷移行番号を確認。全一致
- `src/core/pipeline/types.ts:244` — `SPEC_FIXER approved → TEST_CASE_GEN when specFixerForwardsToTestGen` の guarded row を確認
- `src/core/step/implementer.ts:157-159` — `{ path: test-cases.md, required: false }` を確認。欠如耐性あり
- `src/core/verification/test-coverage.ts:305-317` — test-cases.md 欠如時 `status: "skipped"` を確認。stdout に skip 理由あり
- `src/core/verification/runner.ts:358-361` — `verification.coverage` 未設定時 `coverageSkipNote` を設定して gate をスキップすることを確認

### pipeline.ts の first-match-wins と when guard の動作確認

- `pipeline.ts:363-364` — `transitions.find(t => t.step===cur && t.on===outcome && (!t.when||t.when(state)))` を確認。guarded row を unconditional row の**前**に挿入すれば免除 type のみ分岐する設計が成立することを検証
- `pipeline.ts:459-466` — approved re-route 補正（fixer budget 枯渇時）でも `(!t.when || t.when(state))` が評価され、guarded row が `when` を尊重することを確認。chore では IMPLEMENTER への guarded row が TEST_CASE_GEN の unconditional row より先にマッチする

### achieved-assurance.ts の archive floor 影響確認

- `FORWARD_TYPES = Set(["bug-fix", "new-feature"])` を確認。chore は既に除外済みで biteEvidence は strategy-deferred になる
- bite-evidence step 自体も `FORWARD_TYPES` で chore を除外済み（gate.ts:83）。設計の Risk 記述が正確であることを確認

### design.md の設計決定の正当性検証

**D1 (testGenRequired フラグ)**: `isSpecRequired` と完全に同型の実装（`TYPE_CONFIG[type]?.testGenRequired ?? true`）。既存パターンへの追従として適切。

**D2 (guarded row の順序)**: first-match-wins + approved re-route の両者が `when` guard を尊重する実装を確認済み。挿入順序の要件が技術的に正当であることを検証。

**D3 (specFixerForwardsToImplementer)**: `specFixerForwardsToTestGen` の実装（条件1: conformance 起点でない、条件2: 最新 spec-review が approved）を確認。合成 `&& isTestGenExempt(state)` により、非免除 type は既存の TEST_CASE_GEN 行に落ちる。正確。

**D4 (coverage gate skip)**: `finalizeVerificationRun` に optional 末尾引数 `requestType` を追加し、免除チェックを `failed` チェックより前に置く設計。既存呼び出し（requestType=undefined）は fail-closed（非免除）になる。backward compat 成立を確認。

**D5 (実行維持)**: command/phase ループに触れない設計。verification コマンド実行ループは `runVerificationCommands`/`runVerificationPhases` 内に閉じており、coverage gate の skip は `finalizeVerificationRun` 内のみ。スコープ分離が正確。

### spec.md の要件・シナリオ検証

- 4 Requirement すべてに normative keyword（MUST/MUST NOT/SHALL/SHALL NOT）が含まれることを確認
- 9 Scenario すべてが Given/When/Then 形式で具体的な振る舞いを記述していることを確認
- 受け入れ基準 5 項目 → spec シナリオのカバレッジを検証:
  - chore 遷移固定: Req 2 の Scenario 1/2 が対応
  - unknown fail-closed: Req 1 の Scenario 3 が対応
  - coverage gate skip 明示: Req 3 の Scenario 1/2 が対応
  - 既存テスト実行維持: Req 4 の Scenario 1 が対応
  - 非免除 type 不変: Req 2 の Scenario 4 が対応

### tasks.md の受け入れ基準 → spec 対応確認

- T-01 (TYPE_CONFIG フラグ): `isTestGenRequired("chore") === false`、5 known type、unknown/空文字 fail-closed のテストが指定されている
- T-02 (predicate モジュール): `isTestGenExempt`/`specFixerForwardsToImplementer` の動作が spec 経由でカバーされている
- T-03 (STANDARD_TRANSITIONS): guarded row 3 本の挿入順序と既存行不変がテストで固定される
- T-04 (coverage gate): requestType を plumb する箇所が verification.ts の呼び出し 1 点のみで変更範囲が明確
- T-05 (受け入れ基準テスト): 5 観点が spec の 5 Requirement に 1:1 対応

### セキュリティ確認

- `requestType` は shell コマンドやファイルパスに展開されない。TYPE_CONFIG のオブジェクトキー検索と stdout テンプレート文字列挿入のみ。injection リスクなし
- `isTestGenRequired(undefined) === true` の fail-closed により、型破壊・null 注入時に免除されない
- 新規ネットワーク呼び出し・認証面の追加なし

## 検証できなかった項目

None

## Findings 詳細

### F-01: T-02 で新規 predicate モジュールのファイル名が未指定

tasks.md T-02 は「`src/core/pipeline/` 配下に pure-predicate モジュールを新設」と指示するが、ファイル名を指定していない。実装者が spec-observation.ts / reverification.ts と同系統の名称を選ぶことになるが、レビュー時に期待するパスが曖昧になる。

推奨修正: tasks.md T-02 に `src/core/pipeline/test-gen-exemption.ts`（または類似の一貫した名称）を明記する。acceptance criteria に「typecheck が green（types.ts を import しない）」は指定されているため、機能的問題はないが、実装場所の明示により review 容易性が向上する。

### F-02: T-05 で build 失敗 + 免除 type + coverage 設定ありの組み合わせが未明示

T-05 の coverage 明示 skip 観点は「coverage 設定ありで免除 type の verification 実行が `changed-line-coverage` phase を skipped として残す」を assert する。D4 の設計では exempt チェックを `failed` チェックより前に置くため、build が失敗した場合でも coverage skip 理由は `"test-generation-exempt request type: chore"` になる（`"previous command failed"` ではない）。この組み合わせが T-05 の acceptance criteria に明示されていない。

動作は正しく意図的（より情報量の高い skip 理由が表示される）であり、`anyFailed=true` → `verdict=failed` の判定は変わらない。ただし、実装者が `failed=true` 状態でも exempt skip message が出ることを意識したテストを書くと保証が強化される。severity は低く、fixable（T-05 の acceptance criteria に 1 行追記する程度）。
