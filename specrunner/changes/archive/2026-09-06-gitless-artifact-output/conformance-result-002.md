# Conformance Result — gitless-artifact-output (Iteration 2)

Reviewer: conformance agent  
Date: 2026-09-06  
Scope: `git diff main...HEAD --stat` — 67 files changed, 15699 insertions(+), 17 deletions(-)

---

## Evidence Summary

| Checked | Skipped | Unverified |
|---------|---------|------------|
| 48      | 0       | 0          |

Verification result (from pipeline): **passed** (build / typecheck / test / lint / changed-line-coverage all green).

---

## Normative Items Verified

### Request Acceptance Criteria

| # | AC | Status |
|---|----|----|
| 1 | ADRでartifact-output profileのauthority / revision identity / lifecycle / 保証差分が定義される | ✅ `specrunner/adr/2026-09-05-gitless-artifact-output.md` 368行、D1–D16を網羅 |
| 2 | Gitが担う責務が「snapshotで置換 / profile固有 / 初期unsupported」に分類される | ⚠️ 分類は ADR 決定群に散在。docs/artifact-output-profile.md には明示的な3列分類表なし（後述 Finding 2） |
| 3 | Git repository外のfixtureで最小縦断が完走する | ✅ `tests/artifact-output-vertical.test.ts` TC-001〜TC-078 |
| 4 | SpecRunner自身がgit / GitHub APIを呼ばないことを機械的に検証できる | ✅ guarded-spawn（fail-closed）+ architecture grep ratchet + vertical test spawn recording |
| 5 | 元source directoryが成功時・失敗時とも変更されない | ✅ `assertSourceUnchanged` が全終了経路（completed / halted / failed）で実行 |
| 6 | added / modified / deletedがmanifestへ出力される | ✅ `deriveChangeSet` + `buildManifest` |
| 7 | text patchで表現できない変更がmanifest / payloadから欠落しない | ✅ D8分類（patch.ts）、manifest全変更entry必須、binary/symlink/mode変更はpayloadまたはmetadataで補完 |
| 8 | baseline / candidate digestがartifactとverification / review recordへ束縛される | ✅ `revision-binding.ts` の pre/post drift check、cross-phase一致チェック (step 8.5)、manifest.ts |
| 9 | snapshot取得・比較不能が「変更なし」として通過しない | ✅ `collectSnapshot` は failures≥1 で `unavailable` 返却、`deriveChangeSet` も `unavailable` で fail-closed |
| 10 | Git依存stepを開始前preflightで列挙し、途中まで実行してから落ちない | ✅ run.ts phase 1で`planEffectivePipeline` → `!executable` なら candidate作成前に停止 |
| 10b | issue-originated entry が preflight で拒否される | ⚠️ `assertEntryRouteSupported` は実装・テスト済みだが `runArtifactOutput` の phase 1 に統合されていない（後述 Finding 1） |
| 11 | 既存Git/PR profileの挙動は変わらない | ✅ 既存ファイルへの変更は guide.ts（topic追加）・README のみ。TC-031で git-pr profile の unsupported 0 件を機械固定 |
| 12 | CLI / READMEで --no-worktree との違い・保証・unsupported operationが説明される | ✅ guide topic `artifact-output`（`buildUnsupportedOperationsTable()`動的生成）、README §Artifact-Output Profile |
| 13 | 実測結果と次段階の分割Issue案が記録される | ⚠️ 次段階Issue案はADR記録済み。実測値（時間・容量・支配的コスト）とdocs内の続行判断なし（後述 Finding 2） |
| 14 | SpecRunner verificationがgreen | ✅ build / typecheck / test / lint / changed-line-coverage すべて passed |

---

### Spec Requirements (SHALL / MUST)

#### Requirement: git / GitHub を呼ばない

- `createGitDenyingSpawn`: basename が `git` / `gh` なら inner を呼ばず Error を throw（fail-closed）。✅
- `ArtifactOutputRunInput` に GitHub client を型としても受け取らない。✅
- architecture ratchet（grep）が git-exec / worktree / adapter / github-client / src/git への value import を 0 件で保証。✅
- Scenario "git invocation attempted through guarded seam fails closed" → guarded-spawn.test.ts TC ✅
- Scenario ".git directory is not consulted as authority" → vertical test TC-003 ✅

#### Requirement: source directoryを変更しない

- source に書く経路なし（materialize は copy のみ）。✅
- run終了時（completed / halted / failed）に `assertSourceUnchanged` を実行し、`mutated` / `unverifiable` は `source-mutated` として fail-closed 記録。✅
- Scenario "Source mutated during run is detected" → TC-006 (vertical test) ✅

#### Requirement: revision identity は再計算可能な snapshot digest

- `computeSnapshotDigest`: schemaVersion + exclusions + `kind\0path\0mode\0contentDigest\n` を streaming SHA-256。時刻・絶対path・inodeを含まない。✅
- dir エントリは `dir\0<path>\040000\0\n`（contentDigest = 空文字列、\0保持）の唯一正規形。✅
- Scenario "Two independent snapshots of identical trees produce identical digests" → digest.test.ts ✅
- Scenario "Executable bit change alters the digest" → digest.test.ts ✅
- Scenario "Empty directory is part of the identity" → digest.test.ts ✅
- Scenario "Symlinks identified by target, not content" → collect.ts + digest.ts（`computeSymlinkDigest` に "symlink:" prefix） ✅

#### Requirement: snapshot・比較失敗は「変更なし」にならない

- `collectSnapshot`: failure≥1 → `{ kind: "unavailable" }`（部分snapshotを返さない）。✅
- `deriveChangeSet`: exclusions不一致 → `unavailable`。✅
- Scenario "Unreadable file makes snapshot unavailable" → collect.test.ts ✅
- Scenario "Unsupported entry kind makes snapshot unavailable" → collect.test.ts ✅
- Scenario "Symlink escaping source root makes snapshot unavailable" → collect.test.ts ✅
- Scenario "Unavailable change set does not become empty" → run.ts の changeSetResult unavailable 分岐 ✅

#### Requirement: 変更集合はsnapshot比較から導出しnon-text変更を欠落させない

- `deriveChangeSet`: added / modified / deleted を entry map突き合わせで導出。rename推定なし。✅
- kind変化 → deleted + added の2 entry（previousKind補助情報）。✅
- mode変化のみ → modified（mode / previousMode 双方記録）。✅
- Scenario "Binary change appears in change set" → compare.test.ts ✅
- Scenario "Mode-only change appears as modified" → compare.test.ts ✅
- Scenario "Moved file is delete plus add" → compare.test.ts ✅

#### Requirement: text patchで表現できない変更がartifactから欠落しない

- D8 分類表（9種）が patch.ts に厳密実装。`unsupported` は collect.ts での fail-closed で到達不能にし、finalize 前に run が halt。✅
- binary (added/modified) → `omitted:binary`、payloadに candidate bytes。✅
- symlink / dir / mode-only → `not-applicable`、manifest に metadata（target / mode）。✅
- 削除 text → `included:deletion`、changes.patch に削除 hunk。✅
- 削除 binary → `omitted:binary-deletion`、patch・payloadどちらにも含まない（仕様通り）。✅
- `omitted:unreadable` の added entry が finalization 時に I/O fail → artifact.staging のまま artifact/ 未生成（fail-closed）。TC-022 ✅
- Scenario "Symlink change recorded in manifest" → compare.ts symlinkTarget フィールド + manifest.ts ✅
- Scenario "Deletion in both patch and manifest" → vertical test AC（`changes.patch` に削除 hunk）✅

#### Requirement: artifact は 1 出力単位で atomic finalize、source に自動適用しない

- `finalizeArtifact`: artifact.staging/ に全ファイルを書き切ってから `fs.rename` で artifact/ へ移動。途中失敗 → artifact/ 未生成。✅
- APPLY.md に「自動適用しない」「適用は baseline digest 一致が前提」を明記。✅
- Scenario "Successful run produces complete artifact set" → vertical test TC-023 ✅
- Scenario "Failure before finalization leaves no artifact directory" → TC-024 ✅
- Scenario "Apply instructions declare baseline-digest precondition" → APPLY.md テンプレート ✅

#### Requirement: verification / review record は candidate revision に束縛

- `runBoundToCandidateRevision`: 実行前 snapshot → 実行 → 実行後 snapshot → digest 照合 → 不一致で `revision-drift` halt。✅
- step 8.5: verification bound digest と review bound digest の cross-phase 一致チェック。✅
- `manifest.candidateDigest` = verification bound digest（step 6 の frozen snapshot）。✅
- Scenario "Verification and review records carry the candidate digest" → vertical test ✅
- Scenario "Candidate mutation during verification halts the run" → revision-binding.test.ts ✅
- Scenario "Candidate mutation during review halts the run" → TC-077 (vertical test) ✅

#### Requirement: Git依存 operation を preflight で実行前に列挙

- `planEffectivePipeline`: STEP_CAPABILITY_REQUIREMENTS × profile capabilities のデータテーブルで判定。✅
- artifact-output profile では pr-create / merge / archive / branch-checkpoint / commit-adopt / egress-ledger が unsupported。✅
- git-pr profile では既存 3 pipeline 全て unsupported 0 件（TC-031）。✅
- Scenario "Unsupported steps listed before execution" → preflight.test.ts ✅
- Scenario "Non-executable pipeline stops before workspace" → run.ts phase 1 で candidate 作成前に halt ✅
- Scenario "Existing git profile reports no unsupported steps" → TC-031 ✅

#### Requirement: lifecycle limits を宣言する

- `run.json` に `resume: { supported: false, reason: "..." }` を確定。✅
- TC-032 / TC-073: run.json の resume.supported === false を確認。✅
- Scenario "Run record declares resume as unsupported" → TC-073 ✅
- Scenario "Run evidence not stored only in agent-writable area" → run root layout: run.json / baseline/snapshot.json は candidate/ 外 ✅

#### Requirement: agent / reviewer context は snapshot 由来

- `buildSnapshotContext`: baseline digest / candidate digest / changed paths / non-text entries / 明示的 history 文言を含む。空文字 禁止。✅
- verification phase では `changesNotYetDerived=true` を渡し「not yet derived」明示（fail-open 回避）。✅
- Scenario "Reviewer context carries candidate revision and change summary" → context.ts ✅
- Scenario "Missing history is stated not blank" → historySection は空文字でなく明示文 ✅

#### Requirement: 既存 git profile を変更しない

- 既存 runtime / pipeline / step モジュールへの変更なし。guide.ts と README のみ変更（additive）。✅
- TC-040/TC-041: artifact-output・snapshot モジュールが runtime / pipeline / step をimport しないことをgrep確認。✅
- Scenario "Existing runtime modules do not import new profile modules" → architecture test TC-040/TC-041 ✅
- Scenario "Default job start path is unchanged" → TC-072: --source / --source-root が flag-parser.ts に未配線 ✅

---

## Findings

### Finding 1 — `runArtifactOutput` の phase 1 preflight が issue-originated entry を拒否しない

**Severity**: medium  
**Resolution**: fixable (implementer)

**Evidence**:  
`run.ts` の phase 1 は `planEffectivePipeline` のみ呼び出す。`assertEntryRouteSupported`（`execution-profile.ts` に実装・`preflight.test.ts` で単体テスト済み）は `runArtifactOutput` の入力型 `ArtifactOutputRunInput` にも preflight フェーズにも統合されていない。  
`ArtifactOutputRunInput` に `fromIssue` / `issueLinked` フィールドが存在しないため、現状では issue 起点の entry を渡す経路がなく「構造的な到達不能」で防いでいるが、spec が求める "rejected by the same preflight" の積極的な検証ではない。

**対象 spec**:  
> Requirement: Git-dependent operations shall be enumerated by preflight before execution starts  
> "Entry routes that the profile cannot support SHALL be rejected by **the same preflight**."  
> Scenario: Issue-originated entry is rejected by preflight

**修正対象**: `src/core/artifact-output/run.ts`  
`ArtifactOutputRunInput` に `fromIssue?: boolean; issueLinked?: boolean` を追加し、phase 1 の preflight で `assertEntryRouteSupported` を呼び出して issue 起点を明示的に拒否し、テストでカバーする。

---

### Finding 2 — docs/artifact-output-profile.md に実測値・Git責務分類表・続行判断が欠如

**Severity**: medium  
**Resolution**: fixable (implementer)

**Evidence**:  
`docs/artifact-output-profile.md`（154行）には metric フィールドの説明はあるが、次の内容が欠如している:

1. **Git責務分類表**（「snapshotで置換 / profile固有 / 初期unsupported」の3列）  
   — design D16・request「実測レポート」・tasks T-12 が docs に明示的な表を求める。ADR のD1-D16決定群にロジックは散在するが、3列分類表として凝縮されていない。

2. **実測値**（T-10規模ケースで観測した時間・容量・支配的コスト）  
   — `metrics` フィールド一覧はあるが、実際に縦断を実行した数値が記録されていない（tasks T-12:「実際に run して転記する」）。

3. **続行 / scope縮小 / 中止の判断と根拠**  
   — request「この縦断から以下を記録する」で明示的に求める。ADR の "Known Gaps" はあるが測定値に基づく判断文がない。

4. **次段階の分割Issue案**  
   — ADR の "移行計画" / "Known Gaps" 節に5項目記載あり（部分的に満足）。docs にも再掲を求める。

**対象 request AC**:  
> - [ ] 実測結果と次段階の分割Issue案が記録される  
> - [ ] Gitが現在担う責務が「snapshotで置換 / profile固有 / 初期unsupported」に分類される

**修正対象**: `docs/artifact-output-profile.md`  
（a）Git責務3列分類表を追加、（b）縦断テスト実行後の metrics 実測値（duration / entry数 / バイト数 / artifact容量）を転記、（c）大規模走査コストの分析と続行判断文を追記。

---

## Plan Divergences (findings なし)

以下の設計・タスク上の選択は request / spec に違反しないため finding としない:

- **D2**: `runArtifactOutput` は既存 `CommandRunner` / `LocalRuntime` を経由しない独立 orchestrator。request が「CLIサブコマンドとしての完成度は必須としない」を明示。
- **`--source <dir>` 未配線**: design D15 の意図的な deferred（TC-072 で「未配線」を機械固定）。AC「CLI/READMEで説明される」は guide topic と README で満足。
- **D9 APPLY.md の apply コマンド未実装**: request Non-goals に「source directory への自動適用」明記。APPLY.md 内に手順と baseline digest 事前条件は記載済み。
- **`omitted:unreadable` で finalize 拒否**（D8 `unsupported` 分類の代替実装）: fifo 等は `collectSnapshot` の fail-closed で change set に到達不能。`artifact-writer.ts` が `copyFile` 失敗 → throw → artifact/ 未生成という代替 fail-closed 経路で spec の「finalization fails closed」を満足。TC-022 で確認。
- **context.ts が verification phase で `changesNotYetDerived=true` を渡す**: D14 の既知制約（change set は verification 後に凍結 snapshot から導出）に対応した設計選択であり spec の「missing history is stated not blank」を満足。

---

## 次段階 fix 優先度

1. **Finding 1（medium）**: `runArtifactOutput` phase 1 への `assertEntryRouteSupported` 統合 — spec SHALL 違反、実装量は小さい
2. **Finding 2（medium）**: `docs/artifact-output-profile.md` の実測値・分類表・続行判断追記 — request AC 違反、測定値の収集と記述が必要
