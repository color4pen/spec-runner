# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: 受け入れ基準 (request.md)

**AC1** — dirty canon + 未知 commit 併存 → 1回の halt に両内訳 + `--apply-canon --adopt-commits`

- `resume-operator-guidance.test.ts` TC-001: `mockBuildAdoptionHaltMessage` が両フラグ付きで呼ばれることを verify。`stderrWrite` に `COMBINED_HALT_MSG`（`--apply-canon --adopt-commits` 含む）が渡ることを confirm。
- Verified ✓

**AC2** — dirty canon のみ → `--apply-canon` のみ、未知 commit のみ → `--adopt-commits` のみ

- TC-002: `mockDetectUnadoptedCommits.mockResolvedValue([])` のとき `buildAdoptionHaltMessage` に `unadoptedCommits: []` が渡り、`CANON_ONLY_HALT_MSG`（`--adopt-commits` を含まない）が stderrWrite に渡ることを verify。
- TC-003: clean canon + 未知 commit のみ → Gate 2 が `buildAdoptEscalationMessage` を呼び、stderrWrite が `--apply-canon` を含まないことを verify。
- Verified ✓

**AC3** — preflight halt 前後で git 履歴と synthesizedCommits が不変

- TC-005: `commitOperatorCanon` が呼ばれないことを verify。`MOCK_STORE.persist` の全呼び出しが `synthesizedCommits` を変更していないことを verify。
- 注: unit test 境界のため git HEAD 実測は mock 境界外。read-only な `detectUnadoptedCommits`（git rev-list/show/diff-tree）のみ呼ばれ、コミット作成系関数が呼ばれないことで副作用なしを保証。
- Verified ✓

**AC4** — auto-quarantine 既存テスト無改変で green

- `src/core/command/__tests__/resume-partial-canon.test.ts`: `git diff main...HEAD` で no diff を確認。
- `src/core/resume/__tests__/apply-canon-provenance.test.ts`: 同上 no diff を確認。
- Verification result: 743 test files / 11141 tests passed。
- Verified ✓

**AC5** — `job resume --help` に詳細ヘルプ含む

- `tests/unit/cli/resume-help.test.ts` TC-007: `--from`, `--prompt`, `--prompt-file`, `--apply-canon`, `--adopt-commits`, `--detach`, `--force`, `--json` すべて出力に含まれることを verify。"No detailed help available." が含まれないことを verify。exit 0 かつ `runResume` 非呼び出しを verify。
- `JOB_RESUME_USAGE` 定数が `command-registry.ts:199–238` に定義され、resume エントリ line 688 に `usage: JOB_RESUME_USAGE` として配線を確認。
- Verified ✓

**AC6** — 存在しない slug の resume で slug 語彙のエラーを出力

- TC-008: `logError` の出力が `/no active job with slug or job ID prefix|slug.*not found|not found.*slug/i` にマッチすることを verify。
- 実装 (`resume.ts:181,184`): `logError(\`Job not found: no active job with slug or job ID prefix '${this.slug}'\`)` で "Job not found" を保持しつつ slug 語彙を追加。
- Verified ✓

**AC7** — `tests/resolve-job-id.test.ts` 無改変で green

- `git diff main...HEAD -- tests/resolve-job-id.test.ts` → no diff。
- `JobStateStore.resolveId` の "Job not found: no job ID starts with '...'" メッセージが `job-catalog.ts:288` で不変。
- Verified ✓

**AC8** — 許容ファイル以外の pin テスト不変、typecheck && test green

- 許容リスト外の変更確認:
  - `src/core/resume/__tests__/adopt-commits.test.ts` (TC-U5): no diff ✓
  - `tests/unit/cli/resume.test.ts` (TC-RESUME-010): no diff ✓
  - `tests/resolve-job-id.test.ts`: no diff ✓
- 許容リスト内の変更確認:
  - `tests/unit/cli/help-flag-dispatch.test.ts` TC-HELP-DISPATCH-03: "No detailed help available" assertion を削除し、`--from` / `--apply-canon` 含有と `stdoutContains("No detailed help available") == false` を verify する形へ更新 ✓
  - `src/core/command/__tests__/resume-apply-canon.test.ts`, `resume-adopt-commits.test.ts`, `resume-partial-canon.test.ts`: no diff（新実装後も既存 pin テストがそのまま通過するため更新不要。許容リスト内で問題なし）✓
  - `tests/operator-canon-apply-on-resume-e2e.test.ts`, `tests/resume-partial-canon-quarantine-e2e.test.ts`: touched-files に含まれず不変（許容リスト内だが変更不要）✓
- Verification result: build/typecheck/test/lint すべて passed。743 files / 11141 tests green。
- Verified ✓

---

### J2: 設計判断 (design.md)

**D1** — preflight は halt 境界で遅延実行、gate 順・採用処理の実体は変えない

- `haltWithCanonPreflight()` (`resume.ts:77–107`) は Gate 1 の fail-closed halt 枝（lines 425, 431）からのみ呼ばれる。
- `--apply-canon` 経路 (`resume.ts:357–388`) と auto-quarantine 経路 (`resume.ts:389–432`) は変更なし。
- Verified ✓

**D2** — 統合 halt builder は canon-only/canon+commits を担当、Gate 2 は `buildAdoptEscalationMessage` を不変維持

- `buildAdoptionHaltMessage` が `adopt-commits.ts:175–246` に新規追加。Gate 1 halt 枝から呼ばれる。
- Gate 2 (`resume.ts:473–478`) は `buildAdoptEscalationMessage` を引き続き使用。
- `src/core/resume/__tests__/adopt-commits.test.ts`（TC-U5）に no diff を確認（`buildAdoptEscalationMessage` signature・出力不変）。
- Verified ✓

**D3** — 完全コマンドの flag は検出結果から導出、検出失敗時は fail-closed

- `buildAdoptionHaltMessage`: `dirtyCanonPaths` 非空 → `--apply-canon`、`unadoptedCommits` 非空 かつ `commitDetectionFailed` でない → `--adopt-commits` を付与 (`adopt-commits.ts:225–229`)。
- exit 128: catch で "exit 128" 含有を判定し `preflightFailed` を上げず空扱い (`resume.ts:89–94`)。
- 非 exit 128 失敗: `preflightFailed = true` → `commitDetectionFailed: true` で halt、`--adopt-commits` なし。
- TC-006、TC-010 で両ケースを verify。
- Verified ✓

**D4** — `JOB_RESUME_USAGE` 定数追加・resume エントリに配線

- `command-registry.ts:199–238`: `JOB_RESUME_USAGE` 定数を定義。11 flag・相互排他 2 組・`--from` 有効値・複合 step 注記を含む。
- `command-registry.ts:688`: `usage: JOB_RESUME_USAGE` 追加。
- TC-007/TC-016 で verify。
- Verified ✓

**D5** — 未解決エラーの slug 文言は resume 側で additive に包み、resolveId は不変

- `resume.ts:181,184`: `logError(\`Job not found: no active job with slug or job ID prefix '${this.slug}'\`)` として "Job not found" を保持。
- `job-catalog.ts:288` の `resolveId` メッセージは no diff で不変。
- Verified ✓

---

### J3: Spec 要件 (spec.md MUST/SHALL)

**Req: 採用系 preflight を統合した単一 halt** (MUST)

Gate 1 fail-closed halt 時に `detectUnadoptedCommits` を追加実行し、両検出を 1 halt に統合。TC-001 が 1 halt かつ両フラグ含有を verify。`--apply-canon` 指定時・auto-quarantine 成立時の既存挙動は不変。
- Verified ✓

**Req: 統合 halt メッセージの形式** (MUST)

`buildAdoptionHaltMessage` が (a) dirty canon paths 列挙 (b) 未知 commit shortSha+subject 列挙 (c) 検出結果に応じた完全コマンド 1 行 (d) 代替案（discard/push/revert）を出力。TC-009(a)-(c) / TC-001 / TC-004 で verify。
- Verified ✓

**Req: preflight は副作用を持たず fail-closed を維持する** (MUST)

`detectUnadoptedCommits` は git rev-list/show/diff-tree の read-only。exit 128 = 空扱い。非 exit 128 失敗 → `commitDetectionFailed=true` で fail-closed。TC-005 / TC-006 で verify。
- Verified ✓

**Req: job resume の詳細ヘルプ** (MUST)

`JOB_RESUME_USAGE` が `<slug>` 引数説明・11 flag・相互排他 2 組・`--from` 有効値を含む。TC-007 / TC-016 で verify。
- Verified ✓

**Req: 未解決 slug の報告文言** (MUST)

resume 経路で slug でも Job ID prefix でも見つからない場合、slug 語彙のエラーを出力。TC-008 で verify。`JobStateStore.resolveId` は不変。
- Verified ✓

---

### J4: タスク完了 (tasks.md)

全タスクのチェックボックスが `[x]` 状態であることを確認。実装内容を照合:

| Task | Checkbox | 確認 |
|---|---|---|
| T-01: `buildAdoptionHaltMessage` 追加 | [x] | `adopt-commits.ts:175–246` に実装。adoption-halt.test.ts TC-009 で 3 分岐を verify |
| T-02: Gate 1 fail-closed halt を統合 halt に置換 | [x] | `resume.ts:77–107` (`haltWithCanonPreflight`) + 呼び出し lines 425, 431 |
| T-03: `JOB_RESUME_USAGE` 追加・配線 | [x] | `command-registry.ts:199–238` + line 688 |
| T-04: 未解決 slug 報告文言 | [x] | `resume.ts:181,184` の additive 文言 |
| T-05: 既存 pin テスト更新 | [x] | `help-flag-dispatch.test.ts` TC-HELP-DISPATCH-03 更新。許容リスト外は no diff |
| T-06: 新挙動の検証テスト追加 | [x] | TC-001〜TC-008/TC-010（resume-operator-guidance.test.ts）、TC-009（adoption-halt.test.ts）、TC-007/TC-016（resume-help.test.ts） |

---

## 検証できなかった項目

None。

---

## Findings 詳細

指摘なし。
