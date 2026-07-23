# Regression Gate: spec-fixer-tasks-md-writable — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証方法

`git diff main...HEAD --stat` で 29 ファイルの変更を確認後、Findings Ledger の 3 件を個別に読み込み検証。

---

## Findings 検証

### Finding 1 [MEDIUM]: src/prompts/rules.ts:47 — spec-fixer 責任範囲テーブルが stale

**確認結果: FIXED ✓**

現在の line 47:
```
| spec-fixer | change folder 内の spec.md, design.md, tasks.md | source code |
```

`git diff main...HEAD -- src/prompts/rules.ts` でも確認:
- `-| spec-fixer | change folder 内の spec.md, design.md | source code |`
- `+| spec-fixer | change folder 内の spec.md, design.md, tasks.md | source code |`

修正が present であり、退行なし。

---

### Finding 2 [LOW]: TC-012 first sub-test の it(...) タイトルと inline comment が旧 routable 集合を断言

**確認結果: REGRESSED ✗**

`src/core/step/__tests__/spec-review-fixer-routing.test.ts` の現在のコード:

```
line 836: // THEN only spec.md and design.md findings are returned
line 844: it("TC-012: only spec.md and design.md fixable findings are returned (request.md and src/ excluded)", () => {
line 858: // Only spec.md and design.md are routable
```

`git diff main...HEAD` を確認したところ、TC-013 の更新（line 912 以降）と `makeCanonScope()` fixture の更新（line 105: `TASKS_MD` 追加）のみが変更されており、TC-012 first sub-test の title（line 844）と inline comment（line 858）は変更されていない。

これらは tasks.md が routable になった現在も `{spec.md, design.md}` と断言しており、技術的に不正確のまま残っている。`implementation-notes.md` にも TC-012 title/comment 更新の記録はない。修正未適用。

---

### Finding 3 [LOW]: FAST pipeline: tasks.md conformance findings lose CANON_FINDING_ESCALATION diagnostic

**確認結果: REGRESSED ✗**

提案された修正は以下のいずれか:
1. design.md D3 に「FAST pipeline では tasks.md 含む全 spec-fixer-routable conformance finding が no-transition escalation となり escalationReason は設定されない」と明示
2. FAST + conformance + tasks.md + fixTarget:spec-fixer の挙動を固定するテストを追加

**検証**:
- `specrunner/changes/spec-fixer-tasks-md-writable/design.md` を全文検索したが "FAST" の記述は 0 件。D3 節（lines 102-118）も FAST への言及なし。
- `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts`（新規 test file）を全文検索したが "FAST" / "no-transition" / "diagnostic" の記述は 0 件。
- `cross-boundary-invariants-result-001.md` が F1 として当該シナリオを詳細に記録しているが、それに対応する修正が source/design のどちらにも適用されていない。

どちらの修正も実施されておらず、FAST pipeline での tasks.md conformance finding の escalationReason 消失が undocumented・untested のまま。

---

## エビデンス集計

| Ledger item | 状態 |
|-------------|------|
| Finding 1 — rules.ts:47 | FIXED ✓ |
| Finding 2 — TC-012 title/comment | REGRESSED ✗ |
| Finding 3 — FAST diagnostic | REGRESSED ✗ |
