# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| # | 受け入れ基準 | 検証方法 | 結果 |
|---|---|---|---|
| AC-1 | implementer system prompt に 4 層 authority 表現が含まれ、「唯一のインプット」が含まれない | TC-029/030 実行確認 + `implementer-system.ts` 実読 | ✅ pass |
| AC-2 | commit message への `test_cases_skipped` 指示が含まれず、完了報告への指示が含まれる | TC-031/032 実行確認 + `implementer-system.ts:61` 実読 | ✅ pass |
| AC-3 | rules 出力に verification continuation 例外記述が含まれる | TC-033 実行確認 + `rules.ts:23-25` 実読 | ✅ pass |
| AC-4 | PIPELINE_MAP に bite-evidence 行が存在し、conformance 行に normative/plan 二層記述が含まれる | TC-034/035 実行確認 + `pipeline-map.ts` 実読 | ✅ pass |
| AC-5 | `state.step = "test-materialize"` / `"build-fixer"`、resumePoint=null、--from なしの resume が implementer に解決される | TC-012/013 実行確認 + `resolve-step.ts:132-144` 実読 | ✅ pass |
| AC-6 | 既存テスト（prompt-skeleton-drift-guard / tc-source-contract / resolve-step）が無改変で green | `bun run test` 全体実行 774 files / 11404 tests | ✅ pass |
| AC-7 | `typecheck && test` が green | `bun run typecheck` + `bun run test` | ✅ pass |

### 実装確認詳細

**T-01: `src/prompts/implementer-system.ts`**
- 旧: `tasks.md — 正典（実装の唯一のインプット）` + `spec.md / design.md / test-cases.md — 参照情報（read-only）`
- 新: 4 層構造（request/spec = normative、test-cases.md = 検証契約、tasks.md = 作業計画、design.md = 文脈）に置換済み
- `test_cases_skipped` の記録先: 「commit message」→「完了報告（completion report）」に変更済み（line 61）
- 「唯一のインプット」の文言: 削除済み（TC-030 で確認）

**T-02: `src/prompts/rules.ts`**
- 旧: `各 step は独立した agent session として実行される。前の session の文脈を持たない`（全面断言）
- 新: 「原則: 各 step は独立した新規 session」+ 「例外: verification 失敗後の implementer 再入は continuation として実行される（session が無い場合は fresh session に fallback）」に更新済み
- TC-033 の 3 キーワードすべて含まれることを確認

**T-03: `src/prompts/pipeline-map.ts`**
- bite-evidence 行: `implementer` と `verification` の間（line 18）に追加済み
- conformance 行: 旧「4 成果物…」→ 新「request / spec を規範（normative）、design / tasks を計画（plan）として」に変更済み
- 総行数: 15（TC-018 で `expect(rows.length).toBe(15)` を確認）

**T-04: `src/core/resume/resolve-step.ts`**
- path 4（stateStep ブランチ、line 132-144）に `LEGACY_STEP_ALIASES` 適用を追加
- 適用順序: alias 解決 → `mapMemberToCoordinator` → `allowed.has()` ガード（path 1 と対称）
- path 3 との非対称（`allowed.has()` ガードなし）は設計通り維持

**T-05: テスト**
- TC-018: `EXPECTED_STEPS` に `"bite-evidence"` 追加済み、`toBe(15)` に更新済み、describe の description も更新済み
- TC-029〜TC-035: drift-guard ファイル末尾に追加済み、全て ✅
- TC-012/013: `resolve-step-test-materialize-alias.test.ts` 末尾に追加済み、全て ✅

## 検証できなかった項目

None。

## Findings 詳細

### [low] TC-018 セクションコメントと describe の step 数不一致

- **ファイル**: `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts:610`
- **内容**: セクション境界コメントが `// TC-018: PIPELINE_MAP が全 16 step を列挙し…` と旧値 "16" のままだが、`describe` 文（line 614）は `"TC-018: PIPELINE_MAP が全 15 step を列挙し…"` と正しく "15" になっている。アサーション自体（`toBe(15)` / `EXPECTED_STEPS.length=15`）は正しいため機能上の影響なし。コメント行のみの不整合。
- **修正**: コメント行を `// TC-018: PIPELINE_MAP が全 15 step を列挙し…` に修正するだけ。
