# finish Phase 1 の spec-merge を change folder 不在時に skip し冪等にする

## Meta

- **type**: bug-fix
- **slug**: finish-phase1-idempotency
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

### 症状
`job finish` が Phase 3 (squash merge) で transient に失敗（例: `Base branch was modified`）した後、再実行すると Phase 1 で必ず crash して merge まで到達できなくなる:

```
Phase 1: archive on feature branch ...
=== specrunner finish: escalation ===
Failed Step:    spec-merge (request.md)
Detected State: Failed to read or parse request.md: ENOENT ... changes/<slug>/request.md
```

1 回目の finish が Phase 1 で change folder を `changes/archive/<date>-<slug>/` に移動済みのため、再実行時に元 path の request.md が存在せず spec-merge が ENOENT で escalation する。PR #365 で実際に発生し、手動 merge での回避を要した（issue #366）。

### 仕様との照合（= これは bug）
`specrunner/specs/cli-finish-command/spec.md` は change folder 不在時の挙動を明記している:

> Scenario: change folder 不在の warning が出ており、Phase 1 で archive を skip → commit/push skip → Phase 3 で merge → Phase 4 で markJobArchived のみ

つまり「change folder が無ければ Phase 1 archive を skip して merge に進む」のが仕様。実際 `preflight.ts:208-211` は不在を検出して `Archive steps will be skipped` と警告も出している。**仕様が要求する skip が不完全にしか実装されていない = 仕様違反のバグ**。

### 根本原因
Phase 1 の構成ステップのうち、

- `archiveChangeFolder`（`src/core/finish/archive-change-folder.ts:34-41`）は `fs.exists(changeFolder)` を見て不在なら `{ ok: true, skipped: true }` を返す（正しい冪等 skip）
- `mergeSpecsForChange`（`src/core/finish/spec-merge.ts:541-554`）は **同等の不在チェックを持たず**、`changeFolderPath(slug)/request.md` をいきなり `fs.readFile` し、失敗を catch して `spec-merge (request.md)` escalation に変換している

`runPhase1Archive`（`src/core/finish/orchestrator.ts:261`）は spec-merge → archive → commit の順で呼ぶため、不在時に最初の spec-merge で死ぬ。preflight の検出はフラグとして Phase 1 に伝播していない。

## 要件

1. `mergeSpecsForChange` は、change folder（または request.md）が不在の場合、ENOENT を escalation に変換せず `{ ok: true, skipped: true, message: "spec-merge skipped: change folder not found" }` を返して gracefully skip する。`archiveChangeFolder` の不在 skip パターン（非空メッセージを返す）に揃える。
2. 上記により `runPhase1Archive` は change folder 不在時に spec-merge / archive / commit を全て skip し、Phase 1 を冪等にする（既に archive 済みの再実行で crash しない）。
3. 結果として「Phase 1-2 完了後に Phase 3 が transient 失敗 → finish 再実行」で、Phase 1 が no-op skip され Phase 3 merge から復旧できる。
4. request.md が「存在するが parse 不能」な場合は従来どおり escalation する（不在 skip と parse エラーを区別すること。正常な change を握り潰さない）。

## スコープ外

- Phase 3 merge の transient retry（`Base branch was modified` で merge をリトライする）は別件（spec 上は「merge 失敗 → escalation + 手動 merge」で仕様通り。issue #366 の spec-change 部分として残す）
- spec の編集（本件は既存 spec への準拠であり baseline / delta spec を変更しない）
- `mergeSpecsForChange` の merge ロジック本体（parse / classify / merge）の変更

## 受け入れ基準

- [ ] change folder 不在時に `mergeSpecsForChange` が escalation せず `skipped: true` を返す（unit test）
- [ ] Phase 1-2 完了済みの状態で `job finish` を再実行すると、Phase 1 が skip され Phase 3 merge に進む（archive 済みからの resume）
- [ ] request.md が「存在するが parse 不能」のケースは従来どおり escalation する（regression なし、test で区別を担保）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

なし（既存 spec への準拠バグ修正であり、新たな設計判断を含まない。`archiveChangeFolder` の既存 skip パターンに合わせるのみ）。
