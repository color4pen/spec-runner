# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. tasks.md — 全チェックボックス完了確認

T-01 〜 T-05 のすべてが `[x]` 。

### 2. Design Decisions

| Decision | 内容 | 確認結果 |
|----------|------|---------|
| D1 | `collectRoutedFixerFindings` を新モジュール `routed-findings.ts` に配置; `isCoordinatorLoopActive` / `getNeedsFixMembers` を `code-fixer.ts` から移設 | ✅ 実装済み（後述の逸脱あり）|
| D2 | `detectNoOp` に `findingTargetPaths?` / `pipelineManagedPaths?` を追加; `exempt = findingTargetPaths − pipelineManagedPaths` を検知器内で強制 | ✅ 設計どおり |
| D3 | executor で `step.noOpDetect === true` ガードつきで `collectRoutedFixerFindings(state).map(f => f.file)` と `pipelineManagedPaths(deps.slug)` を渡す | ✅ 設計どおり |

### 3. Spec Requirements / Scenarios

**Requirement 1 — finding 名指し path への変更を仕事として数える**

- Scenario (#927 実例): implementation-notes.md を名指し・当該ファイルのみ変更 → approved → TC-001 ✅
- Scenario (名指し外): other-doc.md のみ変更 → needs-fix → TC-002 ✅
- Scenario (source 通常ケース): src/foo.ts のみ変更 → approved → TC-003 ✅

**Requirement 2 — pipelineManagedPaths は上限として免除しない**

- Scenario (state.json 名指し): state.json のみ変更 → needs-fix → TC-004 ✅

**Requirement 3 — 免除集合は機械的・純粋関数で導出**

- Scenario (active-reviewer): TC-001（branch 3）✅
- Scenario (非 code-fixer step): TC-006 / TC-012 ✅
- Conformance branch (branch 1): TC-009 ✅
- Coordinator-loop branch (branch 2): TC-010 ✅

**Requirement 4 — 既存挙動の保存**

- Scenario (#734 escalate): TC-007 ✅
- Scenario (findingsRoutingApproved 抑止): TC-008 ✅
- completionReason !== "success" 早期 return: コード不変 ✅
- noOpDetect: false / undefined → listChangedFiles 非呼び出し: 既存テスト ✅

### 4. Request 受け入れ基準

| 基準 | 対応テスト | 確認 |
|------|-----------|------|
| シナリオ歯 (#927): implementation-notes.md 名指し → no-op 抑止・テスト固定 | TC-001 | ✅ |
| finding 名指し外 change folder のみ → needs-fix・テスト固定 | TC-002 | ✅ |
| pipelineManagedPaths 内 (state.json) → needs-fix・テスト固定 | TC-004 | ✅ |
| ソース通常ケース → no-op 発火なし・テスト固定 | TC-003 | ✅ |
| 既存テスト無変更 green | 既存 6 ケース + Req 1-4 ケース | ✅ |
| typecheck && test green | T-05 全 [x] | ✅ |

### 5. スコープ遵守

- `no-op-detect.ts` の `ARTIFACT_PREFIXES`: 不変（`["specrunner/changes/", ".specrunner/"]`）✅
- `round-git-scope.ts` の `pipelineManagedPaths`: 不変（5 パス個別列挙）✅
- `code-fixer.ts` buildMessage / reads の出力（prose / findingsPath / verdict）: 変更なし ✅
- `spec-fixer` / `build-fixer` の `noOpDetect` 設定: 未設定のまま ✅
- `routed-findings.ts` の import: agent / prompt 定義に非依存（light module）✅

## 検証できなかった項目

None。typecheck / test の実行結果は tasks.md T-05 の `[x]` を信頼（run 環境なし）。

## Findings 詳細

### F-1 (LOW): `collectRoutedFixerFindings` branch 3 が `collectFixableFindings` フィルタを適用している（tasks.md T-01 未指定）

**ファイル**: `src/core/step/routed-findings.ts`, 行 113

tasks.md T-01 は branch 3 を次のように明示する:
```
return getLatestJudgeFindings(state, active) ?? [];
```

実装は:
```typescript
const allFindings = getLatestJudgeFindings(state, active) ?? [];
return collectFixableFindings(allFindings);
```

T-01 受け入れ基準「code-fixer.buildMessage と同一 precedence で解決する」に対して、`code-fixer.buildMessage` の branch 3 はフィルタなしですべての findings を agent に渡す。`collectFixableFindings` は tasks.md に記載のない MAPPING 追加であり、`buildMessage` が受け渡す findings 全集合との乖離が生じる。

**実害**: 実質ゼロ。`needs-fix` 判定には critical/high severity または decision-needed findings が必要であり、それらは `resolution: "fixable"` を持つため免除集合に含まれる。informational findings のみが除外されるが、informational findings 単独では `needs-fix` が立たない。

**対処方向**: branch 3 の `collectFixableFindings` を削除して tasks.md の明示仕様と `buildMessage` 挙動に一致させるか、design.md D1 / tasks.md T-01 に「branch 3 は fixable findings のみを返す MAPPING 判断」として明記する。
