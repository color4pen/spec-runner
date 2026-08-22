# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだ spec ファイル

1. **request.md** — 背景・実装範囲・非目標・受け入れ条件を確認
2. **design.md** — D1〜D8 の設計判断、リスク・トレードオフ、オープンクエスチョンを確認
3. **spec.md** — 6 Requirements × 複数 Scenario を通読し、SHALL/MUST/MUST NOT の記述を精査
4. **tasks.md** — T-01〜T-08 の acceptance criteria と実装手順を確認
5. **test-cases.md** — TC-001〜TC-036 の Category/Priority/Source を確認し Summary 統計を検算

### 確認した既存ソースファイル

| ファイル | 確認ポイント |
|---|---|
| `src/core/runtime/local.ts:752` | `commitFinalState` の現状実装（`slugStoreOpts` / `persistBeforePush` / push 失敗後の挙動） |
| `src/core/step/commit-push.ts:770` | `commitFinalState` push フロー・egress check・`stderrWrite` warn パターン |
| `src/core/attach/checkpoint-policy.ts` | `attachResumePolicy` / `attachArchivePolicy` / `attachQuiescentPolicy` の verify ロジック |
| `src/core/attach/verify-checkpoint.ts` | counter reversal 検査・policy 注入インターフェース |
| `src/core/attach/orchestrator.ts` | `runAttachVerification` の fetch → rev-parse → read → verify フロー |
| `src/store/event-journal.ts` | `EventRecord` union・`FoldResult`・`fold()` の dispatch・`findingRecency?` optional パターン |
| `src/store/job-journal.ts` | `appendLineage` / `appendOperatorEvent` / `appendFindingRecency` パターン（journal-only record の先例） |
| `src/store/job-state-store.ts` | `appendLineage` / `appendOperatorEvent` delegating to `JobJournal` のパターン |
| `src/git/checkpoint-ref.ts` | `readCheckpointFromRef` が tree から state.json / events.jsonl / treeFiles を読む仕組み |
| `src/core/pipeline/round-git-scope.ts` | `pipelineManagedPaths(slug)` の定義（管理パス = change folder の真部分集合） |
| `src/util/paths.ts` | `changeFolderPath` / `slugEventsPath` / `localSidecarDir` の実装 |
| `src/util/spawn.ts` | `SpawnFn` / `SpawnOptions` の型（`env` overlay のサポート確認） |
| `src/logger/stdout.ts` | `maskSensitive` の `MASK_PATTERNS`（GitHub token / Anthropic key パターン） |
| `src/core/step/__tests__/commit-push-egress-invariant.test.ts` | `makePipelineSpawnFnFromSequence` パターンと TC-025 / TC-026 の不変テスト構造 |

### request → design → spec → tasks → test-cases の整合確認

**request → design**

- `管理パスのみの checkpoint commit を積み直し` (request) → change folder 全体の overlay (design D2)。
  design.md が明示的に「request の字面からの逸脱」として Trade-off 節に記録し、理由（`attachResumePolicy` の `reads()` 入力が管理パスのみでは揃わないケースが通常発生する）を詳述。受け入れ条件 2（attach 成立）を優先した合理的判断。
- `1 retry` → design の `push ×2`（1 retry）と一致。
- `journal event として記録` → D5（`checkpoint-restack` journal-only record）と一致。
- `通常経路は不変` → D1（double push failure 後段のみ restack）と一致。

**design → spec**

- D1 → Spec Req 7「push が成功する通常経路の挙動は変更しない」と一致。
- D2 → Spec Req 2「`specrunner/changes/<slug>/` 配下だけをローカル checkpoint commit の内容へ差し替え」と一致。
- D4 → Spec Req 2 Scenario「change folder 外の差分が検出された場合は push しない」と一致（containment 検査）。
- D5 → Spec Req 3（journal event）と一致。
- D6 → Spec Req 5「ローカル branch を publish 済み commit の子孫にする」と一致。
- D8 → Spec Req 1 Scenario「publish 済み tip が存在しない branch では積み直しをしない」と一致。

**spec → tasks**

- Spec Req 1–7 が T-01〜T-07 に網羅的にマップされていることを確認。
- T-04 が「egress 失敗経路では restack を呼ばない (D1)」を acceptance criteria に明記していることを確認（TC-033 との整合）。

**tasks → test-cases（summary 検算）**

- 総数 36: unit 27 + integration 6 + gate 3 = 36 ✓
- Automated (unit + integration): 33 ✓
- must 32, should 4, could 0 ✓（TC-026/029/030/031 が should）

### セキュリティ確認（OWASP Top 10 該当個所）

1. **情報漏洩（A02）**: `reason` フィールド（push 失敗 stderr）が checkpoint の events.jsonl に published される → `maskSensitive` で伏字化（D5）。`MASK_PATTERNS` が GitHub token（`gh[oprsu]_`）/ Anthropic key（`sk-ant-`）を網羅していることを `src/logger/stdout.ts` で確認。
2. **containment 検査（A01 境界）**: `git diff --name-only <remoteTip> <restackedOid>` で change folder 外パスを検出し fail-closed で push を止める（D4）。既存 egress backstop（`verifyEgressLedger`）が restack commit を対象としない理由（`HEAD` からの `rev-list` のみ）を設計が正確に説明しており、専用 containment 検査の必要性が裏付けられている。
3. **コマンドインジェクション**: `spawnFn` は引数配列渡しでシェル文字列展開を通さない。slug / branch は既存 job state 由来で事前検証済み。リスクなし。
4. **git object store 汚染**: temp index を `GIT_INDEX_FILE` 環境変数でワークツリー / 既存インデックスから分離し、restack commit を plumbing (`commit-tree`) で作成。ワークツリー変更なし。

### graft ロジックの整合確認（D6）

restack push 後:
- `origin/<branch>` = R (restack commit, parent = A, tree = A + change folder)
- local branch = A → B (work commit) → C (checkpoint)

graft 後:
- local branch = A → B → C → M (merge commit, tree = C's tree, parents = [C, R])
- `refs/remotes/origin/<branch>` = R（手順 10 の `update-ref` で確定）

次 step の push 時:
- push range = `git rev-list HEAD --not refs/remotes/origin/<branch>` = [B, C, M, D]
- R は M の第 2 parent なので M は R の子孫 → fast-forward OK
- [B, C, M, D] は全て synthesizedCommits に存在 → egress check 通過

D6 の rationale（graft なしでは non-fast-forward → `pushFailedError` throw → pipeline 崩壊）が正確であることを確認。

---

## 検証できなかった項目

- **egress backstop `verifyEgressLedger` の内部ロジック（全体）**: T-08 が「既存テスト無変更で green」を要求するため、restack commit と graft merge OID の両方が synthesizedCommits 台帳にある場合に egress check を通過するか、実コードでのシミュレーションによる確認は行っていない。ただし graft の分析（上記）から構造的に通過することを確認している。
- **`git update-index --add --cacheinfo <mode>,<oid>,<path>` の正確な引数形式**: 実環境での git バージョン互換性（comma-separated 形式が旧 git で動作するか）は未確認。実装時に注意が必要。

---

## Findings 詳細

### Finding 1（Medium）: TC-027 の実装先が tasks.md で未指定 — e2e テストから漏れるリスク

**内容**

TC-027「restack/graft OID が synthesizedCommits 台帳に追記される」は `integration` カテゴリで T-05 Acceptance Criteria を Source に持つが、T-05 はコード実装タスクであり **テストファイルを作成しない**。e2e テストタスクである T-07 の実装 TC 一覧（受け入れ条件 1/1補/2、journal、graft、受け入れ条件 3）にも TC-027 は明示されていない。

このため `bun run test` が green でも TC-027 が実際には試されない状況が生まれうる。`synthesizedCommits` に restack OID と graft OID の両方が含まれないと、以後の step の egress check（`verifyEgressLedger`）が pass するかどうかが未保証になる。

**修正案**

tasks.md T-07 の「TC（graft）」節に以下を追記:
> `git show origin/<branch>:specrunner/changes/<slug>/state.json` を parse し、`synthesizedCommits` に restackedOid と graft merge OID の両方が含まれることを assert する（TC-027）

または `tests/halt-checkpoint-restack-e2e.test.ts` の graft TC ブロックに inline で追加する。

---

### Finding 2（Low）: spec.md の `checkpoint-restack` record 定義に `reason` フィールドが未記載

**内容**

spec.md の Requirement「積み直しの発生を journal event として publish される checkpoint に記録する」は record の内容として「親 commit OID、local tip OID、OID 列」を SHALL で要求しているが、`reason` フィールド（push 失敗 stderr の masked/truncated 文字列）が spec 層で言及されていない。`reason` は design D5 と tasks.md T-01 には含まれており実装には反映されるが、spec 層でのみ仕様が不完全である。

`reason` フィールドは checkpoint tree に publish され、`maskSensitive` の適用が必須のセキュリティ要件を持つため、spec 層での明示がないと実装者がこの要件に気づかないリスクがある。

**修正案**

spec.md Requirement 3（"積み直しの発生を journal event として publish される checkpoint に記録する"）の SHALL 文に `reason`（push 失敗情報。センシティブ情報は伏字化して截断）を追加する。

---

### Finding 3（Low）: TC-029（maskSensitive 適用検証）が "should" 優先度 — セキュリティ要件の強制が弱い

**内容**

TC-029「reason フィールドに maskSensitive が適用されセンシティブ文字列が伏字化される」は Priority: should で設定されている。しかし `reason` フィールドは published な git tree（events.jsonl）に含まれ、リポジトリへの read access を持つ全員に公開される。もし実装時に `maskSensitive` 呼び出しが漏れても、must TC が全て green なら gate を通過してしまう。

`maskSensitive` の `MASK_PATTERNS` は GitHub token（`gho_` / `ghs_` 等）や Anthropic API key（`sk-ant-`）をカバーしているが、適用し忘れによる情報漏洩リスクをテストで担保することが望ましい。

**修正案**

TC-029 の Priority を `must` に昇格させる。あるいは TC-029 を TC-017（no-remote-tip 早期 skip）の前段検証として `recordRestack` callback に渡される `reason` の値を assert するテストに統合する。

---

### Finding 4（Low）: `no-branch` skip 理由の定義が tasks.md に存在しない

**内容**

tasks.md T-02 の `RestackOutcome` 型定義で `reason: "no-branch" | "no-remote-tip" | ...` が列挙されているが、「どういう条件で `no-branch` を返すか」を説明するステップが T-02 の実装手順に存在しない。design D8 は `no-remote-tip` のみを説明している。

`branch` パラメータが空文字列（`state.branch ?? ""` が falsy）の場合に `no-branch` を返すことが意図と推測されるが、仕様が曖昧なまま実装されると dead code になるか、`no-remote-tip` と重複して扱われる可能性がある。いずれの場合も throw しない動作に変わりはないため、実害は限定的。

**修正案**

tasks.md T-02 に「`branch` が空文字列の場合は fetch を試みず `skipped: no-branch` を返す」など、`no-branch` のトリガー条件を明記する。

---

### 観察事項（findings に分類しないが記録する）

- **D2 の request 字面からの逸脱**: 管理パスのみの overlay では `attachResumePolicy` の `reads()` 入力チェックを通過できないケースが通常発生する、という分析は正確。design D2 は合理的な判断であり spec に正しく反映されている。
- **D6 graft の完全性**: restack push 後に graft しない場合、次 step の push が non-fast-forward になり `pushFailedError` を throw するという分析は正確。graft は「これ以上悪化させない」要件を構造的に保証している。
- **`findingRecency?` optional パターンの踏襲**: T-01 が `checkpointRestacks?` を optional にする設計は、既存の `findingRecency?` と同じパターンで、既存 `FoldResult` literal を変更せずに済む設計として適切。
- **TC-013「push 成功時に restack 系 git 操作が一切発生しない」**: D1 の構造（double push failure の後段にのみ restack を置く）によって、この invariant がコード分岐構造として保証される点は設計上の強み。
