# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション検証（現状コードの前提）

**`src/core/step/judge-verdict.ts`**

- `:201-203` — `selectFixerTargetFindings`: `return collectFixableFindings(findings).filter((f) => f.severity !== "low");`。LOW 除外が実在する。コメント（197行目）に「code-fixer prompts must NOT re-filter by severity」が明記されている。request が `:199-202` と記載しているが、実際の関数本体は 201-203 行目（コメント末尾との差異 ±2 行）。内容の正確性は確認済み。
- `:58` — `if (findings.some((f) => f.severity === "critical" || f.severity === "high")) return "needs-fix";` を直接確認。needs-fix 発火は critical|high のみ。✓
- `:106-112` — spec-review の routable canon 判定：`routableCanon.some((f) => f.severity === "critical" || f.severity === "high")` → needs-fix、それ以外は approved へ fall through。✓
- `:69-82` — spec-review コメントで「low/medium fixable on routable canon → approved (observation auto-fix: spec-fixer consumes findings without re-review)」を明文確認。✓
- `deriveRegressionGateVerdict` — 関数コメント（209-213行目）に「the caller (step-completion.ts) applies excludeKnownUnfixedRegressions before invoking this function」が明記されている。✓
- `collectFixableFindings`（188-190行目）— `return findings.filter((f) => f.resolution === "fixable");` でのみフィルタし severity フィルタなし。request が `:187-189` と記載しているが実際は 188-190 行目（±1 行）。✓

**`src/core/step/code-fixer.ts`**

- `:149-150`、`:192-193`、`:218-219`、`:271` — 各ブロックの Please リストが「1. Fix all HIGH and CRITICAL severity findings (mandatory) / 2. Fix MEDIUM severity findings only if they do not require design changes」で LOW に言及しないことを直接確認。✓

**`src/core/step/routed-findings.ts`**

- `collectRoutedFixerFindings` の Branch 3 で `selectFixerTargetFindings(allFindings)` を呼び、コメントに「Apply severity policy (LOW excluded) — selectFixerTargetFindings is the single authoritative place」と記載。LOW 除外の主経路（code-fixer の noOpDetect 免除セット導出も同経路）。

**`src/core/pipeline/findings-ledger.ts`**

- `excludeKnownUnfixedRegressions`（230-242行目）が「ledger の severity === "low" エントリの fingerprint と一致する gate finding を除外する」関数として存在する。
- `step-completion.ts`（216行目・258行目）で呼ばれ、regression-gate の verdict 計算と persistToolResult の両方に適用されている。

### 2. 既存テストの LOW 除外 pin 状況

`src/core/step/__tests__/regression-gate-false-loop.test.ts` を読了:

- TC-005: `selectFixerTargetFindings` が LOW を除外し HIGH/MEDIUM を保持することを検証 → **変更後は LOW が保持される挙動になるため更新対象**
- TC-008: routing が LOW を除外することを検証 → **同上**
- TC-001/002: `excludeKnownUnfixedRegressions` を介して未修正 LOW が approved になるシナリオを検証 → **LOW が修正対象になると前提が消えるため更新/削除対象**
- TC-009/010: `excludeKnownUnfixedRegressions` の関数挙動を直接テスト → **関数が廃止される場合は削除対象**
- TC-011: `computeRegressionLedger` が skipWhen/buildMessage と一致する deduped 結果を返すことを検証 → **ledger 計算自体は変わらないため更新不要の可能性が高いが、design で確認**

### 3. 要件の整合性確認

- 要件 1（LOW 除外の削除）: `selectFixerTargetFindings` 一箇所の変更で達成可能。routing 層が唯一の正典であることが確認済み。✓
- 要件 2（regression-gate の ledger 全件検証）: `excludeKnownUnfixedRegressions` の廃止が必要。step-completion.ts 216行目・258行目、findings-ledger.ts 230-242行目が変更対象。✓
- 要件 3（LOW を無視する特例の全除去）: code-fixer.ts の Please リスト更新、regression-gate の known-unfixed 特例削除、no-op 特例削除が必要。noOpDetect（`noOpDetect: true` in code-fixer.ts L76）は現行で MEDIUM fixable にも適用されており、LOW に拡張しても同じ動作になる見込み。
- 要件 4（fixer prompt の規律維持）: 変更後も routing 層（selectFixerTargetFindings）が唯一の判定点という規律は維持される。✓

### 4. スコープ確認

- verdict 種別・escalation 条件の変更なし → deriveJudgeVerdict / deriveRegressionGateVerdict の本体には手を入れない ✓
- 再レビュー要否の基準変更なし → critical|high → needs-fix、low/medium → approved のラインは維持 ✓
- conformance / custom reviewers 挙動変更なし ✓

## 検証できなかった項目

None（全コードアサーションを直接読んで確認）

## Findings 詳細

None（blocking 指摘なし）。

---

**参考観察（verdict に影響しない補足）**:

- `selectFixerTargetFindings` の行番号が request `:199-202` に対して実際は `:201-203`（±2行）、`collectFixableFindings` が `:187-189` に対して実際は `:188-190`（±1行）。内容は正確であり、design step の task 記述に影響しない。
- `routed-findings.ts` 108-109行目のコメント（"LOW excluded"）も selectFixerTargetFindings の変更に伴い更新が必要。design が tasks.md でカバーすべき点。
- `step-completion.ts` が変更対象ファイルとして request 本文に明示されていないが、要件2の `excludeKnownUnfixedRegressions` 廃止により 216行目・258行目が必然的に変更対象となる。設計で自明に拾われる範囲。
