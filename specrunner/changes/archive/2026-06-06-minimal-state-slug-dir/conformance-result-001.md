# Conformance Result — minimal-state-slug-dir — Iteration 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: needs-fix

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ❌ | T-01〜T-19 すべて `[ ]` のまま。完了した T-01〜T-05 の更新が必要 |
| design.md | ✅ (段1) | D1〜D4 は実装と整合。D5〜D9（段2）は未着手だが設計判断は正確に反映されている |
| spec.md | ❌ | 段1 要件はすべて充足。段2 要件（`changes/<slug>/` 配置・machine-local 分離・cost per-step・中断事由・active 列挙・exit-guard 等）は未充足 |
| request.md | ❌ | 段1 受け入れ基準 3/3 充足。段2 受け入れ基準 0/13 充足。`bun run typecheck && bun run test` は green |

---

## 詳細

### 実装スコープ（観測事実）

git diff の変更ファイル（27 files, +2864/-164）から判断:

- `src/store/event-journal.ts`（新規）— fold / appendEventRecord / record 型定義（T-01）
- `src/store/job-state-store.ts`（更新）— 分割レイアウト読み書き・crash recovery（T-02）
- `src/util/xdg.ts`（更新）— `getJobDir` / `getJobStateJsonPath` / `getJobEventsPath` 追加（T-02）
- `src/state/schema.ts`（更新）— `appendHistoryEntry` の永続 truncation 撤廃（T-05）
- `tests/store/event-journal.test.ts`（新規）— TC-003/004/005/006/028/030（T-03/04）
- 既存テスト群（更新）— 分割レイアウト整合（T-19）

**段1（T-01〜T-05）は実装済み。段2（T-06〜T-18）は未実装。**

### tasks.md

0/19 のチェックボックスが `[x]`。段1 完了分（T-01〜T-05）の更新が必要。

### design.md — 段1 設計判断の実装整合

| 決定 | 実装状況 |
|------|---------|
| D2: journal レコードスキーマ・fold | `event-journal.ts` で正確に実装。1 行 1 record、partial 末尾無視、attempt を出現順で付番 |
| D3: journal append と cursor overwrite の物理分離 | `appendEventRecord`（fs.appendFile のみ）と `atomicWriteJson` が別ファイル操作。delta-append と冪等リカバリ（load 時 fold count > stored counter）も実装済み |
| D4: history 永続 truncation 撤廃 | `appendHistoryEntry` から切り詰め削除済み。`MAX_HISTORY_SIZE` は表示用定数として残存（OK） |

### spec.md — 段1 要件の充足確認

| 要件 | 判定 | 根拠 |
|------|------|------|
| 単一 JSON を分割（段1） | ✅ | `create` で `events.jsonl` + `state.json` が `.specrunner/jobs/<jobId>/` に生成される |
| 外部契約不変（create/load/persist 等） | ✅ | 呼び出し側変更なし |
| event 追記と cursor rewrite の物理分離 | ✅ | fs.appendFile vs atomicWriteJson で別ファイル操作 |
| fold が partial 末尾行を無視し全復元 | ✅ | TC-004 でカバー |
| fold 結果が routing 同値（verdict/toolResult） | ✅ | TC-005/006 で `fixableCount` / fixer-empty 検出を確認 |
| `attempt` が出現順から 1-origin で導出 | ✅ | TC-028 でカバー |
| crash-safety（cursor crash で event 消失なし） | ✅ | TC-003/030 でカバー |

段2 要件（`changes/<slug>/` 配置、machine-local 分離、cost per-step、中断 event、active 列挙、exit-guard、再 run 非破壊、pullRequest materialize 等）はすべて未充足。

### request.md — 受け入れ基準の充足

| 受け入れ基準 | 充足 |
|-------------|------|
| 段1: 単一 JSON 分割・挙動不変 | ✅ |
| 段1: crash で event 消失なし（回帰テスト） | ✅ |
| 段1: partial 末尾行を無視・全復元 | ✅ |
| fold で `outcome.verdict` / `toolResult` が従来同値 | ✅ |
| `bun run typecheck && bun run test` が green | ✅ |
| 段2: journal/cursor/usage が `changes/<slug>/` に作られ step commit に同梱 | ❌ |
| 段2: 同一 branch re-checkout から resume 成立 | ❌ |
| cost が step ごとに append、finish 一括派生廃止、`modelUsage` 除去 | ❌ |
| `worktreePath`/`pid`/`session` が branch state になく resume 成立 | ❌ |
| 中断事由が event 1 件に集約 | ❌ |
| archive に `state.json`/`events.jsonl`/`usage.json` 含まれる | ❌ |
| active 列挙が worktree ベース+managed marker で成立 | ❌ |
| worktree 存在 ⟺ 非終端不変量、exit-guard が branch state 更新 | ❌ |
| 再 run が旧 branch 破壊しない、複数 attempt が `job ls` で区別表示 | ❌ |
| 旧 full state から移行 resume・非破壊 | ❌ |
| `pullRequest` が state.json に保持、読み手が動作 | ❌ |
| pipeline 実行・画面出力・PR 生成が不変 | ✅ |

---

## 修正要件

1. **tasks.md**: 完了した T-01〜T-05 のチェックボックスを `[x]` に更新する
2. **段2（T-06〜T-18）実装**: 残る受け入れ基準を充足させる
3. 全タスク完了後に再 conformance を実施する

> 段1 の実装品質は高い。fold の partial-tail 処理、delta-append の冪等リカバリ（D3）、テストカバレッジ（TC-003/004/005/006/028/030）はいずれも設計判断に忠実。段1 として正確に実装されており、段2 実装のベースとして問題ない。
