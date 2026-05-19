# Design: verification-tc-coverage

## Overview

implementer が生成した test code が test-cases.md の must TC を網羅しているかを、verification step 内で機械的に検証する。LLM 自己申告ではなく、grep ベースの tool 検証で TC 漏れを早期検出し、build-fixer で自動修復する。

## ADR 判断

### ADR-1: TC ID 形式の統一 — フラット型 `TC-NNN` を正規形式とする

**Context**: 既存 test は `TC-070` フラット型、PR #331 の test は `TC-10-01` 階層型を使用。test-case-gen prompt の例示は `TC-{NNN}` フラット型。

**Decision**: **フラット型 `TC-NNN` を正規形式とする。grep パターンは両形式許容 (`TC-\d+(?:-\d+)*`) で実装する。**

- test-case-gen prompt: 既に `TC-{NNN}` を例示しており変更不要
- implementer prompt: TC ID 規律を追加する際、`TC-NNN` を例示する
- test-coverage phase: grep パターンを `TC-\d+(?:-\d+)*` とし、階層型も検出可能にする（既存 test の retrofit はスコープ外のため）
- 正規化なし: `TC-10-01` を `TC-1001` に変換するような正規化は行わない。test-cases.md 内の TC ID 文字列と test code 内の TC ID 文字列の完全一致で判定する

**Rationale**: test-case-gen prompt が既にフラット型を指定しており、prompt を変えないのが最小変更。既存の階層型 test を壊さないために grep は両形式対応。

### ADR-2: implementer completionVerdict — 案 B (verification 集約)

**Context**: request.md の案 A (implementer 側で tasks_completed 検証) vs 案 B (verification に TC 検証を集約)。

**Decision**: **案 B を採用。implementer の `completionVerdict: "success"` はそのまま維持。TC 網羅性の機械的検証は verification の test-coverage phase に集約する。**

**Rationale**:
- implementer の `implementation-notes.md` は現在生成されていない（`resultFilePath: null`）。案 A は implementer に結果ファイル生成を要求する大幅な変更
- verification は既に「implementer の自己申告を信頼しない機械的ゲート」として機能している（build/test/lint 失敗の検出）。TC 網羅性検証もこの責務に自然に合致する
- 案 B は既存の verification ↔ build-fixer ループに乗るため、pipeline 遷移テーブルの変更が不要
- implementer の責務は「実装して worktree に書き出す」に留め、検証は downstream に委ねる設計原則と整合

### ADR-3: test-coverage phase の実行方式 — CLI 内部処理

**Context**: 既存 5 phase は `bun run <script>` を spawn する設計。test-coverage は test-cases.md パース + grep であり、package.json script に対応しない。

**Decision**: **test-coverage phase は CLI 内部処理として `runVerification` 内で直接実行する。package.json script spawn の対象外とする。**

**Rationale**:
- test-cases.md のパスは specrunner 固有（`specrunner/changes/<slug>/test-cases.md`）であり、target project の package.json に test-coverage script を要求するのは不適切
- grep 処理は純粋な file I/O であり、子プロセス spawn のオーバーヘッドが不要
- `PHASE_SCRIPTS` マッピングに追加しない代わりに、`PHASE_NAMES` に追加して fail-fast 順序と verification-result.md 出力に統合する

## 設計

### 1. PhaseName 型と実行分岐の拡張

`src/core/verification/phases.ts`:
- `PhaseName` に `"test-coverage"` を追加
- `PHASE_NAMES` 配列の末尾に追加: `["build", "typecheck", "test", "lint", "security", "test-coverage"]`
- `PHASE_SCRIPTS` には `test-coverage` を追加しない（script spawn 対象外）

`src/core/verification/runner.ts`:
- `runVerification` のループ内で `phaseName === "test-coverage"` の場合に分岐
- `PHASE_SCRIPTS` に存在しない phase は従来 "skipped" だったが、test-coverage は `scriptExists` ではなく専用関数 `runTestCoveragePhase` を呼ぶ
- 分岐判定: `PHASE_SCRIPTS` にキーが存在するかで判定する（`phaseName in PHASE_SCRIPTS`）。存在しない phase は内部処理 phase として扱う
- **型整合**: `PHASE_SCRIPTS` の型を `Record<ScriptPhaseName, string>`（`ScriptPhaseName = Exclude<PhaseName, "test-coverage">`）にすることで、`phaseName in PHASE_SCRIPTS` が型ガードとして機能し、コンパイルエラーを防ぐ

### 2. test-coverage phase の処理

新規ファイル `src/core/verification/test-coverage.ts`:

```typescript
interface TestCoverageResult {
  status: "passed" | "failed" | "skipped";
  missingTcIds: string[];
  totalMustTcs: number;
  foundTcIds: string[];
  stdout: string;  // human-readable summary for verification-result.md
}
```

処理フロー:
1. `specrunner/changes/<slug>/test-cases.md` を読み込む（存在しなければ `status: "skipped"`）
2. Priority: must の TC ID を section-scan アプローチで抽出:
   - `^##[#]?\s+(TC-\d+(?:-\d+)*)` で TC section header を全列挙（h2 / h3 両対応）
   - 各 section の後続行群を次の `##` が出現するまで走査し、`\*\*Priority\*\*:\s*must` の存在で判定
   - bullet prefix あり（`- **Priority**: must`）と なし（`**Priority**: must`）の両方を許容
3. `tests/` 配下の全 `.ts` / `.test.ts` ファイルを再帰取得
4. 各ファイルの内容を読み、各 must TC ID が少なくとも 1 ファイルに出現するか確認
5. 未出現の TC ID があれば `status: "failed"` + `missingTcIds` に記録
6. stdout に human-readable summary を生成:
   ```
   test-coverage: 15/18 must TCs covered
   Missing: TC-003, TC-012, TC-017
   ```

### 3. verification-result.md への統合

test-coverage phase の結果は他の phase と同じ形式で verification-result.md に記録される:
- Phase Results テーブルに行を追加
- `## Phase: test-coverage` セクションに stdout（TC 網羅状況の summary）を出力
- 既存の `extractVerificationFailures` パーサーがそのまま動作する（テーブル行の "failed" 判定とコードブロック抽出の汎用ロジック）

### 4. build-fixer との連携

test-coverage phase が failed の場合:
- verification verdict = "failed" → pipeline が build-fixer に遷移（既存遷移テーブルそのまま）
- build-fixer は verification-result.md の `## Phase: test-coverage` セクションから missing TC リストを読み取れる
- build-fixer system prompt に test-coverage 失敗時の対処規律を追加: 「test-coverage phase 失敗 = TC ID が test code に記載されていない。test-cases.md を読み、missing TC ID に対応するテストを追加する」

### 5. prompt 変更

**implementer-system.ts**:
- 実装手順のテスト記述ルールに追加: 「test 関数名または直前の comment に対応 TC ID（例: `TC-001`）を必ず記載する。後続の verification step が TC ID の存在を grep で検証する」
- 例示: `it("TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ", ...)`

**test-case-gen-system.ts**:
- TC ID が implementer の test code で必須参照される旨を補足（既に `TC-{NNN}` 形式を指定済み、大きな変更なし）
- 「implementer は TC ID を test 関数名 / comment に記載する規律がある。TC ID は一意かつ安定的に grep 可能であること」を追記

**build-fixer-system.ts**:
- test-coverage phase 失敗時の対処を追加: 「Phase: test-coverage が failed の場合、verification-result.md に記載された missing TC ID を確認し、test-cases.md から該当 TC の GIVEN/WHEN/THEN を読み取り、対応する test を追加する」

### 6. fail-fast 順序

```
build → typecheck → test → lint → security → test-coverage
```

test-coverage が末尾にある理由:
- test phase が green でないと TC 網羅性を測る意味がない（test 自体が壊れている状態で coverage を見ても無駄）
- lint / security も通過してから TC 網羅性を検証する（lint 修正で test code が変わる可能性がある）
- build-fixer が test-coverage 失敗を受け取った時点で build/typecheck/test/lint/security は全て green であることが保証される

### 7. test-cases.md 不在時の振る舞い

test-cases.md が存在しない change（test-case-gen step がスキップされたケース）では:
- test-coverage phase は `status: "skipped"` で記録
- verification verdict に影響しない（skipped は failed に算入されない、既存設計と整合）
- `TestCoverageResult.stdout` に skip 理由を含める（例: `"test-cases.md not found at specrunner/changes/<slug>/test-cases.md"`）。runner.ts は test-coverage の skipped 結果を既存の "_(skipped — script not found in package.json)_" 文言でなく `result.stdout` をそのまま verification-result.md に出力する

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/core/verification/phases.ts` | `PhaseName` に `"test-coverage"` 追加、`PHASE_NAMES` に追加 |
| `src/core/verification/runner.ts` | test-coverage phase の分岐処理を追加 |
| `src/core/verification/test-coverage.ts` | **新規**: test-coverage phase の処理ロジック |
| `src/prompts/implementer-system.ts` | TC ID 記載規律を追加 |
| `src/prompts/test-case-gen-system.ts` | TC ID の downstream 参照規律を補足 |
| `src/prompts/build-fixer-system.ts` | test-coverage 失敗時の対処規律を追加 |
| `specrunner/specs/verification-runner/spec.md` | **delta spec**: test-coverage phase の Requirement 追加 |
| `specrunner/specs/test-case-generator/spec.md` | **delta spec**: TC ID 記載規律の Requirement 追加 |
| `specrunner/specs/implementer-session/spec.md` | **delta spec**: TC ID 記載規律の Requirement 追加 |
| `specrunner/specs/build-fixer-session/spec.md` | **delta spec**: test-coverage 失敗対処の Requirement 追加 |
