# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（現状コードの前提）全 13 件

| # | アサーション | 確認結果 |
|---|------------|---------|
| 1 | `src/core/command/request.ts:72-80` — gate 型 AC の seed | ✓ 行 72–80 に `## 受け入れ基準` と `` `typecheck && test` が green `` が存在 |
| 2 | `src/core/command/request-prompt.ts:44-49` — 起票規律 | ✓ 行 44-49 に `### 受け入れ基準の書き方` と gate 型 AC 推奨の文言が存在 |
| 3 | `docs/request-authoring.md:75-82` — 起票規律での gate 型 AC 推奨 | ✓ 行 75-82 に「機械検証できる文にする」と gate 型 AC の例示が存在 |
| 4 | `src/prompts/test-case-gen-system.ts:65-69` — Category が 3 値（unit/integration/manual）のみ | ✓ 行 65 `**Category**: unit | integration | manual`、gate 相当なし |
| 5 | `src/templates/step-output-templates.ts:127` — Category 行 | ✓ 行 126 に `  **Category**: unit | integration | manual`（行番号は 1 ずれ、内容は一致） |
| 6 | `src/prompts/test-materialize-system.ts:75-79` — manual 除外の前例 | ✓ 行 75-79 に `**Category**: manual の must TC の扱い` ブロックが存在 |
| 7 | `src/core/verification/test-coverage.ts:99-147` — `extractMustTcIds` が manual を除外 | ✓ 行 99-147 に関数定義・`categoryManualRe` フラグ・`!currentIsManual` 条件が存在 |
| 8 | `specrunner/adr/2026-07-25-test-coverage-manual-tc-exclusion.md` — ADR の存在と決定内容 | ✓ ファイル存在、`extractMustTcIds` の単一判定点設計と `Covered-by` / agent 判定の却下を確認 |
| 9 | `src/prompts/test-materialize-system.ts:93` — 「実装不可能な TC は明示列挙」 | ✓ 行 93 に「実装不可能な TC（CI パイプライン依存等）は理由とともに明示列挙する」が存在 |
| 10 | `src/core/verification/phases.ts:11-44` — verification phase 列挙 | ✓ `PHASE_NAMES` に build/typecheck/test/lint/security/test-coverage が fail-fast 順で定義 |
| 11 | `src/config/schema/types.ts:142-173` — `VerificationConfig` interface | ✓ 行 142-173 に `VerificationConfig` と `commands?: ShellCommand[]` が存在 |
| 12 | `src/core/step/conformance.ts:63-71` — conformance reads に test-cases.md / verification-result.md が無い | ✓ `reads()` は tasks.md / design.md / spec.md / request.md の 4 件のみ |
| 13 | `src/prompts/conformance-system.ts:36-49` — conformance メソッドが 4 成果物のみ参照 | ✓ Method 節は tasks.md / design.md / spec.md / request.md のみを列挙 |

### 要件の実装可能性

- **要件 1–4**（Category 追加・test-case-gen prompt・test-materialize スキップ・coverage gate 除外）: 前例（manual 除外）と完全に同型の変更であることをコードで確認。`extractMustTcIds` の `categoryManualRe` / `currentIsManual` フラグと同型の `categoryGateRe` / `currentIsGate` を追加する変更で実現可能。
- **要件 5**（ツールチェーン再実行禁止規則）: test-materialize system prompt の contract 節に追記する変更で実現可能。
- **要件 6**（template / docs 追随）: `step-output-templates.ts` の Category 行と `docs/test-coverage.md` の Category 節への追記で実現可能。

### 受け入れ基準の検証可能性

7 件すべて機械検証可能な形で記述されている。

- `extractMustTcIds` の単体テスト（破壊確認込み）→ テストコードで機械検証可能
- manual 除外挙動の無変更 → 同関数の既存テスト通過で検証
- prompt の文言存在 → prompt contract テストの様式（文字列検索）で機械検証可能
- template の Category 行 → 同様
- 既存テスト無変更 green → CI で機械検証
- `typecheck && test` green → CI で機械検証

### 設計判断の一貫性

- ADR 2026-07-25 が確定した「判定点の単一化」方針と本 request の設計（`extractMustTcIds` の 1 箇所に gate 除外を追加）は整合している。
- 却下案（`Covered-by` field / agent 判定）は ADR が既に決着済みと明記されており、再検討不要。
- conformance への verification 連関を別 request に分離した判断は、scope 境界として妥当。

## 検証できなかった項目

None — 全 13 件のコードアサーションと要件・受け入れ基準の実装可能性を確認した。

## Findings 詳細

None — ブロッキングな指摘はない。

### 非ブロッキング観察（observations）

1. **`src/templates/step-output-templates.ts` 行番号の微小ずれ**: request.md は行 127 と記載しているが、実際の Category 行は行 126。内容（`**Category**: unit | integration | manual`）の一致は確認済み。実装上の問題なし。

2. **`docs/test-coverage.md` 更新の AC なし**: 要件 6 は `docs/test-coverage.md` を gate を含む形に更新することを要求しているが、受け入れ基準にこのファイルを対象とする機械テストが存在しない。conformance での照合に委ねる形になる。docs 更新の漏れは conformance 段階で検出される。
