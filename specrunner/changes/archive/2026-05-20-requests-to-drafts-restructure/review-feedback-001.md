# Review Feedback: requests-to-drafts-restructure — iter 1

- **verdict**: needs-fix
- **date**: 2026-05-20
- **reviewer**: code-review agent

---

## Summary

実装は全体的に設計意図を正確に反映しており、build / typecheck / test (226 files, 2451 tests) が green。コアロジック（drafts/ 移行、move semantics、archive 一本化）はすべて正しく実装されている。1 件の `must` 欠落（ADR なし）と 1 件の `should` 指摘（doctor 早期 return）があり、前者で needs-fix とする。

---

## Findings

### F1 — [must] ADR が存在しない

**対象**: `specrunner/adr/` ディレクトリ  
**重大度**: must

request の meta に `adr: true` が設定されており、受け入れ基準に以下の 4 項目の記録が明示されている:

1. `drafts/` rename の採用
2. archive 経路 1 本化
3. 起票 untracked 残骸バグの構造解（run 開始時の move 化）
4. 既存 `requests/merged/` の read-only 維持判断

TC-40（must）も「ADR ファイルが `specrunner/changes/requests-to-drafts-restructure/` または `specrunner/adr/` 配下に存在する」ことを要求している。

`specrunner/adr/` を確認したが、`2026-05-20-*` 以降にこの変更に対応する ADR が存在しない。`enabled: []` のため adr-gen step が実行されなかった結果と思われるが、受け入れ基準上は手動でも記録が必要。

**修正**: `specrunner/adr/2026-05-20-requests-to-drafts-restructure.md`（または相当の日付）を作成し、上記 4 設計判断を記録すること。

---

### F2 — [should] `workflow-structure.ts` の早期 return でミッシング drafts 警告がマスクされる

**対象**: `src/core/doctor/checks/repo/workflow-structure.ts:31-37`  
**重大度**: should

現行の実装順序:

```typescript
// 1. warnings に欠損 dir を積む
if (!existsSync(draftsDirPath)) warnings.push("drafts");
if (!existsSync(changesDirPath)) warnings.push("changes");

// 2. requests/active/ が存在したら即 return（warnings は見ない）
if (existsSync(activeDirPath)) {
  return { status: "warn", message: "deprecated..." };  // ← early return
}

// 3. warnings があれば返す（requests/active/ が存在した場合ここに来ない）
if (warnings.length > 0) { ... }
```

`requests/active/` が存在 かつ `drafts/` が存在しない という移行途中の状態では、"deprecated" 警告のみ返り、`drafts/` 不在の警告は出力されない。ユーザーは「deprecated を直せば OK」と思い、`drafts/` ディレクトリ作成を忘れる可能性がある。

**修正案**: deprecation 判定を `warnings` に追加する形に変えるか、すべての warnings を集約してから return する（例: deprecation を `warnings.unshift(...)` してから末尾 return に統一）。テストでもこの複合ケースをカバーする。

---

## Passing Items

| TC | 内容 | 結果 |
|---|---|---|
| TC-01/02 | `draftsDir()` / `draftPath()` の戻り値 | ✅ |
| TC-03–07 | `store.ts` の 3 経路 collision 検出 | ✅ |
| TC-08–10 | request コマンド群の drafts/ 移行 | ✅ |
| TC-11 | request show の legacy fallback + deprecation warn | ✅ |
| TC-13 | CANONICAL_PATTERN の drafts/ 対応 | ✅ |
| TC-15/16 | local runtime の draft move / worktree に drafts コピーなし | ✅ |
| TC-18 | managed runtime の draft 削除 | ✅ |
| TC-19/20 | move-requests-dir.ts 廃止・orchestrator から除去 | ✅ |
| TC-22 | 引数なし finish → exit 2 エラー | ✅ |
| TC-24/25 | request-patterns が changes/archive/ から収集 | ✅ |
| TC-26/27/28 | doctor の drafts/ check + active/ deprecation warn | ✅ (F2 注記あり) |
| TC-29–31 | delta spec 3 件存在 | ✅ |
| TC-36/37 | typecheck + test green（2451 tests） | ✅ |
| TC-38/39 | store.write/list の drafts/ 動作 | ✅ |

---

## 備考

- **draft-move.test.ts の stub**: TC-DRAFT-001/002 は `simulateSetupWorkspaceDraftMove` という内部スタブを経由しており、`LocalRuntime.setupWorkspace` を直接呼んでいない。リグレッション意図は正しいが、local.ts の `fs.rm` が誤って削除された場合にこのテストは検知できない。リスクは低いが将来のリファクタで注意。
- **managed runtime の `git add` 失敗は non-fatal**: `managed.ts` は `git add` 失敗を non-fatal (warning のみ) にしているが、local.ts は fatal (throw + cleanup) にしている。設計上の非対称性は許容範囲内だが意図的差異として記録する。
