# Code Review Feedback — detached-run-lifecycle iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `design.md` / `tasks.md` / `test-cases.md` を精読し、受け入れ基準・設計判断を確認
- iter 1 findings（F-001〜F-004）の修正状況を確認
- `src/core/command/runner.ts` — `emitForegroundNotice(process.env)` 呼び出しの追加確認（iter1 F-001 fix）
- `src/cli/job-wait.ts` — worktree guard 追加確認（iter1 F-002 fix）、`includeArchived: true` 追加確認（iter1 F-003 fix）
- `src/core/command/detach.ts` — DETACH_MARKER_ENV / isDetachedChild / stripDetachFlag / buildDetachGuidance / detachSelf 再確認
- `src/core/command/operational-guidance.ts` — FOREGROUND_NOTICE / emitForegroundNotice 再確認
- `src/util/spawn.ts` — SpawnBackgroundOptions 拡張確認（detached / logFilePath / rawEnv / index signature）
- `src/util/xdg.ts` — getDetachLogPath 確認
- `src/cli/command-registry.ts` — run / job start / job resume --detach ハンドラ、job wait 登録、USAGE 確認
- `src/cli/job-show.ts` — Detach log 行表示確認
- `src/core/command/__tests__/detach.test.ts` — TC-001/002/003/005 確認
- `src/cli/__tests__/job-wait.test.ts` — TC-010〜TC-018/TC-029 確認（process-death gate・fallback・終了コード）
- `src/cli/__tests__/detach-flag-cli.test.ts` — TC-004/TC-023/TC-024 確認
- `src/cli/__tests__/detach-output-contract.test.ts` — TC-019/TC-026/TC-027/TC-028 確認
- `src/util/__tests__/spawn-background-detach.test.ts` — TC-008/TC-009/TC-021/TC-022 確認
- `src/cli/__tests__/job-show-detach-log.test.ts` — TC-007/TC-025 確認
- `src/util/__tests__/xdg-detach-log.test.ts` — TC-006 確認
- `tests/unit/architecture/arch-allowlist.ts` — B-6 allowlist 追加項目の妥当性確認
- `docs/operations.md` — detach + wait 標準フロー記載確認
- `verification-result.md` — typecheck / test / lint / coverage すべて green 確認
- `job-wait.ts` の `lastKnownPid` ロジックをトレースし TC-013 の aliveForTicks:2 コメントの整合性確認

## 検証できなかった項目

None — すべての受け入れ基準を実装レベルで確認済み。

## iter 1 Findings 修正確認

| iter1 finding | 重大度 | 修正状況 |
|---|---|---|
| F-001: emitForegroundNotice が本番コードから呼ばれていない | HIGH | ✓ 修正済み（runner.ts:121 で呼び出し） |
| F-002: job wait に worktree guard なし | MEDIUM | ✓ 修正済み（runJobWait 冒頭で detectSpecrunnerWorktree） |
| F-003: makeDefaultDeps が includeArchived: true なし | MEDIUM | ✓ 修正済み（`JobStateStore.list(root, { includeArchived: true })`） |
| F-004: SpawnBackgroundOptions に index signature | LOW | △ 未修正（引き継ぎ、F-003 として記録） |

## 受け入れ基準 確認結果

| 受け入れ基準 | 対応 TC | 判定 |
|---|---|---|
| --detach spawn: detached:true + log redirect + unref + marker（破壊確認込み） | TC-001, TC-003, TC-008, TC-009 | ✓ |
| detach 親が pipeline を実行せずに案内して exit 0 | TC-002 | ✓ |
| 再帰防止: マーカー付き子は再 spawn しない | TC-005 | ✓ |
| job wait: pid 生存中は status に関わらず待ち続ける（破壊確認込み） | TC-010, TC-011 | ✓ |
| job wait: 死亡後に status で報告・終了コード | TC-012, TC-015, TC-016, TC-017, TC-029 | ✓ |
| job wait: pid 不在 → isStaleRunning fallback | TC-014 | ✓ |
| job wait: slug 不在 → exit 2 | TC-018 | ✓ |
| 起動時案内・detach 親出力・help の文言存在 | TC-019 | ✓ |
| foreground 無変更（既存テスト green） | TC-020（10262 tests） | ✓ |
| spawnBackground 既存呼び出し元無変更 | TC-008 | ✓ |
| typecheck && test green | TC-030 | ✓ |

## Findings 詳細

### F-001 LOW — TC-011 "settledEarly" チェックが到達不能コード（misleading sabotage evidence）

`src/cli/__tests__/job-wait.test.ts` TC-011 の sleep モック内:

```typescript
isProcessAlive: vi.fn((_pid: number) => {
  tickCount++;               // tickCount は isProcessAlive 内で increment される
  if (tickCount === 1) return true;
  return false;
}),
sleep: vi.fn(async () => {
  if (tickCount === 0) settledEarly = true;  // ← sleep が呼ばれる時点で tickCount >= 1 なので到達不能
}),
```

`sleep` は `isProcessAlive` が `true` を返した後にのみ呼ばれる。この時点で `tickCount` はすでに 1 以上であり、`tickCount === 0` は成立しない。`settledEarly` は常に `false` のまま変わらない。

実質的な sabotage 歯は:
1. `expect(isProcessAlive.mock.calls.length).toBeGreaterThanOrEqual(1)` — pid チェックを完全に除去すると fails
2. TC-010 の `expect(code).toBe(0)` — pid 死亡前に awaiting-resume で settle すると exit code が 1 になり fails

テスト自体は正しく pass / fail するが、`settledEarly` check は実質的な検証ゼロで sabotage 深度についての誤解を招く。

### F-002 LOW — TC-027 quiet 抑制テストに実効的アサーションなし（should priority TC）

`src/cli/__tests__/detach-output-contract.test.ts` TC-027 の quiet mode テスト:

```typescript
it("TC-027: emitForegroundNotice does not emit when isLevelEnabled returns false", () => {
  vi.mocked(isLevelEnabled).mockReturnValue(false);
  emitForegroundNotice({});
  expect(typeof emitForegroundNotice).toBe("function");  // ← 常に true、検証内容なし
});
```

`logInfo` がモック化されているため、quiet 抑制（`logInfo` の内部実装）を検証できない。コメントも「The real behavior is enforced by logInfo itself」と認めている。TC-027 は test-cases.md で "should" priority のため許容可能だが、テストとして機能していないことを記録する。

### F-003 LOW — SpawnBackgroundOptions index signature（iter1 F-004 引き継ぎ）

`src/util/spawn.ts` の `SpawnBackgroundOptions` に `[key: string]: unknown` が残存。テスト側で `opts as Record<string, unknown>` とキャストすれば十分であり、本番インターフェースへの付与は TypeScript の構造型チェックを弱める。

## TC Coverage Summary

| TC | 結果 | 備考 |
|----|------|------|
| TC-001 | ✓ | spawn 形式 |
| TC-002 | ✓ | 親の案内・exit 0 |
| TC-003 | ✓ | 破壊確認（TC-001 と同一アサーション、機能的には有効） |
| TC-004 | ✓ | --detach --json → exit 2 |
| TC-005 | ✓ | marker 付き子は spawn しない |
| TC-006 | ✓ | getDetachLogPath |
| TC-007 | ✓ | job show detach log |
| TC-008 | ✓ | spawnBackground 既存挙動無変更 |
| TC-009 | ✓ | credential + marker passthrough |
| TC-010 | ✓ | pid 生存中は待ち続ける（exit code で固定、実質 sabotage） |
| TC-011 | △ | isProcessAlive 呼び出し確認は ✓、settledEarly は dead code（F-001） |
| TC-012 | ✓ | 死亡後 status 確定 |
| TC-013 | ✓ | running → awaiting-resume on crash（lastKnownPid 経路確認済み） |
| TC-014 | ✓ | no-pid fallback / isStaleRunning |
| TC-015 | ✓ | awaiting-archive → exit 0 |
| TC-016 | ✓ | awaiting-resume → exit 1 |
| TC-017 | ✓ | failed/terminated/canceled → exit 1 |
| TC-018 | ✓ | slug 不在 5 回リトライ → exit 2 |
| TC-019 | ✓ | 文言存在（FOREGROUND_NOTICE / buildDetachGuidance / USAGE） |
| TC-020 | ✓ | 10262 existing tests green（foreground 無変更確認） |
| TC-021 | ✓ | 0o600 |
| TC-022 | ✓ | append mode + stdio fd |
| TC-023 | ✓ | --detach flag 登録（run / job start / job resume） |
| TC-024 | ✓ | SLUG_REGEX 検証 + job wait 登録 |
| TC-025 | ✓ | detach log 不在で行なし、Log: 行は存在 |
| TC-026 | ✓ | emitForegroundNotice → logInfo（stderr）、stdout に書かない |
| TC-027 | △ | 実効アサーションなし（F-002、should priority） |
| TC-028 | ✓ | marker 設定時 logInfo 呼ばれない |
| TC-029 | ✓ | archived → exit 0（includeArchived:true 修正済み） |
| TC-030 | ✓ | typecheck && test green |
| TC-031 | ✓ | docs/operations.md: detach + wait フロー・SIGTERM 背景・opt-in 明記 |

## 設計判断の整合確認

- **D2 再帰防止**: `SPECRUNNER_DETACHED=1` マーカーが `rawEnv` 経由で子に渡り、子は `isDetachedChild` true → detach branch skip。設計通り。
- **D5 slug 解決**: `run` / `job start` は `resolveSlugForDetach`（SLUG_REGEX 検証付き）、`job resume` は positional 直接使用（仕様通り "positional はそのまま slug"）。設計通り。
- **D6 process-death gate**: `lastKnownPid` による pid 保持（state.pid が null になった後も使用）、sidecar fallback、isStaleRunning fallback が正しく実装されている。
- **D7 settle 報告**: `nextActionFor` の写像は設計表と一致。`<slug>` はプレースホルダとして一貫して使用（reportSettle の先頭で実 slug を表示）。
- **D8 出力面注入**: `emitForegroundNotice` は `runner.ts:121`（prepare() 後）で呼ばれ stderr（logInfo）経由。stdout・終了コードに影響なし。
- **arch-allowlist B-6 追加**: `emitForegroundNotice(process.env)` は SPECRUNNER_DETACHED キーをローカルで読むのみ、外部プロセスへの env 転送なし。妥当な allowlist 追加。
