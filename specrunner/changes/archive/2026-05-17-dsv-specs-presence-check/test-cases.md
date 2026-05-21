# Test Cases: dsv-specs-presence-check

## Overview

`delta-spec-validation` (dsv) に specs/ 不在 check (Step 5) を追加する変更のテストシナリオ。
type=spec-change/new-feature のとき specs/ に .md が 0 件なら `verdict: needs-fix` を返す機械的強制を検証する。

---

## Category: Unit — validateDeltaSpecPaths (Step 5 core logic)

### TC-V-11 [must] type=spec-change + specs/ .md 0件 → no-specs-for-required-type violation

- **Source**: request.md 要件1 / tasks.md TC-V-11 / 受け入れ基準
- **Priority**: must

**GIVEN** changePath に design.md のみ存在し、specs/ ディレクトリが存在しない  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "spec-change")` を呼ぶ  
**THEN**
- `result.ok === false`
- `result.violations.length === 1`
- `result.violations[0].reason === "no-specs-for-required-type"`
- `result.violations[0].path` が `${changePath}/specs/` で終わる
- `result.violations[0].suggested` に `spec-change` と `specs/<capability-name>/spec.md` が含まれる

---

### TC-V-12 [must] type=new-feature + specs/ .md 0件 → no-specs-for-required-type violation

- **Source**: request.md 要件1 / tasks.md TC-V-12 / 受け入れ基準
- **Priority**: must

**GIVEN** changePath に design.md のみ存在し、specs/ ディレクトリが存在しない  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "new-feature")` を呼ぶ  
**THEN**
- `result.ok === false`
- `result.violations.length === 1`
- `result.violations[0].reason === "no-specs-for-required-type"`
- `result.violations[0].suggested` に `new-feature` が含まれる

---

### TC-V-13 [must] type=bug-fix + specs/ .md 0件 → approved (対象外)

- **Source**: request.md 要件1 / tasks.md TC-V-13 / 受け入れ基準
- **Priority**: must

**GIVEN** changePath に design.md のみ存在し、specs/ ディレクトリが存在しない  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "bug-fix")` を呼ぶ  
**THEN**
- `result.ok === true`
- violations が返らない

---

### TC-V-14 [must] type=refactoring + specs/ .md 0件 → approved (対象外)

- **Source**: request.md 要件1 / tasks.md TC-V-14 / 受け入れ基準
- **Priority**: must

**GIVEN** changePath に design.md のみ存在し、specs/ ディレクトリが存在しない  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "refactoring")` を呼ぶ  
**THEN**
- `result.ok === true`
- violations が返らない

---

### TC-V-15 [must] type=spec-change + specs/ に .md 1件以上 → Step 5 は通過、既存 Step 1-4 継続

- **Source**: request.md 要件1 / tasks.md TC-V-15 / 受け入れ基準
- **Priority**: must

**GIVEN** `${changePath}/specs/my-cap/spec.md` に有効な delta spec が存在する  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "spec-change")` を呼ぶ  
**THEN**
- `no-specs-for-required-type` violation が含まれない
- Step 1-4 の検査が継続して実行される（spec が valid なら `result.ok === true`）

---

### TC-V-16 [should] specs/ ディレクトリが存在するが .md ファイルが 0件 → fail

- **Source**: design.md §3 specs/ スキャンロジック
- **Priority**: should

**GIVEN** `${changePath}/specs/` ディレクトリが存在するが中に .md ファイルが 1件もない（空ディレクトリまたは非 .md ファイルのみ）  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "spec-change")` を呼ぶ  
**THEN**
- `result.ok === false`
- `result.violations[0].reason === "no-specs-for-required-type"`

---

### TC-V-17 [should] specs/ 直下（非サブディレクトリ）に .md ファイルが存在 → specs found と判定

- **Source**: design.md §3 — `.md` で終わる entry が直下にある場合も found
- **Priority**: should

**GIVEN** `${changePath}/specs/spec.md` がトップレベルに存在する（非正規パスだが .md は存在）  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "spec-change")` を呼ぶ  
**THEN**
- `no-specs-for-required-type` violation が含まれない（存在チェックはパス）

---

### TC-V-18 [should] requestType が undefined → Step 5 をスキップし既存挙動を維持

- **Source**: design.md §1 後方互換 / tasks.md Task 2b
- **Priority**: should

**GIVEN** changePath に specs/ が存在しない  
**WHEN** `validateDeltaSpecPaths(changePath, fs)` を引数 2つで呼ぶ（requestType 省略）  
**THEN**
- `no-specs-for-required-type` violation が含まれない
- 既存 Step 1-4 の挙動が変わらない

---

### TC-V-19 [could] 未知の type (例: "chore") + specs/ .md 0件 → approved

- **Source**: request.md 設計判断4 — 「他 type は対象外」
- **Priority**: could

**GIVEN** changePath に specs/ が存在しない  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "chore")` を呼ぶ  
**THEN**
- `result.ok === true`
- `no-specs-for-required-type` violation が含まれない

---

## Category: Unit — DeltaSpecViolationReason 型

### TC-T-01 [must] `no-specs-for-required-type` が DeltaSpecViolationReason union に存在する

- **Source**: request.md 要件2 / tasks.md Task 1 / 受け入れ基準
- **Priority**: must

**GIVEN** `delta-spec-validator.ts` の型定義  
**WHEN** TypeScript コンパイルを実行する  
**THEN**
- `DeltaSpecViolationReason` 型に `"no-specs-for-required-type"` メンバーが含まれる
- `bun run typecheck` が green

---

### TC-T-02 [must] violation オブジェクトが既存 `path / reason / suggested` schema に準拠する

- **Source**: request.md 要件2 / 受け入れ基準「findings format が既存と同 schema」
- **Priority**: must

**GIVEN** Step 5 が発火した結果の violation オブジェクト  
**WHEN** `formatViolationsTable` に渡す  
**THEN**
- エラーなくレンダリングされる
- `path`、`reason`、`suggested` フィールドが全て含まれる

---

## Category: Unit — DeltaSpecValidationStep (dsv step)

### TC-DSV-04 [must] Step 5 fail (no-specs-for-required-type) → result file に verdict: needs-fix が書かれる

- **Source**: request.md 要件3 / tasks.md TC-DSV-04 / 受け入れ基準
- **Priority**: must

**GIVEN** `validateDeltaSpecPaths` モックが `{ ok: false, violations: [{ reason: "no-specs-for-required-type", ... }] }` を返す  
**WHEN** `DeltaSpecValidationStep.run(state, deps)` を呼ぶ  
**THEN**
- result file の内容に `## Verdict: needs-fix` が含まれる
- result file の内容に `no-specs-for-required-type` が含まれる

---

### TC-DSV-05 [must] dsv step が `deps.request.type` を `validateDeltaSpecPaths` の第 3 引数として渡す

- **Source**: request.md 要件1 / tasks.md Task 3
- **Priority**: must

**GIVEN** `deps.request.type` が `"spec-change"` にセットされた state  
**WHEN** `DeltaSpecValidationStep.run(state, deps)` を呼ぶ  
**THEN**
- `validateDeltaSpecPaths` の第 3 引数に `"spec-change"` が渡された呼び出しが記録される

---

## Category: Unit — delta-spec-fixer prompt

### TC-F-01 [should] fixer の initial message に specs/ 新規作成 hint が含まれる

- **Source**: request.md 要件3 / tasks.md Task 4 / design.md §6
- **Priority**: should

**GIVEN** `buildDeltaSpecFixerInitialMessage` を呼ぶ  
**WHEN** 返却されたメッセージ文字列を確認する  
**THEN**
- `specs/` または `delta spec` が存在しない場合に新規作成するよう指示する文言が含まれる
- 既存の move/rename 手順が壊れていない

---

## Category: Integration — dsv step → delta-spec-fixer 遷移

### TC-INT-01 [must] Step 5 fail → delta-spec-fixer に遷移する経路が動く

- **Source**: request.md 要件3 / 受け入れ基準「dsv step が Step 5 fail で delta-spec-fixer に遷移する経路が動く」
- **Priority**: must

**GIVEN** type=spec-change で specs/ が空の change folder  
**WHEN** dsv step が実行される  
**THEN**
- verdict: needs-fix が返る
- pipeline が delta-spec-fixer step を次に起動する（既存 needs-fix 経路）
- escalation せずに処理が継続する

---

## Category: Integration — PR #282 reproduction scenario

### TC-REPRO-01 [should] type=spec-change で design が specs/ を作らないまま dsv を通過しない

- **Source**: request.md 要件6 / 受け入れ基準「PR #282 と同型の reproduction scenario が dsv で catch されて escalation せず完走する」
- **Priority**: should

**GIVEN** type=spec-change な request で、design agent が specs/ を作成しないまま completed になった状態  
**WHEN** dsv step が実行される  
**THEN**
- dsv が `needs-fix` を返す（`approved` で素通りしない）
- delta-spec-fixer agent が起動して specs/ を補填する
- fixer 後に再 dsv が実行され approved で通過する
- spec-merge で `specs/ absent` escalation が発生しない

---

## Category: Regression — 既存 Step 1-4 の挙動維持

### TC-REG-01 [must] 既存 legacy-flat-file check が regression しない

- **Source**: 受け入れ基準「既存 dsv test (path / format) が regression していない」
- **Priority**: must

**GIVEN** `${changePath}/specs/delta-spec.md` が存在する（legacy flat file パターン）  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "spec-change")` を呼ぶ  
**THEN**
- `reason: "legacy-flat-file"` の violation が返る
- Step 5 の `no-specs-for-required-type` は **含まれない**（.md ファイルが存在するため Step 5 は通過）

---

### TC-REG-02 [must] 既存 non-canonical-path check が regression しない

- **Source**: 受け入れ基準「既存 dsv test (path / format) が regression していない」
- **Priority**: must

**GIVEN** `${changePath}/specs/wrong/subdir/spec.md` のような非正規パスの delta spec が存在する  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "spec-change")` を呼ぶ  
**THEN**
- `reason: "non-canonical-path"` の violation が返る
- `no-specs-for-required-type` は含まれない

---

### TC-REG-03 [must] 既存 missing-requirements-section check が regression しない

- **Source**: 受け入れ基準「既存 dsv test (path / format) が regression していない」
- **Priority**: must

**GIVEN** `${changePath}/specs/cap/spec.md` が存在するが `## Requirements` セクションがない  
**WHEN** `validateDeltaSpecPaths(changePath, fs, "spec-change")` を呼ぶ  
**THEN**
- `reason: "missing-requirements-section"` の violation が返る
- `no-specs-for-required-type` は含まれない

---

### TC-REG-04 [must] `bun run typecheck && bun run test` が全 green

- **Source**: 受け入れ基準
- **Priority**: must

**GIVEN** 本変更が全て実装された状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN**
- TypeScript コンパイルエラーなし
- 全テスト pass（新規 5 件 + 既存テスト regression なし）

---

## Category: Spec Authority

### TC-SPEC-01 [must] spec authority (pipeline-orchestrator/spec.md) に Step 5 の Requirement が反映されている

- **Source**: request.md 要件5 / 受け入れ基準「spec authority に Step 5 の Requirement が反映されている」
- **Priority**: must

**GIVEN** `specrunner/specs/pipeline-orchestrator/spec.md` を確認する  
**WHEN** ファイルの Requirement セクションを読む  
**THEN**
- type=spec-change/new-feature で specs/ 不在 → needs-fix のシナリオが記載されている
- type=bug-fix で specs/ 不在 → approved（対象外）のシナリオが記載されている
- type=spec-change で specs/ に .md 1件以上 → 後段 Step 1-4 に進むシナリオが記載されている

---

## Summary

| ID | Category | Priority | Source |
|----|----------|----------|--------|
| TC-V-11 | Unit: validator | must | req.1 / tasks TC-V-11 |
| TC-V-12 | Unit: validator | must | req.1 / tasks TC-V-12 |
| TC-V-13 | Unit: validator | must | req.1 / tasks TC-V-13 |
| TC-V-14 | Unit: validator | must | req.1 / tasks TC-V-14 |
| TC-V-15 | Unit: validator | must | req.1 / tasks TC-V-15 |
| TC-V-16 | Unit: validator | should | design §3 |
| TC-V-17 | Unit: validator | should | design §3 |
| TC-V-18 | Unit: validator | should | design §1 後方互換 |
| TC-V-19 | Unit: validator | could | req. 設計判断4 |
| TC-T-01 | Unit: type system | must | req.2 / tasks Task 1 |
| TC-T-02 | Unit: type system | must | req.2 受け入れ基準 |
| TC-DSV-04 | Unit: dsv step | must | req.3 / tasks TC-DSV-04 |
| TC-DSV-05 | Unit: dsv step | must | req.1 / tasks Task 3 |
| TC-F-01 | Unit: fixer prompt | should | req.3 / tasks Task 4 |
| TC-INT-01 | Integration: fixer遷移 | must | req.3 受け入れ基準 |
| TC-REPRO-01 | Integration: reproduction | should | req.6 / PR#282 |
| TC-REG-01 | Regression | must | 受け入れ基準 |
| TC-REG-02 | Regression | must | 受け入れ基準 |
| TC-REG-03 | Regression | must | 受け入れ基準 |
| TC-REG-04 | Regression | must | 受け入れ基準 |
| TC-SPEC-01 | Spec Authority | must | req.5 受け入れ基準 |
