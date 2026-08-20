# Conformance Result — from-flag-core-validation — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| # | Normative Source | 確認内容 | 結果 |
|---|-----------------|---------|------|
| 1 | spec.md Req 1 / request.md 要件 1 | resume `from` flag: `values:` 制約撤去 → `{ type: "string" }` (L1065) | ✅ |
| 2 | spec.md Req 1 / request.md 要件 1 | reopen `from` flag: `values:` 制約撤去 → `{ type: "string" }` (L1201) | ✅ |
| 3 | spec.md Req 3 / request.md 要件 2 | resume.ts: `from !== undefined ? 2 : 1` で exit code 区別 (L267) | ✅ |
| 4 | spec.md Req 3 / request.md 要件 2 | reopen.ts: `PrepareError(2, ...)` に無条件変更 (L227) | ✅ |
| 5 | spec.md Req 3 / request.md 要件 2 | error message は `logError((err as Error).message)` 経由で core のメッセージ（"Available step names: …"）をそのまま表示 | ✅ |
| 6 | spec.md Req 5 / request.md 要件 3 | resume usage: "composite steps … are not valid --from targets" を削除 | ✅ |
| 7 | spec.md Req 5 / request.md 要件 3 | resume usage: "jobs with custom reviewers also accept: regression-gate, custom-reviewers, or reviewer member names" を追加 | ✅ |
| 8 | spec.md Req 5 / request.md 要件 3 | resume usage: "bite-evidence is an internal step …" 注記を維持 | ✅ |
| 9 | spec.md Req 6 / request.md 要件 3 | reopen usage: custom reviewers 動的 step への注記を追加 (L501–504) | ✅ |
| 10 | spec.md Req 2 (TC-005) | custom reviewers あり job で `--from regression-gate` → core 検証通過・startStep 一致 | ✅ |
| 11 | spec.md Req 2 (TC-006) | custom reviewers あり job で `--from custom-reviewers` → core 検証通過 | ✅ |
| 12 | spec.md Req 2 (TC-007) | custom reviewers あり job で `--from alice` → coordinator 写像で通過・startStep="custom-reviewers" | ✅ |
| 13 | spec.md Req 3 (TC-008) | `--from bogus-step` で resume → PrepareError.exitCode === 2 | ✅ |
| 14 | spec.md Req 3 (TC-009) | reviewers なし job で `--from regression-gate` resume → exitCode 2 | ✅ |
| 15 | spec.md Req 3 (TC-010) | `--from bogus-step` で reopen → exitCode 2 | ✅ |
| 16 | spec.md Req 3 (TC-011) | reviewers なし job で reopen `--from regression-gate` → exitCode 2 | ✅ |
| 17 | spec.md Req 4 (TC-012) | `--from` 未指定 + state.step="init" → exitCode 1 | ✅ |
| 18 | request.md 受け入れ基準 | 既存テスト無変更で green（verification: 798 test files, 11923 tests passed） | ✅ |
| 19 | request.md 受け入れ基準 | `typecheck && test` が green（verification 全フェーズ passed） | ✅ |

### 実装詳細

**Req 1: CLI parser 制約撤去**

`src/cli/command-registry.ts` を確認:
- resume (L1065): `from: { type: "string" }` — `values:` なし ✅
- reopen (L1201): `from: { type: "string" }` — `values:` なし ✅

テスト固定: `src/cli/__tests__/from-flag-no-enum.test.ts`（TC-001〜004, 015）— `parseFlags` を直接呼び出し、`regression-gate` / `custom-reviewers` / `alice` / `build-fixer` が `FlagParseError` を throw しないことを検証済み。

**Req 2: core 動的許可**

`src/core/command/__tests__/resume-from-exit-code.test.ts` (TC-005, 006, 007):
- `resolveResumeStep` を実装のまま（モックなし）使用
- TC-005: reviewers=[{name:"security"}]、`--from regression-gate` → `prepare()` が `startStep="regression-gate"` を返す ✅
- TC-006: 同 reviewers、`--from custom-reviewers` → `prepare()` が `startStep="custom-reviewers"` を返す ✅
- TC-007: reviewers=[{name:"alice"}]、`--from alice` → `prepare()` が `startStep="custom-reviewers"` を返す（coordinator 写像） ✅

**Req 3: exit code 区別**

resume.ts (L265-268):
```ts
} catch (err) {
  logError((err as Error).message);
  throw new PrepareError(this.options.from !== undefined ? 2 : 1, "Failed to resolve resume step");
}
```

reopen.ts (L225-228):
```ts
} catch (err) {
  logError((err as Error).message);
  throw new PrepareError(2, "Failed to resolve reopen step");
}
```

`resolveResumeStep` の throw メッセージ（`"Invalid --from value: \"...\". Available step names: ..."`, `resolve-step.ts:113-116`）が `logError` 経由でそのまま表示される ✅

**Req 4: --from 未指定で exit 1**

TC-012: state.step="init", from 未指定 → `from === undefined` 条件 → `PrepareError(1, ...)` → exitCode 1 ✅

**Req 5, 6: usage text**

resume (L368-374):
- 削除: "composite steps (custom-reviewers fan-out, regression-gate) are not valid --from targets and are not listed above." ✅
- 追加: "jobs with custom reviewers also accept: regression-gate, custom-reviewers, or reviewer member names (member names are mapped to the custom-reviewers coordinator)." ✅
- 維持: "bite-evidence is an internal step not intended for regular operator use." ✅

reopen (L501-504):
- 追加: 同趣旨の custom reviewers 注記 ✅

テスト固定: TC-013, 014 (`from-flag-no-enum.test.ts`) および `resume-help.test.ts` TC-016 の "custom reviewers" チェック。

### スコープ外確認（変更が加えられていないこと）

- `buildAllowedStepSet` / `resolveResumeStep` / `mapMemberToCoordinator` — 無変更 ✅
- `--from-issue` 経路固有変更 — なし（flag passthrough で自動適用）✅
- legacy alias 整理・削除 — なし ✅

### 計画との差異（non-normative）

- `specrunner-resume-dispatch.test.ts` が tasks.md 記載外の TC を含む修正（追加カバレッジ）: spec 違反なし
- `resume-help.test.ts` に TC-016 が追加（usage text の "custom reviewers" 言及チェック）: spec を補強する追加アサート、spec 違反なし
- 設計 D3 の通り reopen は条件分岐なし（`from` は型上必ず非 undefined）: design と実装が一致

## 検証できなかった項目

None — すべての normative 項目を実装コードと通過テストで確認できた。

## Findings 詳細

None — 指摘なし。
