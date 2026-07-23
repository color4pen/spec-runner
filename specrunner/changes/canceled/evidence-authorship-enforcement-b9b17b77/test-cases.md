# Test Cases: pipeline-owned evidence journal の authorship 強制

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 41 cases
- **Automated** (unit/integration): 41
- **Manual**: 0
- **Priority**: must: 18, should: 23, could: 0

---

## Group 1: Pure anchor foundation（`journal-anchor.ts` / `atomic-write.ts`）

### TC-001: `computeJournalDigest` は同一 bytes に同一 digest を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 同一の `eventsBytes` と `stateBytes` 文字列
**WHEN** `computeJournalDigest` を2回呼ぶ
**THEN** 両結果が `"sha256:"` プレフィクスで同一値を返す（決定的）

---

### TC-002: `computeJournalDigest` は 1 byte 変化で異なる digest を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** ベースの `eventsBytes` と `stateBytes`
**WHEN** どちらか1 byte だけ変えた引数で `computeJournalDigest` を呼ぶ
**THEN** ベースと異なる digest を返す（衝突なし）

---

### TC-003: `JournalAnchorHolder` が fresh→delta→fast→interruption→lineage 系列で full bytes を保持する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 新規の `JournalAnchorHolder`
**WHEN** fresh write（appendEvents + setState + markSeeded）→ delta（appendEvents + setState）→ fast（setState のみ）→ appendEvents（interruption/lineage 相当）の順に操作する
**THEN** `snapshot().digest` が各操作後の累積 events 文字列と最新 state 文字列を `computeJournalDigest` にかけた値と一致し、snapshot から full bytes が再現できる

---

### TC-004: `evaluateAnchorPresence` が design D7 の全分岐を返す

**Category**: unit
**Priority**: must
**Source**: design.md > D7 / tasks.md > T-01

**GIVEN** 各ケースの入力:
1. `inProcess=null, durable=null, onDiskDigest=null` → skip（新規 job の初回 write 前）
2. `inProcess=null, durable=null, onDiskDigest="sha256:abc"` → tamper（両 absent だが on-disk 存在）
3. `inProcess=null, durable="sha256:xyz", onDiskDigest=*` → use(durable)
4. `inProcess="sha256:foo", durable=*, onDiskDigest=*` → use(inProcess)

**WHEN** 各入力で `evaluateAnchorPresence` を呼ぶ
**THEN** 上記それぞれ `{kind:"skip"}` / `{kind:"tamper"}` / `{kind:"use",baseline:"sha256:xyz"}` / `{kind:"use",baseline:"sha256:foo"}` を返す

---

### TC-005: `atomicWriteJson` の出力 byte が `atomicWriteString` 経由後も従来と同一

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / design.md > D2

**GIVEN** 任意の JSON オブジェクト
**WHEN** `atomicWriteJson` で書き込み、ファイルを読み返す
**THEN** `JSON.stringify(obj, null, 2) + "\n"` と byte 一致し、既存テストが無変更で green になる

---

## Group 2: Durable anchor git plumbing（`evidence-anchor-ref.ts`）

### TC-006: `pushEvidenceAnchor` が hash-object → update-ref → push を順に呼ぶ

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / design.md > D3

**GIVEN** fake `spawnFn` でコマンド呼び出しを記録できる環境
**WHEN** `pushEvidenceAnchor(spawnFn, cwd, "feat/x", "sha256:abc")` を呼ぶ
**THEN** `git hash-object -w --stdin`（stdin = "sha256:abc"）→ `git update-ref refs/specrunner/evidence/feat/x <blobOid>` → `git push origin refs/specrunner/evidence/feat/x:refs/specrunner/evidence/feat/x` の順にコマンドが発行される

---

### TC-007: `pushEvidenceAnchor` は push 失敗でも throw しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / design.md > D3

**GIVEN** `git push` が非 0 で失敗する fake `spawnFn`
**WHEN** `pushEvidenceAnchor(...)` を呼ぶ
**THEN** 例外を throw せず resolve する（best-effort）

---

### TC-008: `readEvidenceAnchor` が present / absent / unavailable を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / design.md > D3

**GIVEN** 次の3パターンの fake `spawnFn`:
1. fetch 成功 → `cat-file` が `"sha256:abc\n"` を返す
2. fetch が ref 不在（非 0・特定の stderr）で失敗
3. fetch が network エラー（非 0・その他）で失敗

**WHEN** 各 fake で `readEvidenceAnchor(spawnFn, cwd, "feat/x")` を呼ぶ
**THEN** 1 → `{kind:"present", digest:"sha256:abc"}`、2 → `{kind:"absent"}`、3 → `{kind:"unavailable", reason:*}` を返す

---

## Group 3: `JobJournal` in-process anchor 統合（`job-journal.ts`）

### TC-009: `JobJournal` の全 mutation 経路で holder が on-disk と byte・digest 一致する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** `JournalAnchorHolder` を注入した `JobJournal`、実ファイル（tmpdir）
**WHEN** `persist`（fresh → delta → fast）→ `appendInterruption` → `appendLineage` の順に呼ぶ
**THEN** 各操作後 `holder.snapshot().digest` が on-disk の events.jsonl + state.json を `computeJournalDigest` した値と一致し続ける

---

### TC-010: Resume seed が最初の `persist` で on-disk を1度だけ読み、以後は再読しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** 既存 journal が存在する tmpdir と、新規の `JournalAnchorHolder`（`isSeeded()=false`）を注入した `JobJournal`
**WHEN** 最初の `persist` を呼ぶ
**THEN** on-disk events.jsonl + state.json が1度だけ読まれて holder に seed され（`isSeeded()=true`）、以後の `persist` では再読しない

---

### TC-011: `JournalAnchorHolder` が注入されていない場合は従来挙動が無変更

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** `anchorHolder` を渡さずに構築した `JobJournal`（managed/test/直接構築）
**WHEN** `persist` / `appendInterruption` を呼ぶ
**THEN** 例外も副作用も無く、anchor 追跡なし（既存テストが無変更 green）

---

## Group 4: Authorship 分離（per-node commit から journal 除外）

### TC-012: Agent code commit が journal を含まない（spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: agent the per-node commit shall not carry the pipeline journal > Scenario: agent code commit excludes the journal

---

### TC-013: Round 終端で journal sweep が1回 emit される（spec シナリオ）

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: agent the per-node commit shall not carry the pipeline journal > Scenario: round journal is swept after the coordinator commit

---

### TC-014: sequential `commitAndPush` の pathspec が pipeline-managed paths を除外する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D1

**GIVEN** `pipelineManagedPaths(slug)` が events.jsonl / state.json / usage.json を返す状態
**WHEN** sequential 経路の `commitAndPush` が実行される
**THEN** `git add` の pathspec に `:(exclude)<events.jsonl>` / `:(exclude)<state.json>` / `:(exclude)<usage.json>` が含まれる

---

### TC-015: `commitJournalArtifacts` が pipeline-managed paths のみを stage して commit する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D1

**GIVEN** pipeline-managed paths に変更がある worktree
**WHEN** `commitJournalArtifacts(cwd, branch, slug, infra)` を呼ぶ
**THEN** stage 対象が `pipelineManagedPaths(slug)` のみ、commit message が `"journal: <slug>"`、変化なしは no-op

---

### TC-016: `commitOid` が agent code commit（journal commit の前）を指す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D1 / design.md > Risks

**GIVEN** sequential 経路で agent commit→commitOid capture→journal commit の順で実行
**WHEN** `captureHeadSha` が呼ばれるタイミングを確認する
**THEN** `commitOid` は agent code commit の OID を指し、journal commit の後に再 capture されない（archive floor の changed-files 導出に journal が混入しない）

---

## Group 5: In-process anchor — authored bytes の累積

### TC-017: In-process anchor が authored bytes を disk 再読なしで追跡する（spec シナリオ）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the pipeline shall maintain an agent-unreachable, crash-surviving anchor of the journal it authored > Scenario: the in-process anchor tracks authored bytes without re-reading disk

---

### TC-018: Resume 時に on-disk を1度だけ full 読みして anchor を seed する（spec シナリオ）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: the pipeline shall maintain an agent-unreachable, crash-surviving anchor of the journal it authored > Scenario: a resumed process seeds the anchor from disk once before writing

---

## Group 6: Durable anchor — checkpoint push

### TC-019: Durable anchor が checkpoint で origin へ push される（spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the pipeline shall maintain an agent-unreachable, crash-surviving anchor of the journal it authored > Scenario: the durable anchor is pushed to origin at checkpoint

---

### TC-020: branch が null または holder 未確立のとき anchor push がスキップされる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 / design.md > D3

**GIVEN** `state.branch = null` または `journalAnchor.snapshot() = null` の `LocalRuntime`
**WHEN** `commitFinalState` を呼ぶ
**THEN** `pushEvidenceAnchor` が呼ばれない

---

### TC-021: anchor push 失敗が terminal 遷移を壊さない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 / design.md > D3

**GIVEN** `pushEvidenceAnchor` が reject する fake spawn
**WHEN** `commitFinalState` を呼ぶ
**THEN** 例外を throw せず terminal 遷移が完了する（best-effort push）

---

## Group 7: Per-node authorship 検証・復元・halt

### TC-022: Edit/Write による journal 改竄が検出→復元→halt される（T1、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-node authorship shall be verified against the in-process anchor (committed tree and on-disk) > Scenario: an Edit/Write tamper of the journal is detected, restored, and halted (T1)

---

### TC-023: Bash による journal 改竄が検出→復元→halt される（T2、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-node authorship shall be verified against the in-process anchor (committed tree and on-disk) > Scenario: a Bash tamper of the journal is detected, restored, and halted (T2)

---

### TC-024: git plumbing で commit tree に注入した journal 改竄が committed-tree 歯で検出される（T3、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-node authorship shall be verified against the in-process anchor (committed tree and on-disk) > Scenario: a git-plumbing tamper committed into the tree is detected by the committed-tree tooth (T3)

---

### TC-025: events.jsonl + state.json の協調改竄が結合 digest 不一致で検出される（T5、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-node authorship shall be verified against the in-process anchor (committed tree and on-disk) > Scenario: coordinated tamper of both files is detected (T5)

---

### TC-026: `headBeforeStep` が null のとき committed-tree 歯をスキップする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 / design.md > D4

**GIVEN** `headBeforeStep = null`（初回 node）または `headBeforeStep === HEAD`（agent commit 無し）
**WHEN** `verifyNodeJournalAuthorship` を呼ぶ
**THEN** `diffPathsBetweenCommits` を呼ばず committed-tree 歯をスキップし、on-disk 歯のみで判定する

---

### TC-027: round member（`roundOwnsGitEffects=true`）が per-node 検証をスキップする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 / design.md > D4

**GIVEN** `roundOwnsGitEffects = true` の executor 依存
**WHEN** 当該 node が実行される
**THEN** `verifyNodeJournalAuthorship` が呼ばれない

---

### TC-028: `makeJournalTamperHalt` が `awaiting-resume` halt を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 / design.md > D4

**GIVEN** tamper 検出後の `detail` 文字列と step 情報
**WHEN** `makeJournalTamperHalt(detail, stepName, slug)` を呼ぶ
**THEN** `{kind:"awaiting-resume", code:"JOURNAL_AUTHENTICITY_VIOLATION", ...}` を含む `StepHalt` を返す

---

### TC-029: `JOURNAL_AUTHENTICITY_VIOLATION` error code が `errors.ts` に存在する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 / design.md > D4

**GIVEN** `src/errors.ts`
**WHEN** `journalAuthenticityViolationError(detail)` を呼ぶ
**THEN** `code === "JOURNAL_AUTHENTICITY_VIOLATION"` を持つエラーオブジェクトが返る

---

## Group 8: Resume authenticity 検証

### TC-030: crash→resume で journal 改竄が resume load 時に検出→復元→halt される（T4、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume shall verify on-disk authenticity against the durable origin anchor before running > Scenario: a pre-verification crash tamper is caught at resume load (T4)

---

### TC-031: 意図的 `awaiting-resume` 停止からの resume が halt しない（T6 resume 面、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume shall verify on-disk authenticity against the durable origin anchor before running > Scenario: an intentional awaiting-resume checkpoint resumes without a false halt (T6)

---

### TC-032: Resume 時 `branch = null` のとき検証をスキップする（pre-branch）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D5 / D7

**GIVEN** `state.branch = null` の job
**WHEN** `verifyResumeJournalAuthenticity` を呼ぶ
**THEN** `{kind:"skip"}` を返し `readEvidenceAnchor` を呼ばない

---

### TC-033: Resume 時 origin anchor が absent のとき検証をスキップする（pre-feature / ref 不在）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D5 / D7

**GIVEN** `readEvidenceAnchor` が `{kind:"absent"}` を返す fake spawn
**WHEN** `verifyResumeJournalAuthenticity` を呼ぶ
**THEN** `{kind:"skip"}` を返す（backward-compat / pre-anchor checkpoint）

---

### TC-034: Resume 時 anchor fetch が unavailable のとき fail-closed で halt する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D5

**GIVEN** `readEvidenceAnchor` が `{kind:"unavailable"}` を返す fake spawn（offline 想定）
**WHEN** `verifyResumeJournalAuthenticity` を呼ぶ
**THEN** `{kind:"unavailable", reason:*}` を返し、呼び出し元 `ResumeCommand.prepare` が `PrepareError` で fail-closed halt する

---

## Group 9: Attach authenticity 検証

### TC-035: checkpoint の journal digest が anchor と一致しない場合は attach 不可（spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach shall verify checkpoint authenticity in addition to self-consistency > Scenario: a checkpoint whose journal does not match the anchor is not attachable

---

### TC-036: authentic checkpoint が自己整合性＋authorship 両立で attach できる（spec シナリオ）

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: attach shall verify checkpoint authenticity in addition to self-consistency > Scenario: an authentic checkpoint attaches (self-consistency plus authenticity)

---

### TC-037: attach 時 anchor が absent のとき自己整合性のみで判定する（backward-compat）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 / design.md > D6 / D7

**GIVEN** `readEvidenceAnchor` が `{kind:"absent"}` を返す fake spawn
**WHEN** `runAttachVerification` → `verifyCheckpoint` を呼ぶ
**THEN** authenticity 述語はスキップされ、既存の fold/counter/profile/identity の自己整合性テストが通れば attach 継続する

---

### TC-038: attach 時 anchor fetch が unavailable のとき fail-closed reject する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 / design.md > D6

**GIVEN** `readEvidenceAnchor` が `{kind:"unavailable"}` を返す fake spawn
**WHEN** `runAttachVerification` を呼ぶ
**THEN** `checkpointNotAttachableError`（または同等の attach error）で reject する

---

## Group 10: Fail-closed・false-positive 防止・backward-compat

### TC-039: 継続実行・意図的 resume・attach の正常系で halt が発生しない（T6、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification shall be fail-closed and shall not false-positive on legitimate pipeline writes > Scenario: continuous execution and intentional resume/attach do not halt (T6)

---

### TC-040: Sequential per-node commit が authorship 分離を固定する（T7、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: existing pipeline / commit-push / resume / attach / archive behavior shall be preserved > Scenario: authorship-separation is asserted for the sequential per-node commit (T7)

---

### TC-041: 既存テスト群が authenticity 追加を除き無変更 green（T8、spec シナリオ）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: existing pipeline / commit-push / resume / attach / archive behavior shall be preserved > Scenario: the suite stays green with only authenticity-related additions (T8)

---

## Result

```yaml
result: completed
total: 41
automated: 41
manual: 0
must: 18
should: 23
could: 0
blocked_reasons: []
```
