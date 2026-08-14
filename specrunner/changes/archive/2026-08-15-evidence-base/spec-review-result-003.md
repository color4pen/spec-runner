# Spec Review Result — evidence-base (round 003)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

| Finding | 対象 | 解消状況 |
|---------|------|---------|
| D2: default bun path 除外を明示すべき | design.md | ✅ 解消。D2 に "Exception: the default-bun path... is not available for `runTestsOnSynthesizedTree`" が追記された |
| gate レベルの absent Evidence Base ref → strategy-deferred TC 未収録 | test-cases.md | ✅ 解消。spec.md に "Scenario: Absent Evidence Base reference defers" が追加され、TC-009 として test-cases.md に収録された |

### request.md 受け入れ基準 ↔ spec.md / test-cases.md 対応

| 受け入れ基準 | 対応 Scenario / TC |
|-------------|-------------------|
| 再走形状で red 側に実装混入しない | Scenario: Re-run shape earns assurance / TC-001, TC-004 |
| 初回と resume 再走で同一 Evidence Base | Scenario: Job base is identical on first run and on resume / TC-002 |
| adopt-commits で採択された commit が candidate に含まれる | Scenario: Adopted operator commit is included in the candidate / TC-003 |
| 撤去対象の全列挙 (design D7) | design.md D7 表に全ファイル列挙、TC-016 で typecheck gate |
| strategy-deferred 挙動の不変 | TC-006, TC-007, TC-008, TC-009, TC-010 |
| typecheck && test green | TC-017 |

### ソースコード確認 (設計の前提事実)

| 設計の主張 | 確認ファイル・行 | 結果 |
|-----------|---------------|------|
| synthesizedCommits[0] = bootstrap commit (worktree path) | workspace-materializer.ts:213-242 | ✅ |
| synthesizedCommits[0] = bootstrap commit (no-worktree path) | local.ts:419-443 | ✅ |
| --adopt-commits は ledger 末尾に append; index 0 は不変 | resume.ts:460-464 | ✅ |
| captureHeadSha が runtime port に存在する | runtime-strategy.ts:329 | ✅ |
| detectBaseImplementationContamination が gate.ts と achieved-assurance.ts に import されている | gate.ts:20, achieved-assurance.ts:20 | ✅ 撤去対象として正しい |
| gate step 3.5 が gate.ts:119-129 に存在する | gate.ts:119-129 | ✅ |
| P2.5 が achieved-assurance.ts:236-246 に存在する | achieved-assurance.ts:236-246 | ✅ |
| RealRuntimeStrategy が intersection type として存在し runTestsAtCommit を required で持つ | runtime-strategy.ts:794-825 | ✅ 新 method 追加パターン確立済み |
| ManagedRuntime の unavailable stub パターンが存在する | managed.ts:671-678 | ✅ |
| "verified unrelated" ファイルの汚染参照がコメントのみ | apply-canon-provenance.test.ts, cli-run-verdict.test.ts | ✅ |

### D7 テストファイル一覧の存在確認

| ファイル | 存在 |
|---------|------|
| src/core/step/bite-evidence/__tests__/gate.test.ts | ✅ |
| src/core/step/bite-evidence/__tests__/gate-empty-selection.test.ts | ✅ |
| src/core/archive/__tests__/achieved-assurance.test.ts | ✅ |
| tests/unit/core/archive/achieved-assurance-test-file-selection.test.ts | ✅ |
| tests/unit/core/archive/achieved-assurance-revision-binding-unit.test.ts | ✅ |
| tests/unit/core/archive/achieved-assurance-revision-binding-integration.test.ts | ✅ |
| tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts | ✅ |
| tests/unit/core/archive/achieved-assurance-completeness-integration.test.ts | ✅ |
| tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts | ✅ |
| src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts | ✅ |

### spec.md 記法確認

- 全 4 Requirement に SHALL / MUST が含まれる ✅
- 全 Requirement に 1 件以上の Scenario が存在する ✅
- Given / When / Then 形式で記述されている ✅

## 検証できなかった項目

- `runTestsOnSynthesizedTree` 実装の存在確認 — 本 step は spec 審査であり実装前。実装確認はこのフェーズの scope 外
- e2e テスト (`bite-evidence-e2e-gate.test.ts`) の実際の動作 — 同上

## Findings 詳細

### F-001: design.md D7 — 構造削除確認の TC 番号参照が誤っている

**対応する finding (report_result)**: severity: low / resolution: fixable

design.md D7 の段落 "TC-014 verification mechanism (structural removal of `detectBaseImplementationContamination`)" が「TC-014 in test-cases.md is categorized as structural/static」と述べているが、test-cases.md の TC-014 は「runTestsOnSynthesizedTree returns unavailable and never throws for a non-existent baseRev」(category: unit) であり structural/static ではない。構造削除を typecheck で確認するのは TC-016 (category: gate, "detectBaseImplementationContamination is structurally absent after the change") である。参照先の TC 番号が誤っている。

なお gate-empty-selection.test.ts の TC-014 はタンパー検出テストであり、こちらも "structural/static" と合致しない。実装者が test-cases.md を正典として参照する限り TC-016 は正しく定義されているため実装上のリスクは低い。

**修正方針**: D7 の当該段落の "TC-014" を "TC-016" に修正する。

---

### F-002: test-cases.md — Summary の automated 数と Result YAML の automated 数が不整合

**対応する finding (report_result)**: severity: low / resolution: fixable

Summary セクションは "Automated (unit/integration): 15" と記載するが、Result YAML は `automated: 17` としている。TC-016 と TC-017 は category: gate であり、Summary では unit/integration に含めない。一方 YAML では `automated: 17` (= 全数) としており、`total: 17 = automated: 17 + manual: 0` は数式上成立するが Summary の "15" と一致しない。

**修正方針**: Result YAML を `automated: 15` に修正するか、または Summary の "Automated (unit/integration)" を gate も含む形 (17) に統一する。いずれかに合わせれば十分。
