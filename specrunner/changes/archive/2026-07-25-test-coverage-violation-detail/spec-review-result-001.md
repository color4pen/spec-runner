# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード前提の精度確認

request.md と design.md が参照する全コード前提を実ファイルで照合した。

| 前提 | 確認結果 |
|------|----------|
| `local.ts:1317-1333` — test-coverage 評価で `[...missingTcIds, ...assertionlessTcIds]` を detail に格納 | ✓ 正確（line 1331-1332）|
| `step-halt.ts:257-292` — makeOutputGateHalt が test-coverage は path に fall through | ✓ 正確（lines 263-268、`tasks-complete`/`content-format` のみ分岐）|
| `output-verify.ts:134-189` — buildOutputFollowUpPrompt に test-coverage 節なし | ✓ 正確（3 節のみ: tasks-complete/produced/content-format）|
| `step-context-builder.ts:108-122` — follow-up 契約から修復ループを構築 | ✓ 正確（`followUpContracts.length > 0` で `outputVerification` を構築）|
| `executor.ts:406-422` — 最終ゲートが followUp 残存でも halt | ✓ 正確（`followUp.length > 0` で halt 条件に含まれる）|
| `test-materialize.ts:87-97` — test-coverage 契約が `policy: "halt"` | ✓ 正確（line 94）|
| `test-coverage.ts` — evaluateTestCoverage が missingTcIds / assertionlessTcIds を区別して返す | ✓ 正確（`TestCoverageResult` 型に両フィールドが存在）|

### トレーサビリティ確認

request.md 要件 → design.md 設計決定 → spec.md 要件 → tasks.md タスクの一貫性を確認。

- 要件 1（halt メッセージ detail 描画）→ D2 → Requirement "halt メッセージに欠落 TC-ID を列挙" → T-03 ✓
- 要件 2（follow-up prompt test-coverage 節）→ D3 → Requirement "follow-up prompt が修復指示を生成" → T-04 ✓
- 要件 3（policy follow-up 化）→ D4 → Requirement "test-coverage 契約は follow-up policy" → T-05, T-06 ✓
- 要件 4（missing/assertionless 区別）→ D1 → Requirement "両集合を区別して保持" → T-01, T-02 ✓

request.md の全受け入れ基準が tasks.md のタスクに対応。

### 設計の内部整合性

**D1（coverage 構造化フィールド）**:
- `OutputViolation` に `coverage?: { missingTcIds: string[]; assertionlessTcIds: string[] }` を追加する方式は、既存の `ContentFormatCheck` が `OutputContract` の任意フィールドとして存在するパターンと一致する。
- `detail` を union のまま維持することで既存テスト（TC-TMB-13 の `detail.toContain("TC-001")`）は無改変で green になる。optional フィールドなので他 kind への影響なし。

**D2（halt メッセージ描画）**:
- `makeOutputGateHalt` の `violationPaths` map に分岐を追加するパターンは既存の `tasks-complete`/`content-format` と同型。
- `error.message` と `error.hint` の両方に `violationPaths` が含まれる（line 274, 275）ため、T-03 の「`error.message` または `error.hint`」条件を満たす。

**D3（follow-up prompt）**:
- test-materialize は `capabilities: { gitWrite: true }` を持つため（test-materialize.ts line 34）、follow-up prompt 末尾の "commit and push" 指示は agent 能力と整合する。

**D4（policy 変更）**:
- `step-context-builder` は `followUpContracts.length > 0` のときのみ `outputVerification` を構築する。policy 変更前は test-materialize に follow-up 契約ゼロ → 未構築。変更後は 1 契約 → 構築される。この分岐動作は design.md に正しく記述されている。
- agent-runner の follow-up loop（line 948）は `v.policy === "follow-up"` フィルタを使うため、policy 変更後の test-coverage violation がループに拾われる。

**TC-TMB-13/14/15/16 への影響**:
- これらのテストは contracts を自前で `{ kind: "test-coverage", path: ..., policy: "halt" }` と明示構築している（test-materialize.ts 由来のコントラクトを使っていない）。
- test-materialize.ts の policy 変更は TC-TMB-13..16 に影響しない。設計の説明通り。

**TC-TMB-04 の更新**:
- T-05 に "TC-TMB-04 の `expect(contracts[0]?.policy).toBe("halt")` を `"follow-up"` に更新する" が明示されている。これは必要最小限の変更。

### セキュリティ観点

- **TC-ID の安全性**: `extractMustTcIds` が `TC-\d+(?:-\d+)*` regex にマッチする文字列のみを返す。英数字とハイフンのみで構成されるため、halt メッセージ・follow-up prompt への埋め込みに injection リスクなし。
- **`tcIdBoundaryRe` のエスケープ**: line 147 で `replace(/[.*+?^${}()|[\]\\]/g, "\\$&")` を適用しており、TC-ID が regex special char を含む場合も安全（TC-ID のフォーマット上は該当しないが defense-in-depth として適切）。
- **外部入力経路**: test-cases.md は operator または前段 agent が書くもので、外部の直接入力ではない。CLI ツールであるため OWASP Web 10 項目（XSS/CSRF/SQLi 等）は非適用。

### 受け入れ基準のカバレッジ

request.md の全 6 受け入れ基準が tasks に対応し、各 task の Acceptance Criteria でテスト固定されている。T-07（全体検証）が `typecheck && test` を最終確認する。

## 検証できなかった項目

- **実行テストの結果**: `bun run test` を実行していないため、既存テストが実際に green であるか（変更前の状態）は実行確認していない。コード前提とテスト構造の分析から問題ないと判断した。
- **agent-runner の output follow-up loop と executor 最終ゲートの実際の integration**: これはランタイム実行が必要であり、spec review 範囲外。tasks.md の T-06 でテスト固定を要求している。

## Findings 詳細

### Finding 1: test-cases.md 不在ケースで follow-up 化後に無効な repair attempt が発生しうる（軽微）

**分類**: suggestion（非ブロッキング）

**観察**:
`local.ts:1325` の test-cases.md 不在パスは:
```ts
violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: ["test-cases.md not found"] });
```
policy を `contract.policy` からそのまま取る。test-coverage 契約が "follow-up" になると、test-cases.md 不在の violation も "follow-up" policy になる。

この violation は agent-runner の follow-up loop に拾われ、`coverage` が undefined のため T-04 の fall-back 指示 `(see <path> for uncovered must TCs)` を送信する。test-materialize は test-cases.md を書くステップではないため（reads() に primary input としてリストされているが writes() にない）、agent はこの指示に従えない。`OUTPUT_FOLLOWUP_MAX_ATTEMPTS` 回の無効な repair attempt の後、executor 最終ゲートで従来通り halt する。

**影響範囲**: test-cases.md が test-materialize 実行中に削除されるという極めて稀なケースのみ。test-cases.md は `reads()` で `required` 入力（line 75 コメント "primary input: required"）として宣言されており、step 入力検証が先に失敗するはずで、output contract 検証まで到達しない可能性が高い。

**推奨**: 実用上の影響は小さく、ブロッキングではない。実装時に `test-cases.md not found` 分岐の violation policy を `"halt"` に固定することで repair attempt を回避できるが、必須ではない。

### Finding 2: assertionless 検出のファイル粒度（既存制限、スコープ外）

**分類**: pre-existing（本 request のスコープ外）

**観察**:
`evaluateTestCoverage` の assertionless 判定（lines 222-228）はファイルレベル: TC-ID を含むファイルのいずれかに `expect(`/`assert(`/`assert.` が存在すれば assertionless でないと判定される。TC-ID が comment として出現し、同一ファイルに無関係な assertion がある場合は assertionless として検出されない。

これは既存の判定ロジックであり、本 request のスコープ（「coverage 判定ロジックの変更はスコープ外」）が明示的に除外している。follow-up prompt で "assertionless → assertion を追加する" 指示を出す場合、実際には false negative（assertionless として検出されない）が存在しうる。

**影響**: 本 request の変更には影響しない。設計上の前提として記録する。
