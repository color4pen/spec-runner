# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | 全チェックボックス [x] 完了 |
| design.md | ✅ | D1〜D8 全設計判断が実装に対応 |
| spec.md | ✅ | 全 Requirement / Scenario が実装・テストで固定されている |
| request.md | ✅ | T1〜T8 の受け入れ基準すべて充足、typecheck && test green |

---

## 詳細

### tasks.md — チェックボックス完了確認

T-01〜T-09 の全チェックボックスが `[x]` であることを確認した。

---

### 設計判断（D1〜D8）の実装適合性

#### D1: authorship 分離（sequential 除外 + pipeline journal commit + round sweep）

`commitAndPush`（`commit-push.ts:48-56`）が `pipelineManagedPaths(slug)` の `:exclude` pathspec で journal を除外する。新設の `commitJournalArtifacts` が journal のみを別 commit する。`parallel-review-round.ts:341-349` に round 終端の journal sweep が実装されている。executor.ts の ordering（finalizeStepArtifacts → captureHeadSha → verifyNodeJournalAuthorship → commitJournalArtifacts）が設計と一致する。**✅**

#### D2: in-process anchor（authored bytes 累積・read-back なし）

`JournalAnchorHolder`（`journal-anchor.ts`）が events/state を in-memory 蓄積する。`job-journal.ts` の `_appendEventLine` / `_writeStateJson` private helper に holder 更新を集約し、fresh / delta / fast / interruption / lineage 全 mutation 経路で漏れなく更新される。resume seed は delta 書込前に1度だけ `_seedHolderFromDisk` で実施し「書込後再読しない」原則を守る。**✅**

#### D3: durable anchor（`refs/specrunner/evidence/<branch>` git blob ref）

`evidence-anchor-ref.ts` が `hash-object → update-ref → push` を best-effort で実装。`local.ts:700-706` で `commitFinalState` 後（両 terminal）に `pushEvidenceAnchor` を呼ぶ。本番 `factory.ts:39` が `new JournalAnchorHolder()` を常時注入している。**✅**

#### D4: per-node authorship 検証（committed-tree 歯 + on-disk 歯）

`verifyNodeJournalAuthorship`（`local.ts:871-933`）が2歯を実装している。committed-tree 歯は diff unavailable も fail-closed で tamper 扱いにする。tamper 時は `restoreJournalToAnchor` で in-process anchor bytes を atomic write で書き戻してから halt し、`commitJournalArtifacts` を呼ばない（tampered bytes を commit させない）。**✅**

#### D5: resume authenticity（baseline = durable origin anchor）

`verifyResumeJournalAuthenticity`（`verify-journal-authenticity.ts`）で branch 無し → skip、absent → skip、unavailable → fail-closed、present → on-disk digest 比較。tamper 時は `restoreResumeJournal` で `git show origin/<branch>:<path>` から復元し、origin anchor との一致確認後に書き戻す二重確認を行う。`resume.ts` の挿入点は stale recovery 書込前（`running` 遷移 persist 前）。**✅**

#### D6: attach authenticity（`verifyCheckpoint` に述語追加）

`runAttachVerification`（`orchestrator.ts:88-98`）が `readEvidenceAnchor` を呼び、present → `anchorDigest` を `verifyCheckpoint` へ渡す、absent → undefined（backward-compat）、unavailable → fail-closed reject。`verifyCheckpoint`（`verify-checkpoint.ts:287-297`）が self-consistency 後に authenticity 述語を追加している。**✅**

#### D7: absent-anchor 規則の統一

`evaluateAnchorPresence`（`journal-anchor.ts:125-147`）が4規則を pure 関数として実装。per-node / resume / attach の各経路で共有されている。**✅**

#### D8: per-node journal push bytes 範囲と crash-recovery 窓（accepted posture）

executor の ordering により `commitJournalArtifacts` は `commitSuccess`（success-era bytes）の前に呼ばれ、begin persist までの bytes のみを捕える。crash-recovery 窓の halt（T4）と正常系 false-positive（T6）が明示的に区別されている。**✅**

---

### Spec Requirements / Scenarios の網羅性

| Requirement | 対応テスト |
|-------------|-----------|
| agent per-node commit shall not carry journal | TC-040 / `commit-push-authorship-separation.test.ts` |
| pipeline shall maintain agent-unreachable anchor | `journal-anchor.test.ts` / `evidence-anchor-ref.test.ts` / `evidence-anchor-checkpoint.test.ts` |
| per-node authorship verification (T1/T2/T3/T5) | TC-022〜TC-025 (`per-node-authorship-verification.test.ts`) |
| resume authenticity (T4/T6 resume) | TC-030, TC-031 (`resume-authenticity.test.ts`) |
| attach authenticity | TC-035, TC-036 (`attach-authenticity.test.ts`) |
| fail-closed / no false-positive (T6) | TC-039 (`authorship-backward-compat.test.ts`) |
| backward-compat (T8) | TC-041 + `typecheck && test` green |

---

### 受け入れ基準（T1〜T8）

| 基準 | テスト | 確認 |
|------|--------|------|
| T1 Edit/Write 改竄 → 検出 → 復元 → halt | TC-022（破壊確認コメント明示） | ✅ |
| T2 Bash 改竄 → 検出 → 復元 → halt | TC-023 | ✅ |
| T3 git plumbing → committed-tree 歯で halt | TC-024（破壊確認コメント明示） | ✅ |
| T4 crash→resume → origin anchor で検出 → 復元 → halt | TC-030 | ✅ |
| T5 協調改竄 → 結合 digest 不一致で halt | TC-025 | ✅ |
| T6 false-positive 無し（継続実行 / intentional-resume / attach） | TC-031, TC-036, TC-039 | ✅ |
| T7 authorship 分離固定 | TC-040 | ✅ |
| T8 既存テスト群無変更 green | TC-041 / `typecheck && test` green（547 files、7454 tests） | ✅ |

---

### 機械検証

- `bun run typecheck`: green（tsc --noEmit エラーなし）
- `bun run test`: green（547 test files、7454 tests）

---

### 観察事項（非ブロッカー）

**O1: `journalAnchor` の optional 性**
`LocalRuntime.journalAnchor` は constructor opts で optional（既存テストの backward-compat のため）。本番の `createRuntime` は常時 `new JournalAnchorHolder()` を注入しており、no-op 動作の意図が構造的に明示されている。

**O2: `isRefNotFoundError` のヒューリスティック**
stderr パターンマッチングで absent / unavailable を判別する。git 実装差異で false absent になるエッジケースが存在するが、fail-closed 側（unavailable → halt）に倒れることが多く、安全性への影響は最小。

**O3: committed-tree 歯の `headAfterStep` 再取得**
`verifyNodeJournalAuthorship` 内で `captureHeadSha` を再度呼ぶため executor の `commitOid` 取得と2回 HEAD を参照する。agent は origin push 権を持たない前提下では問題ない。
