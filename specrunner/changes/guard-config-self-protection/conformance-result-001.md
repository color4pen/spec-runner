# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-07 全チェックボックス完了 |
| design.md | ✅ | D1〜D4 全設計判断が実装に反映済み |
| spec.md | ✅ | 全 Requirement (SHALL) と全 Scenario がテストで固定済み |
| request.md | ✅ | 全 5 件の受け入れ基準を満たす。typecheck && test green |

---

## 詳細

### tasks.md

T-01 〜 T-07 の全チェックボックスが `[x]` 完了済み。

### design.md

**D1** — `.specrunner/config.json` に `{ "id": "guard-config", "paths": [".specrunner/config.json"] }` 追加済み。既存 3 surface は無変更。

**D2** — `ResumeCommand.prepare()` 最上部（job state 解決前・config 読み込み前）でガード発火。`PrepareError(2, ...)` で exit 2。

**D3** — `src/core/worktree/detection.ts` に `detectSpecrunnerWorktree(cwd)` 追加。`fs.realpath` 正規化後、`.git` → `specrunner-worktrees` の path segment 連続を検出。既存 `detectWorktree` は無変更。

**D4** — `worktreeGuardError("job resume", mainPath)` を再利用し、`guardErr.message` を `logError`、`guardErr.hint` を `stderrWrite("Hint: ...")` で出力。CLI dispatch 層と文言統一済み。

### spec.md

**Requirement 1（config forbidden surface、SHALL）**
- Scenario: fast job が config を変更すると breach 検出 → `fast-scope-checkpoint.test.ts` で verdict `escalation` + scope finding（origin `scope`, resolution `decision-needed`）1 件固定 ✅
- Scenario: config 未変更の fast job は breach にならない → TC-002 で verdict `approved` + scope findings 0 件固定 ✅

**Requirement 2（worktree 内 resume 拒否、SHALL）**
- Scenario: worktree 内 cwd からの resume は拒否される → `resume.test.ts` で exit 2、stderr `/cannot be run from inside a.*worktree/i` と `/Run from the main worktree/i` を固定 ✅。job state 解決前に停止することを exit code 差（2 vs 1）で検証 ✅
- Scenario: main checkout からの resume は従来どおり動作する → 既存テスト群（`cwd: tempDir`）が no-op 素通りを担保 ✅

### request.md

| 受け入れ基準 | 結果 |
|---|---|
| fast job が `.specrunner/config.json` を変更した fixture で conformance が breach を検出することがテストで固定される | ✅ |
| dogfooding テストが guard-config surface の宣言（id と path）を固定する | ✅ |
| worktree 内 cwd からの `job resume` が config 読み込み前に明示エラー（exit 非 0、main checkout への案内を含む）になることをテストで固定する | ✅ |
| main checkout からの `job resume` は従来どおり動作する（既存テスト無変更で green） | ✅ |
| `typecheck && test` が green | ✅ verification-result.md: 450 test files / 6192 tests 全 passed |

### スコープ適合

変更は `.specrunner/config.json`、`src/core/worktree/detection.ts`、`src/core/command/resume.ts`、および対応テスト 3 ファイルのみ。スコープ外（standard/design-only pipeline 拡張、conformance 機構変更、resume 以外のコマンドへの cwd 検証、hash 照合）への変更なし。
