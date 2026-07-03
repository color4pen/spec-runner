# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `tests/core/preflight.test.ts` | TC-004/TC-005 の呼び出し元結線テストが存在しない。受け入れ基準では「`request validate` と `run` の preflight が不合格になることをテストで固定する」と明記されているが、`executeValidate` + gate failure → return 1 および `runPreflight` + gate failure → throw SpecRunnerError の経路を直接検証するテストが無い。gate 単体テスト（check-gate.test.ts）は網羅的だが、呼び出し元の `if (!gateResult.passed)` 分岐は未テスト。実装コードは正しく、単一行の自明な分岐であるため correctness の問題はないが、将来の wiring 変更に対してリグレッションガードが効かない。 | `tests/unit/core/design-layer/` に `validate-gate-wiring.test.ts` と `preflight-gate-wiring.test.ts` を追加する。前者は `executeValidate` に `{ config: enabled config, spawn: exit-1 fake }` を渡して return 値が 1 になることを、後者は `runDesignLayerCheckGate` を vi.mock して `{passed:false}` を返させ `runPreflight` が `DESIGN_LAYER_CHECK_FAILED` で throw することをアサートする。 | no |
| 2 | low | maintainability | `src/core/doctor/checks/index.ts:52` | コメント `// Runtime (3 — gh CLI check removed: not longer required)` は `aozuCliCheck` 追加後に実質 4 件となったため件数が陳腐化している。 | コメントを `// Runtime (4)` に更新し、aozu check が条件付き（designLayer 無効時は pass-through）であることを注記する。 | no |

## 前回指摘の確認（iteration 001）

| F | 内容 | 状態 |
|---|------|------|
| F-01 (high) | TC-010 が commitArchive をモック化しており「コミットに含まれる」アサーションが欠如 | ✅ 解消: `orchestrator-hook.test.ts` に実 temp git リポジトリ（`mkdtemp` + `spawnSync`）を使う TC-010 が追加され、`git show --name-only HEAD` で state ファイルのコミット包含を検証している |
| F-02 (medium) | exit 1 時の警告が `mark-hook.ts` と `orchestrator.ts` で二重出力 | ✅ 解消: `mark-hook.ts` の exit 1 分岐が `stderrWrite` を呼ばず `{status:"unknown-slug"}` を返すのみとなり、TC-HOOK-003 が「warning は caller が決める」ことをドキュメントしている |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.50

## Summary

iteration 001 の 2 件の指摘（F-01 TC-010 コミット包含テスト、F-02 重複 stderrWrite）はいずれも正確に解消されている。

実装の骨格は spec.md・tasks.md・設計判断を正確に反映している:

- **opt-in 設計**: `enabled !== true` の全経路が spawn を一切発行しない。preflight.test.ts の既存 4 テストも無変更 green。
- **入口ゲート**: `runDesignLayerCheckGate` が単一モジュールで preflight と executeValidate の両方から呼ばれる二重実装なし。spawn 注入・stderrWrite 注入・disabled guard 各要素が check-gate.test.ts の TC-GATE-001〜007 で網羅的に固定されている。
- **出口 hook**: `mark-hook.ts` が exit 0/1/2/null を適切にルーティング、`git add -A` で aozu の書き込みをステージ。TC-010 の実 git リポジトリ統合テストにより「archive コミット包含」の核心要件が機械的に固定された。orchestrator.ts は base ブランチへのコミット禁止設計不変条件を守っている。
- **doctor check**: `aozuCliCheck` が `commonChecks` に登録され、enabled 時のみ `execFile` を呼ぶ条件付き check として正しく実装されている。
- **スキーマ**: `designLayer` が zod/v4-mini で validat され、`resolveDesignLayerConfig` が他の config resolve ヘルパと同パターンで実装されている。
- **build / typecheck / test 5733 / lint**: 全 green。

指摘 2 件はいずれも low 止まりで修正は任意 (Fix: no)。
