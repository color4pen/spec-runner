# cross-boundary-invariants Review Result

**Change**: touched-files-propagation
**Iteration**: 2
**Reviewer purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## Scope Verified

- `src/adapter/claude-code/touched-files-recorder.ts` — 記録・正規化ロジック（`isChangeFolderPath` 参照元変更）
- `src/adapter/shared/touched-files-bundle.ts` — 注入セクション builder（`isChangeFolderPath` エクスポート追加・injection-side フィルタ追加）
- `src/adapter/claude-code/agent-runner.ts` — 記録配線・prompt 組成（変更なし）
- `src/adapter/codex/agent-runner.ts` — prompt 組成配線（変更なし）
- `src/core/step/commit-orchestrator.ts` — state 書き込み経路（コメント追加・`as unknown as` キャスト除去）
- `src/core/step/executor.ts` — touchedFiles 透過（変更なし）
- `src/core/port/agent-runner.ts` — AgentRunResult.touchedFiles（index signature 除去）
- `src/state/schema/types.ts` — JobState.touchedFiles（index signature 除去）
- `src/state/schema/operations.ts` — validateJobState 検証（sanitization ロジック変更）
- `src/store/job-state-projection.ts` — stateToStateJson / composeSplitLayoutFromContent（変更なし）
- `src/store/job-state-store.ts` — NormalizedJobState（Omit 形式復元）
- `src/state/helpers.ts` — pushStepResult（変更なし、spread で touchedFiles 保持を確認）

---

## Review-001 Findings の対応確認

| Finding | 対応 | 詳細 |
|---------|------|------|
| F-001: `as unknown as` キャスト（low/fixable） | ✅ RESOLVED | `touched-files-bundle.ts` が `state.touchedFiles` を直接参照。`commit-orchestrator.ts` も `s.touchedFiles` 直接アクセスに変更 |
| F-002: 要素型検証が浅い（low/fixable） | ✅ RESOLVED | fail-open サニタイズ実装。非 string 要素を含む配列エントリは silent drop（injection skip）へ変更 |
| F-003: 変更フォルダパスの単層防護（medium/decision-needed） | ✅ RESOLVED（多層防護）| `buildTouchedFilesSection` が injection 側でも `isChangeFolderPath` フィルタ適用。`isChangeFolderPath` を shared layer からエクスポートし単一定義を共有 |
| F-004: write-1/write-2 間の touchedFiles 不在窓（low/decision-needed） | ✅ DOCUMENTED | `commit-orchestrator.ts` に明示コメント追加（"Do NOT reorder writes to 'fix' this"） |

加えて code-review feedback（F-01: index signature 追加問題）も対処済み:

- `JobState` と `AgentRunResult` の `[key: string]: unknown` index signature が除去された
- `NormalizedJobState` が元の `Omit<JobState, "steps"> & { steps: ... }` 形式に復元された

---

## 不変条件チェック（iteration 2）

| 不変条件 | 検証結果 |
|---------|---------|
| `pushStepResult` が `...state` spread → `touchedFiles` 保持 | `src/state/helpers.ts:161` の spread で保持 ✅ |
| `projectSuccess` → `pushStepResult` → spread 保持 | 同上（`commitSuccess` の `let s = projectSuccess(state,...)` 後も touchedFiles はスプレッドで引き継がれる）✅ |
| `appendSynthesizedCommit` が `touchedFiles` を保持 | spread 実装で保持（review-001 と変わらず）✅ |
| `commitRound` が `touchedFiles` を保持 | spread 実装で保持（round member の記録は D6 で意図的に off、既存記録は消えない）✅ |
| `isChangeFolderPath` が recording 層と injection 層で同一定義 | `touched-files-bundle.ts` エクスポート → `touched-files-recorder.ts` import。単一定義で同期 ✅ |
| dependency 方向に循環なし（recorder → shared bundle） | `touched-files-bundle.ts` は `state/schema.ts` + `util/paths.ts` のみ import。循環なし ✅ |
| `validateJobState` のサニタイズ mutation が `raw` に反映される | `obj = raw as Record<string, unknown>` の alias で mutation が `return raw as JobState` に反映される ✅ |
| `NormalizedJobState` が `Omit<JobState, "steps">` 形式に復元 | `src/store/job-state-store.ts:16` で確認。index signature 除去後に `Omit` が再び正常動作 ✅ |
| `specrunner/changes-archive/` 等が誤除外されない | trailing slash 判定を共有関数で統一（`isChangeFolderPath` = `changesDirRel() + "/"` prefix）✅ |
| 注入は既存 `artifactSection` → `touchedFilesSectionStr` → `resumeSection` の順序を維持 | claude-code / codex 両 adapter で確認 ✅ |
| fail-open: 記録なし → byte-identical prompt | `""` 返し → `touchedFilesSectionStr = ""` → prompt 変化なし ✅ |

---

## Findings

### F-001: validateJobState サニタイズの fall-through ケースが未テスト

**Severity**: low
**Resolution**: fixable
**File**: `src/state/schema/operations.ts:336-338`

`validateJobState` の新しいサニタイズロジックは、配列値の要素が非 string の場合（例: `[123, null]`）そのステップエントリを silent drop する:

```typescript
// Fail-open: drop entries containing non-string elements (corrupt hint → skip injection)
if (value.every((el) => typeof el === "string")) {
  sanitized[stepName] = value as string[];
}
```

この動作はコメントに明示されており機能的に正しいが、テストスイート（`touched-files-schema.test.ts`）は非配列値（TC-020/021）しかカバーしない。`touchedFiles: {"implementer": [123, "a.ts"]}` のような混在配列を渡すと `implementer` エントリが丸ごと drop される動作を検証するテストが存在しない。

fail-open パスであり runtime での発現確率は低いが、将来の動作変更（例: 部分フィルタへの変更）をテストで検出できない。

---

## Observations

- `touched-files-recorder.ts`（claude-code adapter）が `touched-files-bundle.ts`（shared adapter）から `isChangeFolderPath` を import する依存方向は、specific → shared として正しい方向。循環なし。コメントに「single source of truth」と明記されており、意図が文書化されている。

- TC-022 テストフィクスチャが `touchedFiles: { design: ["specrunner/changes/resume-test/design.md"] }` を state に含める。これは recording 層の正規化では発生しないが、injection 層のフィルタ（defense in depth）の検証として有効。

- `validateJobState` の mutation パターン（`obj["touchedFiles"] = sanitized` → `return raw as JobState`）は `job-state-projection.ts` の同種パターンと一貫し、呼び出し元が `JSON.parse()` の ephemeral object を渡す前提で安全。

---

## Evidence

- checked: 13（主要実装ファイル・型定義・テスト全件・write 経路追跡・dependency 方向確認）
- skipped: 0
- unverified: 0
