# Regression Gate Result — Iteration 1

- **change**: aozu-integration-gates
- **iteration**: 1
- **verdict**: approved

## Findings Verification

### [HIGH] TC-010（must）未充足 — archive コミットへのファイル包含が未検証

- **status**: fixed
- **evidence**: `tests/unit/core/design-layer/orchestrator-hook.test.ts` lines 260–329 に TC-010 積分テストが実装済み。実 temp git リポジトリ（`mkdtempSync`）を構築し、fake SpawnFn が `mark implemented` 呼び出し時に `design/state.json` を書き込む。`vi.importActual` で実 `commitArchive` を取得して実行し、`git show --name-only HEAD` の出力に `design/state.json` が含まれることを `expect(filesInCommit).toContain(stateFile)` でアサートしている。

### [MEDIUM] unknown-slug（exit 1）時の警告が重複出力される

- **status**: fixed
- **evidence**: `src/core/design-layer/mark-hook.ts` の exit 1 分岐（77–79 行）は `stderrWrite` を呼ばず `return { status: "unknown-slug" }` のみ返す（コメント: "Caller (orchestrator) handles the warning."）。警告出力は `src/core/archive/orchestrator.ts` 297 行の `stderrWrite(...)` 一箇所に集約されており、重複排除済み。

### [LOW] TC-004/TC-005 呼び出し元結線テスト欠如

- **status**: fixed
- **evidence**:
  - TC-004 (`executeValidate` + gate failure → return 1): `tests/unit/core/command/request.test.ts` 345–399 行に実装済み。`designLayer.enabled: true` な config と `exitCode: 1` を返す fakeSpawn を渡して `executeValidate` が 1 を返すことを検証している。
  - TC-005 (`runPreflight` + gate failure → throw SpecRunnerError): `tests/core/preflight.test.ts` 121–161 行に実装済み。`runDesignLayerCheckGate` を `{ passed: false }` にオーバーライドして `runPreflight` が `SpecRunnerError`（code: `DESIGN_LAYER_CHECK_FAILED`）を throw することを検証している。

### [LOW] Runtime グループのコメント件数が陳腐化

- **status**: fixed
- **evidence**: `src/core/doctor/checks/index.ts` 52 行のコメントが `// Runtime (4 — gh CLI check removed: no longer required)` に更新済み。`nodeVersionCheck` / `packageManagerCheck` / `gitVersionCheck` / `aozuCliCheck` の 4 件と一致している。

## Contradictions

なし。TC-010 積分テストが `vi.importActual` を用いて module-level mock を局所的にバイパスしているが、他の TC-ORCH-DL-001〜005 テストはモック済みの `commitArchive` を引き続き使用しており干渉しない。
