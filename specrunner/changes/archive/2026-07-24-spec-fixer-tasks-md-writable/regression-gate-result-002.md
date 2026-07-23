# Regression Gate: spec-fixer-tasks-md-writable — Iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証方法

`git diff main...HEAD --stat` で 30 ファイルの変更を確認後、Findings Ledger の 3 件を個別に読み込み検証。

---

## Findings 検証

### Finding 1 [MEDIUM]: src/prompts/rules.ts:47 — spec-fixer 責任範囲テーブルが stale

**確認結果: FIXED ✓**

`git diff main...HEAD -- src/prompts/rules.ts` にて確認:
```
-| spec-fixer | change folder 内の spec.md, design.md | source code |
+| spec-fixer | change folder 内の spec.md, design.md, tasks.md | source code |
```

修正が present であり、退行なし。

---

### Finding 2 [LOW]: TC-012 first sub-test の it(...) タイトルと inline comment が旧 routable 集合を断言

**確認結果: REGRESSED ✗**

`src/core/step/__tests__/spec-review-fixer-routing.test.ts` の現在のコード（iteration 2 も変化なし）:

```
line 844: it("TC-012: only spec.md and design.md fixable findings are returned (request.md and src/ excluded)", () => {
line 858:     // Only spec.md and design.md are routable
```

`git diff main...HEAD` を確認すると、TC-013 の更新（line 912 以降）と `makeCanonScope()` fixture の更新（line 105: `TASKS_MD` 追加）はなされているが、TC-012 first sub-test の title（line 844）と inline comment（line 858）は iteration 1 から引き続き変更されていない。

tasks.md が routable になった現在も `{spec.md, design.md}` と断言しており、技術的に不正確のまま残っている。T-03 の acceptance criteria にある「adjust only if its inline comments still describe tasks.md as unroutable」の解釈として tasks.md への言及が無いためスキップされたと推測されるが、旧 routable 集合を断言するタイトル/コメントは stale である点に変わりない。

---

### Finding 3 [LOW]: FAST pipeline: tasks.md conformance findings lose CANON_FINDING_ESCALATION diagnostic

**確認結果: FIXED ✓**（operator が iteration 2 で design.md D3 を適用）

`specrunner/changes/spec-fixer-tasks-md-writable/design.md` D3 節（lines 115-123）に以下が追加されており、FAST pipeline での escalationReason 消失が明示されている:

```
- Consequence (FAST pipeline): `FAST_TRANSITIONS` intentionally has no
  `needs-fix:spec-fixer` row, so a fixable conformance finding on tasks.md with
  `fixTarget: spec-fixer` now derives `needs-fix:spec-fixer` and falls through the
  no-matching-transition default to the `escalate` terminal. Unlike the previous
  unroutable-canon escalation, this path does NOT set `escalationReason` (the verdict at
  derivation time is `needs-fix:spec-fixer`, not `escalation`). The FAST profile still
  fails closed — the job halts — but the operator sees a plain escalation without a
  CANON_FINDING_ESCALATION reason. This behavior is pinned by a FAST-profile test so the
  reason-less halt is a documented contract, not an accident.
```

修正 present。退行なし。

**補足観察**: D3 が「FAST-profile test で固定」と述べているが、専用の FAST × conformance × tasks.md テストは存在しない。TC-007（`deriveConformanceVerdict` が `needs-fix:spec-fixer` を返す）と既存の FAST_TRANSITIONS 構造テスト（bite-evidence-pipeline.test.ts:147-155）の組み合わせによる間接的な固定のみ。独立したエンドツーエンドの FAST-profile テストは未追加。

---

## エビデンス集計

| Ledger item | 状態 |
|-------------|------|
| Finding 1 — rules.ts:47 | FIXED ✓ |
| Finding 2 — TC-012 title/comment | REGRESSED ✗ |
| Finding 3 — FAST diagnostic (D3 note by operator) | FIXED ✓ |
