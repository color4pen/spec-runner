# specrunner resume コマンドの追加

## Meta

- **type**: new-feature
- **slug**: specrunner-resume-command

## 背景

pipeline が escalation / loop exhaustion / SIGINT で停止した job は `awaiting-resume` status になる（PR #107）。しかし再開する手段がなく、`specrunner run` で最初からやり直すしかない。propose や spec-review で完了した作業が無駄になる。

## 要件

### 1. CLI コマンド

1. `specrunner resume <slug>` で `awaiting-resume` status の job を再開する
2. `--from critic` / `--from fixer` / `--from creator` で再開起点を override できる（default は失敗した step = critic）
3. status が `awaiting-resume` でない job は拒否する（`--force` で override）

### 2. resume-point 判定

4. `state.resumePoint.step` から再開する step を決定する
5. default: resumePoint の step から再実行（critic = spec-review / code-review）
6. `--from fixer`: spec-fixer / code-fixer から再実行（phase に応じて自動判定）
7. `--from creator`: propose / implementer から再実行（phase に応じて自動判定）

### 3. pipeline 再開

8. `Pipeline.run(startStep, existingJobState, deps)` で途中の step から再開する
9. iteration counter をリセットする（再開即 escalation を防ぐ）
10. 既存の `state.steps` に append する（履歴は失わない）
11. worktree が残っている場合はそのまま再利用する（`state.worktreePath`）
12. worktree がない場合は新規作成する

### 4. 安全策

13. 同じ step が連続 3 回 escalation したら resume 拒否（無限ループ防止）
14. `state.updatedAt` が一定時間以上前の場合は warning（branch state が drift している可能性）

### 5. CLI 統合

15. `bin/specrunner.ts` の switch-case に `resume` を追加
16. `--from` と `--force` フラグをパース

## 受け入れ基準

- [ ] `awaiting-resume` の job に対して `specrunner resume <slug>` で pipeline が再開される
- [ ] 再開は `resumePoint.step` から開始される
- [ ] `--from fixer` / `--from creator` で再開起点を変更できる
- [ ] iteration counter がリセットされ、再開即 escalation しない
- [ ] worktree が残っていれば再利用される
- [ ] 3 回連続 escalation で resume 拒否される
- [ ] `bun run typecheck && bun run test` が green

## 補足

### architect 評価済み設計判断

- default = critic から再実行（最も破壊的でない）
- fresh session を使用（session resume は将来の最適化）
- `Pipeline.run` は任意 step から開始可能な signature が既にある
- `ResumePoint` は PR #107 で JobState に追加済み
- worktree は PR #106 で job ごとに作成される仕組みが入っている

### 関連

- PR #107: `awaiting-resume` status + `ResumePoint` schema
- PR #106: worktree-based job execution
- Issue #75: JobStatus state machine 化（本 request の上位）


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/specrunner-resume-command.md` by `merged-to-archive-consolidation`.
