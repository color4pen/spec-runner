# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 現状コードの前提（request.md）の突合

**`recopyDraftToChangeFolder`（copy-artifacts.ts:146-173）**
- 関数本体を直接 Read して確認。directory 形式のみ（`draftPath(slug)` = `specrunner/drafts/<slug>/request.md`）を対象とすること、`fs.access` 失敗で no-op になること、`git add` を呼ぶことを確認 ✓
- 4 箇所の呼び出しを grep で確認: wm.ts:93（resume-existing）/ wm.ts:119（resume-recreated / without-recorded-worktree）/ local.ts:448（`if (!isRunPath)`）/ managed.ts:167（`if (!branchName)`）— request.md 記載と一致 ✓

**archive の draft 削除ループ（orchestrator.ts:263-279）**
- コードを直接 Read して確認。flat（`draftsDir() + slug + ".md"`）/ directory（`draftsDir() + slug`）の両形式対応、`git ls-files` で tracked 判定し警告のみ、untracked なら `fs.rm(recursive, force)` — request.md 記載と一致 ✓

**job start の実体化ブロック（3 箇所）**
- `workspace-materializer.ts:179-243`（new-run arm）: fs.cp → git add → copyDraftUsage → copyRules → updateJobState → commit → rev-parse → appendSynthesizedCommit の順序を確認 ✓
- `local.ts:391-444`（`if (isRunPath && opts?.requestFilePath)` ブロック）: 同様の順序を確認 ✓
- `managed.ts:203-270`（`if (opts?.requestFilePath)` ブロック）: git add → commit → rev-parse → appendSynthesizedCommit → **git push**（commit 後の push）の順序を確認 ✓

**commit 失敗時の制御フロー**
- wm.ts:219-223: commit exitCode !== 0 → `manager.remove` + `manager.prune` → throw。`consumeDraft` 呼び出しより前に throw されることを確認 ✓
- local.ts:425-426: commit exitCode !== 0 → throw ✓
- managed.ts:241-243: commit exitCode !== 0 → throw ✓
- managed.ts:266-270: push（commit 後）exitCode !== 0 → throw ✓

**cancel --restore-draft（runner.ts:135-165）**
- 復元元: `worktreePath + requestMdPath(slug)` = change-folder request.md ✓
- draft 既存チェック（`draftPath(slug)`）: 存在すれば "skipping restore" で no-op ✓
- 復元先: `draftPath(slug)` = directory 形式 `specrunner/drafts/<slug>/request.md` ✓

**resolveRequestPath（resolve-request-path.ts:25-52）**
- `/specrunner/drafts/` を含む path のみ fallback 処理 → draft 削除済み state を想定済みコメントと一致 ✓
- draft 削除後の state.request.path は change-folder を指す（start 時に updateJobState で更新済み）→ fallback 処理は不要となり as-is で返る ✓

**inbox 経路（run-inbox.ts:397-400）**
- `writeDraft(repoRoot, slug, issueBody)` → `draftPath = 'specrunner/drafts/${slug}/request.md'` → `runRunCore(draftPath, ...)` の経路を確認 ✓
- directory 形式の draft を生成してから start する経路であることを確認 ✓

**attach-from-checkpoint arm（wm.ts:123-150）**
- recopy しないことを確認（コメント「do NOT seed, updateJobState, or recopy」）✓

**`draftPath` / `draftsDir` の export 状態（paths.ts）**
- `draftPath(slug)` = `specrunner/drafts/<slug>/request.md` として export 済み ✓
- `draftsDir()` = `"specrunner/drafts"` として export 済み ✓
- `draftPath` は cancel/runner.ts:154 でも使用中 → recopy 削除後も paths.ts から外せない ✓

**TC-RECOPY-001~005 の存在確認**
- `tests/unit/util/copy-artifacts.test.ts:219-357` に 5 本存在 ✓
- TC-SYM-* は同ファイル:212-216 にあり削除対象外 ✓

### Design 整合性の確認

**D1: consumeDraft 挿入点（commit 成立後）**
- wm.ts new-run: bootstrap OID 記録（appendSynthesizedCommit）は lines 238-242。その後（line 243 の `}` 前）が挿入点 ✓
- local.ts: bootstrapOid 記録は lines 438-443。その後（line 444 の `}` 前）が挿入点 ✓
- managed.ts: commit push 成功（lines 260-270）後。`if (opts?.requestFilePath)` ブロック末尾（line 271 の `}` 前）が挿入点 ✓
- 全 3 経路で commit / push 失敗時は throw が先行し `consumeDraft` に到達しない構造を確認 ✓

**D2: slug から canonical path を導出**
- `consumeDraft` が `requestFilePath` を参照せず slug 経由でパスを組み立てる設計 → 非 canonical パスで起動した場合に canonical draft が不在 → no-op となる ✓

**D3: archive backstop 変更なし**
- orchestrator.ts のループは「変更しない」要件、code で確認 ✓
- ponytail: コメントで重複明示・統合トリガ（3 番目の消費者）を記録する設計 ✓

**D4: copy-artifacts.ts への配置**
- `recopyDraftToChangeFolder` と同ファイルに置く方針 → `draftPath`/`draftsDir`/`SpawnFn`/`stderrWrite`/`fs` が揃っていることを確認 ✓

### spec.md の規約適合確認

- 全 Requirement に `SHALL` / `MUST NOT` の normative keyword が含まれることを確認 ✓
- 全 Requirement に Given/When/Then Scenario が 1 本以上あることを確認 ✓
- Layer-1 振る舞いのみ記述（型 / FSM 強制内容の混入なし）を確認 ✓

### 受け入れ基準 → test-cases.md のトレーサビリティ

| 受け入れ基準 | 対応 TC |
|--|--|
| start 成功後 flat/directory draft 削除 | TC-001, TC-002 |
| start 失敗で draft 残存 | TC-003 |
| git tracked draft → 警告のみ | TC-004 |
| 非 canonical パス → ファイル無消費 | TC-005 |
| apply-canon 後 resume で巻き戻らない | TC-006 |
| cancel --restore-draft が draft を復元 | TC-007 |
| archive が no-op（消費済み） | TC-008 |
| recopyDraftToChangeFolder が src/ に 0 件 | TC-012 |
| typecheck && test が green | TC-013 |

全 8 基準が TC にトレース可能 ✓

### 既存テスト harness の再利用性

- `bootstrap-egress-ledger-wm.test.ts` の `MaterializerHost` stub 構造を確認。
  `manager.create` / `remove` / `prune` / `spawnFn`（rev-parse 専用返値モック）/ `updateJobState` / `writeLivenessSidecar` が stub 化されており、T-04 の "成功時消費" / "commit 前失敗 → draft 残存" テストに流用可能 ✓

### cancel --restore-draft の既存テスト確認

- `grep -r restore-draft tests/` → 0 件。T-04 が「既存があれば確認、無ければ追加」と記載しており、追加が必要 ✓（欠落ではなく設計通り）

## 検証できなかった項目

なし。

## Findings 詳細

指摘なし。

以下は判定に影響しない実装上の補足注記（observations）。

### OBS-1: TC-009「fs.rm は呼ばれない」の検証方式

TC-009 は draft 不在時の no-op を検証するが、`consumeDraft` は `node:fs/promises` の `fs.rm` を直接呼ぶため spy 化が必要になる場合がある。代替として "draft が存在しない → `git ls-files`（`spawnFn`）が呼ばれない" を主アサーションにすれば `spawnFn` mock だけで完結する。これは spec の欠陥ではなく実装時の選択。

### OBS-2: `draftPath` import の条件付き削除表現

T-01「`draftPath` は recopy 削除で不要になれば外す」は条件付きに見えるが、`copy-artifacts.ts` における `draftPath` の唯一の呼び出し元は `recopyDraftToChangeFolder`（削除対象）であるため、削除後は必ず不要になる。実装者はこれを確実に除去することが期待される。

### OBS-3: `fs.exists()` の Bun 拡張

orchestrator.ts と同様に `import * as fs from "node:fs/promises"` を使いつつ `fs.exists()` を呼ぶ実装は Bun 独自拡張に依存する。プロジェクト全体で同一パターンを採用済みであり問題はないが、Node.js 互換を考慮する場合は `fs.access()` + try-catch への差し替えも選択肢。
