# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証

**src/prompts/test-materialize-system.ts**

- 行 93-98: `expected-red` の定義に「green は欠陥（何も見張っていないテスト）」「書き直してから再実行する」「完了不可」が含まれることを確認。request の前提記述と一致。
- 行 96-98: `fail しなかった新挙動テスト（expected-red が green）は「何も見張っていないテスト」であり、書き直してから再実行する。期待と観測の不一致は完了不可とし…` の命令を実際に確認。
- 行 161: initial message に `confirm they fail (red) as expected` が含まれることを確認。
- 行 108-113: Evidence step 固有要求に「実行したコマンド」「対象テストファイル」「観測結果（fail / pass の件数）」「期待分類（expected-red / expected-green）」が全て含まれることを確認。

**src/core/step/implementer.ts**

- 行 198: `const testsMaterialized = Boolean(state.steps?.[STEP_NAMES.TEST_MATERIALIZE]?.length);` — 実行歴の有無のみで判定する実装を確認。
- 行 82-98: `testsMaterialized = true` の分岐で `write production code only, do NOT create or modify test files` が明文で含まれることを確認。

**src/core/step/bite-evidence/oids.ts**

- `resolveBaseCandidateOids`: base = 最新 test-materialize run の commitOid、candidate = 最新 implementer run の commitOid として解決する実装を確認。順序前提の検証は無い。

**src/core/step/bite-evidence/gate.ts**

- 行 234-274: base が passed（green）の場合 `verified = false`、最終的に `verdict: "failed"` を返すことを確認（line 241: `const verified = !basePassed && candidatePassed;`）。

**src/core/pipeline/types.ts**

- 行 260: `{ step: STEP_NAMES.BITE_EVIDENCE, on: "failed", to: "escalate" }` — failed → escalate 遷移を確認。

### 既存テストとの衝突確認

**tests/unit/prompts/test-materialize-red-check-contract.test.ts**（要更新テスト）

- TC-001 (行 84-89): `methodSection.includes("書き直して") || methodSection.includes("何も見張っていないテスト")` → 要件 1 の実装後に false になる。
- TC-002 (行 141-148): `green は欠陥` の存在を assert → 要件 1 の実装後に false になる。
- TC-002 (行 159-165): `完了不可` の存在を assert → 要件 1 の実装後に false になる。
- これらは Requirement 4 の「更新対象テストの全列挙」として design で対応が必要。

**tests/unit/step/test-materialize-boundary.test.ts**（要更新テスト）

- TC-TMB-05 (行 205-214): `msg.toLowerCase().toMatch(/do not create or modify test|test files must not be created or modified/i)` → 要件 2 の実装後に false になる。
- これも Requirement 4 の列挙対象。

### RuntimeStrategy ポート確認

`src/core/port/runtime-strategy.ts` を確認した。現行 interface に `isAncestorCommit` 相当のメソッドは存在しない。要件 3 の bite-evidence 前提破れ検知には祖先判定が必要であり、design 工程で新 port メソッドの定義が必要。

### FORWARD_TYPES スコープ確認

gate.ts 行 36: `FORWARD_TYPES = new Set(["bug-fix", "new-feature"])` — 本 request の type `spec-change` は strategy-deferred で素通りする。要件 3 の修正は bug-fix / new-feature の再走シナリオに適用される。スコープは整合している。

### アーキテクト評価済み設計判断の確認

- 「引き算で直す」方針: 条件分岐追加でなく命令削除を採用。理論的に正しい（前提が破れているならその前提に乗った権威を消すのが根本対処）。
- 「前提破れは判定不能の明示」: escalate でなく strategy-deferred と同じ経路に流す設計。dead-end 再生産を防ぐ観点で妥当。
- 「materialize commit = base の意味付けはまだ消さない」: 置換先（Evidence Base）なしに消すと gate が拠り所を失う。後続 request で置換と同時削除する設計。理にかなっている。

## 検証できなかった項目

- bite-evidence gate の e2e テスト（`src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts`）は動的実行を必要とするため静的確認のみ。
- oids.ts の「step run の時系列順序で以前の implementer commitOid を特定する」実装はまだ存在しない（要件 3 は新規実装）。

## Findings 詳細

### Finding 1: bite-evidence 前提破れ検知に必要な RuntimeStrategy ポートが未定義

要件 3 の実装には、ある commitOid が別の commitOid の祖先かを判定する操作が必要（`git merge-base --is-ancestor <candidate> <base>` 相当）。現行の `RuntimeStrategy` にはこの操作が無い。design 工程で:

1. `RuntimeStrategy` に `isAncestorCommit?(oid: string, possibleAncestor: string, cwd: string): Promise<boolean | null>` 相当のオプションメソッドを追加する
2. `RealRuntimeStrategy` に必須メソッドとして追加する
3. ManagedRuntime は常に `null`（判定不能 = strategy-deferred に倒す）

これは設計上の自然な拡張であり、パターンは既存の `listCommitChangedFiles?` / `runTestsAtCommit?` と同じ。

### Finding 2: test-materialize-red-check-contract.test.ts の期待値反転

要件 1 で「書き直し」「green は欠陥」「完了不可」を削除すると、`test-materialize-red-check-contract.test.ts` の TC-001/TC-002 のうち上記の文言が存在することを assert するテストが fail する。Requirement 4 の「更新対象の全列挙」で名指しして期待値を反転させること。列挙漏れが AC「列挙外の既存テストは無変更で green」違反になる。

### Finding 3: test-materialize-boundary.test.ts TC-TMB-05 の期待値更新

要件 2 で「テスト変更禁止」指示を削除すると、TC-TMB-05 が assert する `do not create or modify test|test files must not be created or modified` パターンが該当しなくなる。design の更新列挙に含めること。
