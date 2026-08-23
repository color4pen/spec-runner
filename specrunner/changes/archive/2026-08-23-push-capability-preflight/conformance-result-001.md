# Conformance Result — push-capability-preflight — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Requirement 1: push 能力の検出

- `src/git/push-capability.ts` — `detectPushCapability` 実装を確認 ✓
  - `GITHUB_ACTIONS=true` + `GH_TOKEN` 未設定 + `ghs_` prefix → `patterns: [".github/workflows/**"]` ✓
  - `GITHUB_ACTIONS=true` + `GH_TOKEN=ghp_xxx` → `patterns: []` ✓
  - `GITHUB_ACTIONS` 未設定 → `patterns: []` ✓
  - token が `ghp_` prefix → `patterns: []` ✓
- `tests/unit/git/push-capability.test.ts` — TC-001〜TC-004, TC-020〜TC-023 全 28 件 pass ✓
- 架層制約: `push-capability.ts` が `node:*` と `src/util/*` のみを import → 確認 ✓

### Requirement 2: 能力制約の事前通知

- `src/core/step/implementer.ts:284` — `renderPushCapabilityNotice(deps.pushCapability ?? null)` 呼び出し: patterns が空でなければ notice を連結 ✓
- `src/core/step/request-review.ts:113` — 同様に notice を連結 ✓
- `src/git/push-capability.ts:205–247` — `renderPushCapabilityNotice` 純粋関数: patterns が空なら空文字列 ✓
- 予測 touchedFiles 該当でも pipeline が停止しない: 通知のみで制御フローを変えない ✓
- **F-001 発見**: `renderPushCapabilityNotice` の第 2 引数（`predictedTouchedFiles`）が implementer / request-review の `buildMessage` から渡されていない（下記 Findings 詳細参照）

### Requirement 3: 公開パスの列挙

- `src/git/push-capability.ts:121–191` — `collectPublishablePaths`: worktree (git status --porcelain -z --no-renames --untracked-files=all) + 未 push コミット (git rev-list HEAD --not --remotes=origin + git diff-tree) の和集合 ✓
- revert されたパスも含む（Set に両方追加）✓
- fail-closed: 全コマンド失敗時は throw（詳細は「plan divergence」参照）

### Requirement 4: implementer session へ 1 回の follow-up

- `src/core/step/implementer.ts:259–278` — `outputContracts()` が patterns 非空時に `kind: "unpushable-path", policy: "follow-up"` を 1 件追加 ✓
- `src/core/step/step-context-builder.ts:140–158` — `buildPrompt` が attempt >= 2 で unpushable-path 違反をフィルタし `null` を返す → 2 回目の follow-up なし ✓
- `maxAttempts = OUTPUT_FOLLOWUP_MAX_ATTEMPTS (2)` 維持 → tasks-complete は従来通り 2 回機会あり ✓
- `src/core/step/output-verify.ts:235–257` — follow-up 文面に一致パス一覧と除去/修正指示を含む ✓
- TC-011〜TC-013, TC-030, TC-033〜TC-034 全て pass ✓

### Requirement 5: follow-up 後も残る → escalation

- `src/core/step/executor.ts:426–443` — 出力ゲートで `unpushable-path` 違反を検出し `makeUnpushablePathHalt` へ分岐 ✓
- `src/core/step/executor.ts:489–502` — Layer 2 `UNPUSHABLE_PATH_BLOCKED` エラーも `makeUnpushablePathHalt` へ ✓
- `src/core/step/step-halt.ts:435–484` — `makeUnpushablePathHalt`: `kind: "awaiting-resume"`, 理由文にパス一覧・環境制約・worktree 残留・operator 選択肢を含む ✓
- TC-014, TC-035, TC-036 pass ✓

### Requirement 6: commit 直前の決定的 backstop (Layer 2)

- `src/core/step/commit-push.ts:514–533` — `commitAndPush` 内 mixed reset 直後・staging 前 に `collectPublishablePaths` → `matchUnpushablePaths` → 一致時 `unpushablePathBlockedError` を throw ✓
- `src/core/step/commit-push.ts:1004–1023` — `commitScopedPaths` でも同検査 ✓
- `src/core/pipeline/parallel-review-round.ts:439–443` — `commitRoundArtifacts` 経由で `pushCapability` を渡す ✓
- `src/errors.ts:681–724` — `UnpushablePathBlockedError` 型に `matchedPaths` フィールドあり（文字列解析不要）✓
- TC-015, TC-016, TC-037 pass ✓

### Requirement 7: 未宣言環境で挙動不変

- `commitAndPush:519` 先頭ガード: `pushCapability?.patterns.length === 0` の場合は即 return ✓
- `src/core/runtime/managed.ts:443–447` — unpushable-path を `!branch` ガードより前にスキップ ✓
- TC-017, TC-018, TC-019, TC-032 pass ✓

### 受け入れ条件の検証

| 条件 | テスト | 結果 |
|------|--------|------|
| follow-up 1 回投げ → 解消後 commit/push | TC-011, TC-033 | ✓ |
| follow-up 後も残る → escalation | TC-012, TC-014 | ✓ |
| Layer 2: push なし → awaiting-resume、理由にパスと制約 | TC-015, TC-016, TC-037 | ✓ |
| capability constraint が context に先行通知 | TC-005, TC-031 | ✓ |
| predicted match で pipeline 停止しない | TC-006 (function level) | Partial ※ |
| 該当しない diff / 宣言なし → 挙動不変 | TC-017〜TC-019 | ✓ |
| typecheck && test green | vitest run 836 files pass, tsc no error | ✓ |

※ TC-006 は `renderPushCapabilityNotice` を直接呼び出す level でのみ検証。`ImplementerStep.buildMessage` が `state.touchedFiles` を渡すかの統合検証が欠落（F-001）。

### .github/workflows/** の無変更確認

`git diff main...HEAD --name-only | grep .github/` → 0 件 ✓

---

## 検証できなかった項目

None — 全ての normative 項目を直接確認した。

---

## Findings 詳細

### F-001: `renderPushCapabilityNotice` に predictedTouchedFiles が渡されない（advance warning 統合欠落）

**対象ファイル**: `src/core/step/implementer.ts:284`（および `src/core/step/request-review.ts:113`）

**違反している spec 規定**:

Requirement 2 (MUST):
> "When the request-review predicted `touchedFiles` include a path matching a declared pattern, the notice MUST additionally name those paths as an advance warning."

Scenario: "Predicted touchedFiles match produces a warning but no interruption":
> Then the message names `.github/workflows/ci.yml` as an advance warning

**現状のコード**:

```typescript
// implementer.ts:284
const capabilityNotice = renderPushCapabilityNotice(deps.pushCapability ?? null);

// request-review.ts:113
return base + renderPushCapabilityNotice(deps.pushCapability ?? null);
```

`renderPushCapabilityNotice` は第 2 引数 `predictedTouchedFiles?: string[]` を受け取り、一致ファイルを advance warning として出力する機能を持つ。しかし、`ImplementerStep.buildMessage` も `RequestReviewStep.buildMessage` も `state.touchedFiles?.["request-review"]` を引数に渡していない。

その結果、predicted touchedFiles が宣言 pattern に一致していても advance warning は一切出力されない。

**tasks.md の記載との乖離**:
Task T-04 のチェックボックスは `[x]`（完了）とマークされているが、
「implementer では state から取得できる request-review の予測 touchedFiles があれば第 2 引数として渡す」
というタスクが実装されていない。

**テスト上の盲点**:
TC-006 は `renderPushCapabilityNotice(capability, predictedFiles)` を直接呼び出して正常動作を確認しているが、`ImplementerStep.buildMessage(state, deps)` が `state.touchedFiles` を渡すかどうかを確認するテストが存在しない。

**推奨修正**:
```typescript
// implementer.ts buildMessage 内
const capabilityNotice = renderPushCapabilityNotice(
  deps.pushCapability ?? null,
  state.touchedFiles?.["request-review"],
);
```
および TC-006 相当の統合テスト（`state.touchedFiles` を持つ状態で `ImplementerStep.buildMessage` の返り値に advance warning が含まれることを確認）を追加する。

---

## Plan Divergences（non-gating、findings には含めない）

1. **collectPublishablePaths の fail 動作**: Task T-02 は「例外を投げず、取得できた分だけを返す（fail-open）」と記述するが、実装は全コマンド失敗時に throw（fail-closed）。実装の TSDoc に詳細な根拠が記されており（git status 失敗時にワークツリーのクリーン性を証明できない）、セキュリティ上の合理的判断。Spec に記載なし。

2. **matchUnpushablePaths の sort/dedup**: Task T-01 は「重複なし・ソート済みで返す」と要求するが、実装は `Array.filter` のみ（入力順を維持）。実際の呼び出し元 (`collectPublishablePaths`) が既に sort & dedup した配列を返すため、実運用上の影響なし。Spec に記載なし。
