# Review Feedback 005 — permission-layer-git-write-denial

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

Iteration 5 review. Verified against test-cases.md (TC-001 through TC-061) and acceptance criteria in request.md.

---

## 前回指摘の解消確認

### F-1（iteration 4）解消済み — `git branch` long-form mutation フラグ欠落

`isBranchMutationFlag` に `--delete` / `--move` / `--copy` / `--force` が追加された（`git-command-classifier.ts:181-184`）。TC-009 に対応する long-form ケース（`git branch --delete foo` 等 4 件）が追加されテスト固定された。

---

## 受け入れ基準トレース

| 受け入れ基準 | 状態 | 根拠 |
|-------------|------|------|
| classifier 単体テスト（TC-001〜TC-009、パイプ・`&&` 連結含む） | ✅ | `git-command-classifier.test.ts` TC-001〜TC-009 + F-ALIAS（long form 追加済み） |
| guard 単体テスト（scoped/guarded deny・allow, pipeline 管理パス, cwd 境界） | ✅ | `workspace-tool-guard.test.ts` TC-011〜TC-033 網羅テスト |
| allow 経路が `updatedInput` パススルーを維持 | ✅ | TC-033 / TC-013 / TC-014; deny 経路 `updatedInput` 欠落も TC-034 相当で確認 |
| probe 実行記録（R5 の 5 シナリオ） | ✅ | `design.md` D6 に 2026-07-23 実行記録（観測 B 確定 + 全 5 シナリオ PASS） |
| 既存の write-scope / 合成 / egress テストが無改変で green | ✅ | `write-scope.ts` / `round-git-scope.ts` / `commit-push.ts` の diff ゼロを git diff で確認 |
| 破壊確認（revert でテストが fail） | ✅ | TC-037 が Bash 非含有を固定（revert → fail）; TC-011 が scope なし Bash mutation deny を固定（revert → fail） |
| `typecheck && test` green | ✅ | verification-result.md: 9075 tests passed, 1 skipped; typecheck / build / lint 全 exit 0 |

---

## Findings

### F-1 [warn] tasks.md T-07 のチェックリストコメントが実装と食い違う

**場所**: `specrunner/changes/permission-layer-git-write-denial/tasks.md` T-07

```
- [x] TC-SB-02: Bash を allowedTools に維持したため変更不要（TC-SB-02 は変更なしで green）
```

`TC-SB-02` は実際には `autoAllowBashIfSandboxed: false` かつ `allowedTools` が Bash を含まないことを検証するように更新されている（`sandbox-scope.test.ts:160-183`）。設計 `design.md` の Risks 節も「Bash 除去に伴い TC-SB-02 の更新が必要」と記しており、tasks.md の記述と実装が乖離している。

コードの正しさには影響しない（テスト自体は新挙動を正確に固定している）。tasks.md の追跡記録に誤りが残る。

---

### F-2 [info] TC-FW-04 テスト説明文が旧挙動の命名のまま

**場所**: `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts:195`

```typescript
it("allows Bash with any command", async () => {
    const guard = createWorkspaceToolGuard(tempDir);
    const result = await guard("Bash", { command: "git status" }, stubOptions);
    expect(result.behavior).toBe("allow");
```

「any command」は旧実装（全 Bash pre-approve）時の命名。現在のガードは git 状態変更 Bash を deny するため「any command」は不正確。テスト本体は正しい（`git status` は read-only → allow）。命名のみの問題。

---

## コード品質所見

- **allowlist 反転の根拠記録**: 最新 commit（`b99affcf3`）が alias 迂回パスの具体的な 2-hop 経路（`git config alias.p push` → `git p` → 直 push）を commit message と design.md D2 に明文化。F-ALIAS test suite が同経路を deny として静的固定。

- **DSM closure の維持**: `buildStepContext`（core 層）が `pipelineManagedPaths` / `forbiddenWritePaths` を pre-compute し `AgentWriteScope` 経由で adapter に渡す。adapter は `core/pipeline` / `core/step` を直接 import せず許可規則の単一ソース（`write-scope.ts`）が保たれている（`architecture/core-invariants.test.ts` で自動検証）。

- **`writeScope` optional の補完**: TC-039 / TC-040 が `buildStepContext` の scoped / guarded 両方で `writeScope` 設定をテスト固定し、本番配線の緩みを抑止している。`writeScope` が無い場合の fallback（strictly-weaker: cwd 境界のみ）も TC-035/TC-036 相当で確認済み。

- **tag conditional の一貫性（観察）**: `git branch` は `--list/-l` 検出後に mutation フラグを二重チェックするが、`git tag` は `-l/--list` で即 read 返却する。`git tag -a v1.0 -l` 等の git が自体で拒否するコマンドに限られ、実害リスクは negligible。設計方針「多重防御 + 回避不能性を主張しない」と整合。

---

## 検証した項目

- `src/adapter/claude-code/git-command-classifier.ts` 全体（ALWAYS_MUTATING / CONDITIONAL / READ_ONLY / 未知 deny の実装）
- `src/adapter/claude-code/agent-runner.ts`（`buildWorkspaceSandbox` / `createWorkspaceToolGuard` / `baseAllowedTools` / `queryOptions` 組み立て）
- `src/core/port/agent-runner.ts`（`AgentWriteScope` interface / `AgentRunContext.writeScope?` 追加）
- `src/core/step/step-context-builder.ts`（Step 7 writeScope 計算・設定箇所）
- `src/util/paths.ts`（`dotSpecrunnerDirRel()` 追加確認）
- テストファイル: `git-command-classifier.test.ts` / `workspace-tool-guard.test.ts` / `sandbox-scope.test.ts` / `step-context-builder.test.ts` / `paths.test.ts`
- `design.md` D6 probe 実行記録テーブル（観測 B + 5 シナリオ PASS）
- `git diff main...HEAD -- src/core/step/write-scope.ts` → 0 lines（TC-053 相当）
- `git diff main...HEAD -- src/core/pipeline/round-git-scope.ts` → 0 lines（TC-054 相当）
- `git diff main...HEAD -- src/core/step/commit-push.ts` → 0 lines（TC-055 相当）
- `verification-result.md`（9075 tests passed / typecheck / lint / build 全 pass）
- tasks.md T-07 と実テスト実装の照合（F-1 発見）
- `review-feedback-004.md` の前回指摘確認（F-1 解消済み確認）

## 検証できなかった項目

- probe の実 SDK 実行（`ANTHROPIC_API_KEY` が必要な integration）。design.md D6 に観測 B 確定と全 5 シナリオ PASS の記録があり代替確認済み。

## Findings 詳細

F-1（warn）: tasks.md T-07 の追跡コメントが実装と食い違う。コードの正しさには無関係。  
F-2（info）: TC-FW-04 のテスト説明文「any command」が旧挙動の命名のまま。機能影響なし。
