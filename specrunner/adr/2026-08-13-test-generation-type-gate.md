# ADR: TYPE_CONFIG フラグによるテスト生成工程の宣言的 skip（chore type 免除）

- **Date**: 2026-08-13
- **Status**: Accepted
- **Slug**: test-generation-type-gate

## Context

STANDARD pipeline は全 request type で test-case-gen → test-materialize → bite-evidence を必ず通す。テスト生成は pipeline で最重量の工程であり（直近 55 job で約 7 万行のテストコードを生成）、振る舞い変更を伴わない chore（CI 設定・依存更新・ドキュメント修正）では この出力が成果に結びつかない。

`TYPE_CONFIG`（`src/config/type-config.ts`）は request type の単一正典であり、既に type 別免除の前例を持つ: `specRequired: false` で chore は spec 免除される（`isSpecRequired`）。unknown type は `?? true` で fail-closed。本変更は同型のフラグでテスト生成免除を導入する。

設計の前提として確認した既存挙動:

- **遷移解決は first-match-wins**（`pipeline.ts`: `transitions.find(t => ... (!t.when || t.when(state)))`）。guarded row を unconditional row より前に置くだけで、免除 type のみ分岐し非免除 type は既存 unconditional row に落ちる。
- **`when` guard は純関数** `(state: JobState) => boolean`。`state.request.type` から type を読める前例が複数ある（`specReviewHasRoutableFixables` / `specFixerForwardsToTestGen` / `reverificationNeeded`）。
- **approved 再ルート補正**（`pipeline.ts:459`）も `when` guard を尊重するため、免除 type でも IMPLEMENTER に正しく倒れる。
- **changed-line coverage gate** は `finalizeVerificationRun` 内で実行され、`verification.coverage` 未設定時のみ skip される。type 連動は無かった。
- **test-cases.md 欠如耐性**: implementer は `required: false`、`test-coverage.ts` は `status: "skipped"` を返す。生成工程を skip しても下流は正常動作する。

原則として「免除するのはテストの生成のみ。既存テストの実行（build / typecheck / lint / test suite）は全 type で維持する」を architect が確定させた。テスト生成の省略が成果に結びつかない chore に限定し、「壊していない」ことの機械確認は全 request に残す。

## Decision

`TYPE_CONFIG` に `testGenRequired: boolean` フラグを追加し、参照関数 `isTestGenRequired(type)` で型別に決定する。pipeline 遷移に `isTestGenExempt` / `specFixerForwardsToImplementer` predicate の guarded row を追加し、免除 type が test-case-gen / test-materialize / bite-evidence を通らずに直行できるようにする。changed-line coverage gate は免除 type で明示 skip する。

核心的な設計選択:

1. **`specRequired` と同型のフラグ `testGenRequired` を TYPE_CONFIG に追加**し、unknown type は fail-closed で `true`（免除されない）。type は起票時に必須選択されるため追加の宣言・設定・概念が不要。
2. **遷移分岐は既存 `when` guard パターン**で実装（新規 pure predicate モジュール）。guarded row を unconditional row の前に置き、非免除 type の既存 row は一切変更しない。
3. **SPEC_FIXER 再入経路は合成 predicate** `specFixerForwardsToImplementer = specFixerForwardsToTestGen && isTestGenExempt` で分岐。既存の `specFixerForwardsToTestGen` を再利用し、ロジックを複製しない。
4. **changed-line coverage gate の type 連動**は `finalizeVerificationRun` に `requestType` を末尾 optional 引数で plumb し、免除 type 時に `status: "skipped"` phase を明示挿入する。skip 理由と type 名を stdout に残す。`requestType` 未指定は fail-closed（非免除）で後方互換を保つ。

## Design Decisions

### D1: TYPE_CONFIG フラグ `testGenRequired` — assurance profile ではなく type 宣言に集約

`TypeConfigEntry` に `testGenRequired: boolean` を追加し、chore: `false`、new-feature / spec-change / refactoring / bug-fix: `true`。参照関数 `isTestGenRequired(type)` は `isSpecRequired` と同型: `return TYPE_CONFIG[type]?.testGenRequired ?? true;`。

- **Rationale**: type は起票時に必須選択される。フラグを TYPE_CONFIG に持たせることで免除の判断が起票時の 1 選択に集約され、走行中の agent 判断を挟まない。`specRequired` の前例に完全準拠し、新しい概念・設定を導入しない。
- **却下案**:
  - assurance profile（ADR-20260716 R6）: 宣言の間接層が増え、既存 type 選択と二重管理になる。選択の意味が分散する。
  - workflow options による request 単位 opt-out: request ごとに繰り返し書く運用になり、免除の契約が一貫しない。
  - chore 以外の type（例: docs 専用 type 新設）: chore の description（CI / 依存更新 / ドキュメント）が対象作業を既に包含する。語彙の重複になるため却下。

### D2: `when` guard パターンで遷移分岐 — chore 専用 PipelineDescriptor を持たない

新規モジュール `src/core/pipeline/test-gen-exemption.ts` に純関数 predicate を置く（`spec-observation.ts` / `reverification.ts` と同配置・同スタイル）。STANDARD_TRANSITIONS に guarded row を既存 unconditional row の**前**に追加するだけで非免除 row は一切変更しない。

追加した 3 行:
- `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt`
- `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer`
- `IMPLEMENTER success → VERIFICATION when isTestGenExempt`

- **Rationale**: first-match-wins（`pipeline.ts:363`）が guarded row を優先し、免除 type のみ分岐する。approved 再ルート補正（`pipeline.ts:459`）も `when` guard を尊重するため、免除 type でも IMPLEMENTER に正しく倒れる。テーブル駆動の既存思想（Step as data）に沿い、差分が最小。
- **却下案**:
  - chore 専用 PipelineDescriptor / 別 transition table: テーブル全体を複製し保守が二重化する。
  - executor / agent 側での分岐: 走行中の判断を挟み宣言性を失う（原則違反）。

### D3: SPEC_FIXER 再入経路は合成 predicate — `specFixerForwardsToTestGen` を変更しない

`specFixerForwardsToImplementer(state) = specFixerForwardsToTestGen(state) && isTestGenExempt(state)` を orthogonal 合成する。

- **Rationale**: 既存 predicate を再利用し、ロジックを複製しない。免除条件を AND 合成するだけで、非免除 type は合成 false で既存 `TEST_CASE_GEN` 行に落ち（無変更）、免除 type は合成 true で IMPLEMENTER に倒れる。
- **却下案**: `specFixerForwardsToTestGen` に免除条件を埋め込む → 非免除の既存行の意味が変わり「既存 row 不変」を崩す。

### D4: changed-line coverage gate の type 連動 — skip を明示して黙って通さない

`runVerification` に末尾 optional 引数 `requestType?: string` を追加し、`finalizeVerificationRun` まで伝播する。coverage 分岐（`coverage !== undefined`）で、`requestType` が設定されており `!isTestGenRequired(requestType)` のとき gate を実行せず、`phase: CHANGED_LINE_COVERAGE_PHASE, status: "skipped"` の PhaseResult を push する。stdout に免除理由と type 名を残す（`_(skipped — test-generation-exempt request type: ${type})_`）。免除チェックは `previous command failed` チェックより前に評価する。

- **Rationale**: 生成を免除して coverage で fail する矛盾を防ぐ。skip を result の phase に明示することで「黙って通さない」を満たす。`requestType` 未指定（legacy / 既存テスト）は fail-closed で非免除 → gate は従来通り実行される。
- **却下案**:
  - step 側で `verification.coverage` を剥がして渡す: skip 理由が「config 未設定」に化け、免除と区別できない。
  - step 側で result を後処理: runner の責務を step に漏らす。

### D5: 免除はテスト生成のみ — 既存テスト実行は全 type で維持

verification の command / phase 実行ループ（build / typecheck / test / lint / security）は一切触らない。

- **Rationale**: 「壊していない」ことの機械確認の床を全 request に残す（architect 判断）。トークン消費の主因はテスト生成側であり、実行維持のコストは許容範囲。
- **却下案**: 免除 type で test suite も skip する → 「壊していない」機械確認が消える。

## Alternatives Considered

### Alternative 1: assurance profile による type 選択からの分離

ADR-20260716 R6（assurance profile）で提案された概念: request type と独立した「assurance レベル」の宣言。

- **Pros**: type 選択と assurance の直交管理。将来 type が増えても assurance 組み合わせが独立。
- **Cons**: 宣言の間接層が 1 つ増える。既存 type 選択に加えて assurance profile も選ばせると、起票フォームの複雑性が上がる。型別免除の一貫した契約（例: chore は常に免除）が profile 選択の人間判断に変わる。
- **Why not**: type は起票時に必須選択される。specRequired / testGenRequired を TYPE_CONFIG に集約すれば追加の宣言・概念が不要。assurance profile は単純な 1 フラグ追加と比べてコスト対効果が悪い。

### Alternative 2: workflow options / request 単位 opt-out

`request.md` に `testGenRequired: false` フィールドを持たせ、request ごとに免除を宣言する案。

- **Pros**: request 単位で柔軟に制御できる。type の意味を拡張せずに個別制御できる。
- **Cons**: chore は常に免除すべき作業であり、毎 request に書く必要がある。書き忘れで一貫性が失われる。type 選択と免除宣言の二重管理になる。
- **Why not**: type 選択が既に「この作業が chore である」という宣言を内包している。type に直接フラグを持たせる方が契約として一貫する。

### Alternative 3: chore 専用 PipelineDescriptor / 別 transition table

chore 用に STANDARD_TRANSITIONS とは別の遷移テーブルを定義し、chore の job はそちらに dispatch する案。

- **Pros**: テーブルが独立しており、chore の遷移を自由に設計できる。guarded row の順序依存が無くなる。
- **Cons**: テーブル全体を複製し保守が二重化する。chore 以外の共通挙動（SPEC_REVIEW → SPEC_FIXER 等）も重複して定義する必要がある。
- **Why not**: 変更は 3 行の guarded row 追加で済む。テーブル複製は保守コストに対してリターンが無い。

### Alternative 4: executor / agent 側での分岐

pipeline engine ではなく、各 step executor または agent が「次のステップを決める」際に type を見て test-case-gen を skip する案。

- **Pros**: pipeline テーブルを変更せずに実装できる。
- **Cons**: 走行中の agent 判断を挟み、宣言的免除の原則に反する。分岐ロジックが executor に散在し、変更・追跡が困難になる。
- **Why not**: 「免除は type で宣言的に決まり、走行中の agent 判断を挟まない」が本変更の根幹原則。この案は原則違反になる。

## Consequences

- **additive 変更（非免除 type の挙動は不変）**: guarded row を追加するのみで既存 unconditional row は無変更。`requestType` は末尾 optional 引数で後方互換。既存テストは無改変で green。
- **chore の pipeline コスト削減**: test-case-gen / test-materialize / bite-evidence（最重量工程）が skip され、token・時間の消費が大幅削減される。
- **archive minimumAssurance floor gate との相互作用（fail-closed）**: `achieved-assurance.ts` は `testDerivation` を test-materialize の provenance から導出する。免除 type は test-materialize を通らず baseOid が null → `testDerivation` は absent → floor に `testDerivation` 制約があれば `satisfiesFloor` が false で archive がブロックされる（fail-closed）。これは chore が `minimumAssurance` の protectedPaths にマッチする変更を含む場合のみ発火する。assurance 制約下の protected path に触れる作業は chore ではない（振る舞い変更）ため、type を再分類すべき。コード変更は不要で、運用者が認識すべき trade-off として明記する。なお biteEvidence は既に `FORWARD_TYPES`（bug-fix / new-feature）で chore を除外済みのため regression は無い。
- **将来の type 拡張**: `docs` 専用 type の新設など type が増える場合、`testGenRequired: false` を再利用できる。現時点では chore の description が docs を包含するため新設しない。type 拡張時に本フラグの再利用可否を再検討する。
- **guarded row の順序依存**: guarded row を unconditional row の後に置くと免除 type が誤って TEST_CASE_GEN に落ちる。遷移テーブル順序をテスト（`test-gen-exemption.test.ts`、TC-012）で固定する。

## References

- Request: `specrunner/changes/test-generation-type-gate/request.md`
- Design: `specrunner/changes/test-generation-type-gate/design.md`
- Related ADR: `specrunner/adr/2026-07-03-spec-exempt-design-contract.md`（specRequired の前例）
- Related ADR: `specrunner/adr/2026-07-08-lcov-changed-line-gate.md`（changed-line coverage gate の確立。本 ADR はその type 連動 skip を記録する）
- Related ADR: `specrunner/adr/2026-07-22-coverage-type-only-structural-skip.md`（coverage gate skip の先例）
