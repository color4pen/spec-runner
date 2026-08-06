# Cross-Boundary-Invariants Review — operator-commit-adoption — iter 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した項目

| 項目 | 確認対象ファイル | 結果 |
|------|----------------|------|
| `verifyEgressLedger` 不変条件 | `src/core/step/commit-push.ts:342-374` | ✓ 維持 |
| hand-push convention コメントと新挙動の整合 | `src/core/step/commit-push.ts:383-389` | ⚠ 矛盾あり（F-001） |
| `--apply-canon` 意味不変（D4） | `src/core/resume/apply-canon.ts:11-12`, TC-006 | ✓ 維持 |
| apply-canon gate の no-worktree 警告パターン | `src/core/command/resume.ts:411-414` | ⚠ adopt gate に対応なし（F-002） |
| apply-canon gate のエラー出力パターン | `src/core/command/resume.ts:341-346` | ⚠ adopt gate と非対称（F-003） |
| `isStaleRunning` の stale 検出と PID 死亡回復 | `src/core/resume/safety.ts:40-66` | ✓ 正常動作（adopt gate halt 後の回復も含む） |
| adopt gate halt 後の job 状態（running/dead → 次の resume で回復） | `src/core/resume/safety.ts`, D3 | ✓ 既存 apply-canon halt と同一経路 |
| `appendSynthesizedCommit` の純粋性と pipeline 側 `appendOidInPlace` の整合 | `src/state/schema/operations.ts:35-39`, `commit-push.ts:408-` | ✓ 矛盾なし |
| OID フォーマット統一性（detect → ledger → verify の full OID 一貫性） | `adopt-commits.ts:65-84`, `operations.ts:35-39`, `commit-push.ts:368-373` | ✓ 全経路 full OID で統一 |
| D4 composability invariant（apply-canon OID が adopt gate に再 flag されない） | `resume.ts:353`（ledger は apply-canon 後に読む）, TC-013 | ✓ 維持 |
| TC-005 テスト 2 が adopt persist でなく running 遷移 persist の失敗を踏む問題 | `resume-adopt-commits.test.ts:648-668` | 既存 code-review F-002 と重複、ここでは観察のみ |

---

## Findings

### F-001: `commit-push.ts:383-389` の design comment が新挙動と矛盾する（変更していないコード）

**変更していないコード（commit-push.ts:383-389）:**
```
Pre-existing legitimate commits are excluded because they are on origin
(pipeline pushes after every synthesis; operator hand-commits are hand-pushed).
```

このコメントが依拠している不変条件は「operator が commit した変更は必ず origin へ push される（publish range に残らない）」である。この前提のもとで `git rev-list HEAD --not --remotes=origin` が operator commit を除外できると設計されている。

本 PR が導入した `--adopt-commits` は、**operator commit が publish range に残ったまま**（push されていない）でも `verifyEgressLedger` を通過させる。これは上記コメントの不変条件を廃止する変更である。コメントは更新されておらず、将来の開発者がこのコメントを読むと「operator commit は手で push する必要がある」という旧設計を信じてしまうリスクがある。

**証拠:**
- request.md 背景節: 「回避策は『operator は手当てを commit したら手で push する』という規約だが、この規約はコードコメント（`src/core/step/commit-push.ts:389`）にしか存在せず、機械的な強制も警告も無い」
- design.md D2: 「採択が現状より provenance を改善する点」——手で push せずに ledger 記録付きで egress できる経路を新設している

**影響:** コメントを読んだ開発者が旧 tribal knowledge を復活させる（`--adopt-commits` を削除するなど）と設計が壊れるリスク。

---

### F-002: `--adopt-commits` が `--no-worktree` モードまたは worktreePath 非解決時に警告なく無視される

**変更していないコード（resume.ts:411-414）:**
```typescript
} else if (this.options.applyCanon) {
  // --apply-canon has no effect without a worktree — warn but continue.
  stderrWrite("Warning: --apply-canon has no effect without a worktree ...");
}
```

`resolvedWorktreePath === null` のとき apply-canon gate / adopt gate のブロック全体がスキップされる。`--apply-canon` にはスキップを伝える警告が既存コードにある。一方 `--adopt-commits` に対応する警告は追加されていない。

**問題の経路:**
1. no-worktree で実行される job が何らかの理由で `EGRESS_UNKNOWN_COMMIT`（in-pipeline egress）で halt する
2. 改善後のエラーメッセージの option 1 は `specrunner job resume <slug> --adopt-commits` を勧める
3. operator が `job resume --no-worktree --adopt-commits` を実行
4. `resolvedWorktreePath === null` のため adopt gate はスキップ
5. 警告は表示されず、pipeline が起動し、再び `EGRESS_UNKNOWN_COMMIT` が発生する
6. operator は `--adopt-commits` が「効かない」理由を知らない

**証拠:**
- `resume.ts:293`：`if (resolvedWorktreePath !== null && resolvedSlug !== null)` — adopt gate の guard
- `resume.ts:411-414`：apply-canon は `else if (this.options.applyCanon)` で警告を出すが adoptCommits の対応ブランチなし
- design.md Risks: 「`--no-worktree` resume that still carries an unknown OID hits the in-pipeline egress check, which now carries the improved three-option message」——このリスクは design で認識されているが、runtime 警告は実装されていない

**影響:** operatior が `--adopt-commits` を付けても効果がない状況を無言で通過する。backstop は弱まらないが operator が解決手段を誤認識する。

---

### F-003: adopt gate の fail-closed halt が `logError` を経由せず apply-canon gate との出力パターンが非対称

**変更していないコード（apply-canon gate, resume.ts:341-346）:**
```typescript
logError(`Protected canon paths are dirty in the worktree: ${dirtyCanonPaths.join(", ")}`);
stderrWrite(`Hint: Use --apply-canon to commit these changes ...`);
throw new PrepareError(1, ...);
```

**新コード（adopt gate, resume.ts:387-391）:**
```typescript
const msg = buildAdoptEscalationMessage(resolvedSlug, unadoptedCommits);
stderrWrite(msg);
throw new PrepareError(1, ...);
```

apply-canon gate は `logError(要約) + stderrWrite(hint)` のパターンを確立している。adopt gate は `stderrWrite(full message)` のみで `logError` を経由しない。

**テストの観点:** TC-003 はこの不一致を隠している。TC-003 は `logError.mock.calls` と `stderrWrite.mock.calls` の**和集合**に対して assertion を書いており、どちらか一方だけに書いても pass する設計になっている。

**影響:**
- ログアグリゲーター / CI ツールが `[ERROR]` プレフィックスでフィルタする場合、adopt gate の escalation が検出されない
- 将来 `logLevel` フィルタが `stderrWrite` にも適用された場合、escalation が quiet モードで抑制されるリスク
- apply-canon と adopt の2つの gate が並置されているにもかかわらず出力パターンが異なることで、コードを読む開発者が混乱する

---

## 検証できなかった項目

- `reconcileWorktreeArtifacts` と adopt gate の 順序依存性（best-effort で no-op なので問題はないが、end-to-end 実行での確認は行っていない）

---

## 既存コードの不変条件サマリ

| 不変条件 | 状態 |
|----------|------|
| `verifyEgressLedger`: push 前に全 OID が ledger にある | ✓ 維持（adopt 後は ledger に追記） |
| `--apply-canon` の意味: `git status` ベース canon path のみ commit | ✓ 維持（TC-006 で固定） |
| apply-canon OID が adopt gate に再 flag されない | ✓ 維持（D4、TC-013） |
| stale running 検出 → awaiting-resume 回復 | ✓ 維持（adopt halt 後も同経路） |
| hand-push convention（operator commit は origin に push される） | ⚠ 廃止——コメントが旧前提のまま（F-001） |
| no-worktree フラグの警告パターン | ⚠ adopt に対応なし（F-002） |
| gate のエラー出力パターン（logError + stderrWrite） | ⚠ adopt が非対称（F-003） |
