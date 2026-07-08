# Tasks: audit-cleanup-bundle

## T-01: coverage gate の spawnCommand に root を渡す

### 実装

- [x] `src/core/verification/changed-line-coverage.ts` の `RunGateOptions` interface に `root?: string` フィールドを追加する
- [x] `runChangedLineCoverageGate` 内の `spawnCommand(commandStr, cwd, env)` 呼び出しを `spawnCommand(commandStr, cwd, env, options.root)` に変更する
- [x] `src/core/verification/runner.ts` の `runChangedLineCoverageGate` 呼び出し箇所（2 箇所）に `root` を追加する
  - `runVerificationCommands` 内（~line 398）: `{ slug, cwd, coverage, baseBranch, root }`
  - `runVerification` 内（~line 598）: `{ slug, cwd, coverage, baseBranch, root }`

### テスト

- [x] `tests/unit/core/verification/changed-line-coverage.test.ts` に TC-CLG-GATE-ROOT-01 を追加する
  - 実際にコマンドを実行して `$PATH` を出力させ、`root/node_modules/.bin` が含まれることを検証する
  - `RunGateOptions.root` に `/fake/root` を渡し、失敗した PhaseResult の stdout に `/fake/root/node_modules/.bin` が含まれることを確認する

**Acceptance Criteria**:
- `RunGateOptions` に `root?: string` が存在する
- `runChangedLineCoverageGate` は `root` を `spawnCommand` に渡す
- runner.ts の 2 箇所の呼び出しが `root` を渡す
- TC-CLG-GATE-ROOT-01 が green

---

## T-02: minChangedLineCoverage 未達の reason と失敗メッセージを区別する

### 実装

- [x] `src/core/verification/changed-line-coverage.ts` の `FailReason` 型に `"below-threshold"` を追加する
  ```ts
  export type FailReason = "not-loaded" | "unexecuted" | "below-threshold";
  ```
- [x] `evaluateChangedLineCoverage` の threshold branch（`minChangedLineCoverage !== undefined` かつ ratio < threshold）で `reason: "below-threshold"` を使うよう変更する
  ```ts
  failedFiles.push({ file, reason: "below-threshold" });
  ```
- [x] `stdout` 生成ブロック（lines 145-151）に `"below-threshold"` ケースを追加する
  - `reason === "below-threshold"` のとき: `  - ${file}: ${Math.round(ratio * 100)}% coverage (${executedLines.length}/${changedDaLines.length} changed DA lines executed), threshold ${Math.round(minChangedLineCoverage! * 100)}%`
  - そのために `evaluateChangedLineCoverage` 戻り値に ratio を含めるか、failedFiles に ratio フィールドを追加する
    - **判断**: `failedFiles` に `ratio?: number` を追加し、`"below-threshold"` のとき ratio を格納するのが最小変更
- [x] `FailedFile` interface に `ratio?: number` フィールドを追加する

### テスト

- [x] TC-CLG-08 の assertion を更新する: `reason` が `"below-threshold"` であることを検証する
- [x] TC-CLG-08 に stdout の assertion を追加する: 実行率（`33%` 相当）と閾値（`80%`）が stdout に含まれることを検証する
- [x] TC-CLG-01（全行未実行）が引き続き `reason === "unexecuted"` であることを確認する（変更不要のはずだが回帰確認として TC を読む）

**Acceptance Criteria**:
- `FailReason` に `"below-threshold"` が存在する
- 閾値設定あり・ratio < threshold → `reason === "below-threshold"`
- 閾値なし・全行未実行 → `reason === "unexecuted"`（既存挙動維持）
- TC-CLG-08 が `"below-threshold"` + 実行率/閾値を含む stdout を検証する

---

## T-03: ADR の minChangedLineCoverage 例 config と D10 を schema 準拠に修正する

### 実装

- [x] `specrunner/adr/2026-07-08-lcov-changed-line-gate.md` の line 57 を修正する
  - `"minChangedLineCoverage": 0` → `"minChangedLineCoverage": 0.8`
- [x] 同ファイルの line 130 を修正する
  - `指定時（0〜1）` → `指定時（>0〜1、例: 0.8）`

### テスト

- コード変更なし。受け入れ基準は ADR ファイルの内容レビューで確認する。

**Acceptance Criteria**:
- D2 例 config の `minChangedLineCoverage` 値が `0` でない（`0.8` または他の有効値）
- D10 の説明文が `>0` の制約を明示している
- 例 config をそのまま schema validation にかけても通る

---

## T-04: doctor の loadError hint を失敗ファイルパスで案内する

### 実装

- [x] `src/core/doctor/types.ts` の `DoctorConfig` interface に `loadErrorPath?: string` を追加する
  ```ts
  export interface DoctorConfig {
    get(path: string): unknown;
    loaded: boolean;
    loadError?: string;
    loadErrorPath?: string;   // ← 追加
  }
  ```
- [x] `src/cli/doctor.ts` の `buildDoctorConfig` 関数のシグネチャに `loadErrorPath?: string` を追加し、戻り値オブジェクトに含める
  ```ts
  function buildDoctorConfig(rawConfig: SpecRunnerConfig | null, loadError?: string, loadErrorPath?: string): DoctorConfig {
    return { loaded: rawConfig !== null, loadError, loadErrorPath, get(...) { ... } };
  }
  ```
- [x] `src/cli/doctor.ts` の `runDoctor` の catch ブロックを拡張し `configLoadErrorPath` を決定する
  ```ts
  let configLoadErrorPath: string | undefined;
  if (configLoadError) {
    if (configLoadError.includes("project local config")) {
      const repoRoot = await resolveRepoRoot(process.cwd()).catch(() => null);
      if (repoRoot) {
        configLoadErrorPath = path.join(repoRoot, ".specrunner", "config.json");
      }
    } else if (configLoadError.includes("user global config")) {
      configLoadErrorPath = getConfigPath();
    }
  }
  ```
  ※ `path` は `node:path`、`getConfigPath` は `../util/xdg.js` から import する（既存の import がない場合は追加）
- [x] `src/cli/doctor.ts` の `buildDoctorConfig` 呼び出しを `buildDoctorConfig(rawConfig, configLoadError, configLoadErrorPath)` に変更する
- [x] `src/core/doctor/checks/config/file-exists.ts` の hint を変更する
  ```ts
  hint: `Fix or regenerate ${ctx.config.loadErrorPath ?? configPath} by running 'specrunner init'.`,
  ```

### テスト

- [x] `tests/core/doctor/checks/config/file-exists.test.ts` に TC-073 を追加する
  - `config` に `loadError: "JSON parse error in project local config."` と `loadErrorPath: "/repo/.specrunner/config.json"` を設定する
  - `result.hint` に `/repo/.specrunner/config.json` が含まれ、user-global パス（`/fake/home/.config/specrunner/config.json`）が含まれないことを検証する
- [x] TC-072 が引き続き green であることを確認する（`loadErrorPath` 未設定時は `configPath` にフォールバック）

**Acceptance Criteria**:
- `DoctorConfig` に `loadErrorPath?: string` が存在する
- `loadErrorPath` が設定されているとき hint がそのパスを案内する
- `loadErrorPath` が未設定のとき hint が従来の user-global パスを案内する（後方互換）
- TC-073 が green

---

## T-05: TC-032 と T-PMI-01 を修正する

### T-05a: TC-032 を削除し理由をコメントで残す

- [x] `tests/unit/cli/ps-filter.test.ts` の TC-032 `describe` ブロック（line 359-393）を削除する
- [x] 削除箇所に以下のコメントを残す:
  ```ts
  // TC-032 was removed.
  // vi.mock cannot intercept calls that runPs makes to checkPrMerged within the same module
  // because runPs holds a reference to the original module-internal binding, not the re-exported
  // symbol. Rewriting to verify this behavior would require dependency-injecting checkPrMerged
  // as a parameter to runPs, which is out of scope.
  // The filtering behavior (awaiting-archive only) is implicitly covered by TC-027 and the
  // integration-level output assertions in the surrounding describe blocks.
  ```
- [x] ファイル先頭の JSDoc コメント（TC-032 の記述）を削除する

### T-05b: T-PMI-01 の同語反復 assertion を削除する

- [x] `src/core/archive/__tests__/merge-then-archive.test.ts` の T-PMI-01 テスト内の line 263-264 を削除する
  ```ts
  // The escalation text confirms the merge happened (MERGED)
  expect(FAKE_ESCALATION).toContain("MERGED");
  ```
  この 2 行のみを削除し、他の assertion（line 260-270）には触れない

**Acceptance Criteria**:
- `ps-filter.test.ts` に TC-032 の `describe` ブロックが存在しない
- 削除箇所に理由を説明するコメントが残っている
- `merge-then-archive.test.ts` の T-PMI-01 に `expect(FAKE_ESCALATION).toContain(...)` が存在しない
- T-PMI-01 に `expect("escalation" in result && result.escalation).toBe(FAKE_ESCALATION)` が残っている（実装出力の検証）
- `typecheck && test` が green
