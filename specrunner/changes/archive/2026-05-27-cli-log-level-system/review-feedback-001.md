# Code Review Feedback — cli-log-level-system — iter 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **iteration**: 1
- **date**: 2026-05-27

---

## Summary

実装全体として設計 D1〜D9 の意図は正確に反映されており、typecheck・test は共に green（3058 passed, verification-result.md 参照）。受け入れ基準 7 項目はすべて充足。

1 件の must-priority テストケース欠落があるため needs-fix とする。

---

## Findings

### F-01: TC-36 (must) のテストが欠落 — debug レベルで initVerboseLog が有効化されることが未検証

- **severity**: low
- **file**: `tests/unit/logger/verbose-log.test.ts`

**事実**:
`test-cases.md` の TC-36 (priority: **must**):

```
GIVEN: currentLevel が "debug" に設定されている
WHEN: runner が initVerboseLog を呼ぶ
THEN: verbose ログファイルへの書き込みが開始される
```

このシナリオに対応するテストが `verbose-log.test.ts` に存在しない。同ファイルは verbose レベルのケース（TC-VL-05）と default レベルの no-op（`initVerboseLog is no-op when level is default`）はカバーしているが、debug レベルのケースが抜けている。

**挙動への影響**: なし。実装は `if (!isLevelEnabled("verbose")) return;` を使用しており、`isLevelEnabled` は `LEVEL_ORDER[currentLevel] >= LEVEL_ORDER["verbose"]` を評価するため、debug レベル（order=3）で verbose（order=2）以上が満たされ、正しく動作する。

**修正方針**:
`verbose-log.test.ts` の `logVerbose file writes` ブロックに以下を追加:

```typescript
it("TC-36: debug レベルで initVerboseLog が有効化される", async () => {
  setLogLevel("debug");
  initVerboseLog(tempDir, "test-job-debug");
  logVerbose("step", "debug level entry");
  closeVerboseLog();

  const logPath = path.join(tempDir, ".specrunner", "logs", "test-job-debug.log");
  expect(fs.existsSync(logPath)).toBe(true);
  const content = fs.readFileSync(logPath, "utf-8");
  expect(content).toContain("debug level entry");
});
```

---

## Must Test Coverage (test-cases.md との照合)

| TC | Priority | Status |
|---|---|---|
| TC-01〜TC-13 (resolveLogLevel) | must | ✅ log-level.test.ts |
| TC-14〜TC-23 (isLevelEnabled / gate) | must | ✅ log-level.test.ts |
| TC-24〜TC-25 (SPECRUNNER_DEBUG) | must | ✅ diagnostic.test.ts |
| TC-28〜TC-31, TC-33 (flag-parser short flags) | must | ✅ flag-parser.test.ts |
| TC-35 (verbose level → initVerboseLog) | must | ✅ TC-VL-05 |
| TC-36 (debug level → initVerboseLog) | must | ❌ 未テスト |
| TC-37 (default level → no-op) | must | ✅ verbose-log.test.ts |
| TC-41〜TC-42 (typecheck・test green) | must | ✅ verification-result.md |

---

## 非問題として記録

- **setLogLevel の二重呼び出し**: `run.ts:runRunCore()` と `PipelineRunCommand.prepare()` がそれぞれ `setLogLevel` を呼ぶ冗長な構造があるが、前者はプリフライト中のログ出力を正しく制御するための早期設定として機能しており、後者との一貫性も確保されているため問題なし。

- **`--quiet` long form が機能する**: `flagDefs` に `quiet: { type: "boolean" }` を追加したため `--quiet` も受け付けるが、`--verbose` と `-v` の対称として自然であり、矛盾ではない。

- **TC-26/TC-27/TC-32/TC-34 (should)**: flag-parser.test.ts で TC-26=`--debug` unknown、TC-27=SPECRUNNER_DEBUG=pipeline,session、TC-32=`-v -v` 、TC-34 はカバーされており問題なし。

- **TC-38/TC-39 (should)**: ProgressDisplay の quiet mode 挙動（onStepStart 抑制 / onPipelineComplete 出力）の専用テストは存在しないが、実装は `isQuiet` getter で正しく制御されており、should 優先度のため blocking ではない。

- **設計 F2 (spec-review F2 指摘) — 早期起動時の DEBUG env var**: `let currentLevel: LogLevel = "default"` のままとし「`setLogLevel()` 呼び出し前は default レベル」として運用する判断は実装上明確。spec-review が推奨した `resolveLogLevel({})` での初期化は採用しなかった選択として許容範囲内。

- **全 acceptance criteria**: `-q`/`-v`/`-vv` フラグ、`SPECRUNNER_LOG_LEVEL` 環境変数、`logWarn` default 出力、`SPECRUNNER_DEBUG` debug-only 動作、`DEBUG` alias、`initVerboseLog` verbose 以上起動はすべて実装・テスト済み。

---

## 修正スコープ

F-01 は must テストケースの欠落であり追加が必要。修正は `verbose-log.test.ts` に 1 テストケースを追加するのみで、実装コードの変更は不要。
