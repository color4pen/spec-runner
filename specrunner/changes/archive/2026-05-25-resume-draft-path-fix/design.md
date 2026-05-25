# Design: resume-draft-path-fix

## Problem

`state.request.path` は `pipeline-run.ts:66` で draft ファイルの絶対パス（`specrunner/drafts/<slug>/request.md`）に設定される。その後 `local.ts:228` / `managed.ts:118` で draft は削除されるが、state の path は更新されない。`job resume` 時に `resume.ts:171` が `parseRequestMd(state.request.path)` を呼ぶと削除済みファイルを読みに行き ENOENT で失敗する。

## Design Decisions

### D1: runtime の setupWorkspace 内で `state.request.path` を永続パスに更新する

draft を change folder にコピーした直後に `updateJobState` で `state.request.path` を `<worktreePath>/specrunner/changes/<slug>/request.md`（local）または `<cwd>/specrunner/changes/<slug>/request.md`（managed）に書き換える。

**変更箇所**:
- `src/core/runtime/local.ts`: draft コピー後・draft 削除前に `updateJobState` で path 更新
- `src/core/runtime/managed.ts`: 同上

**理由**: state は worktree 寿命より長く残る（archive 後も参照される）。永続側パスを記録するのが正しい。draft 削除の前後どちらでも意味論上は同じだが、コピー成功後すぐに更新するのが安全。

### D2: `ResumeCommand.prepare()` に legacy fallback 解決を追加する

`state.request.path` が `specrunner/drafts/` を含む場合（legacy state file）、以下の順でフォールバックする:

1. `state.worktreePath` が non-null かつディレクトリが存在 → `<worktreePath>/specrunner/changes/<slug>/request.md`
2. 上記が無効 → `<process.cwd()>/specrunner/changes/<slug>/request.md`
3. 両方のファイルが存在しない → 現状と同等の ENOENT エラー

**変更箇所**: `src/core/command/resume.ts` の `parseRequestMd` 呼び出し前にパス解決ロジックを挿入

**slug の取得**: `state.request.slug`（non-null の場合）または `getJobSlug(state)` を使用

### D3: パス解決ロジックは `src/core/resume/resolve-request-path.ts` に分離する

`resume.ts` に inline せず、純粋関数として分離しテスト容易性を確保する。

```ts
export function resolveRequestPath(
  statePath: string,
  slug: string,
  worktreePath: string | null | undefined,
  cwd: string,
): string
```

- `statePath` が `/drafts/` を含まない → そのまま返す（新規 state）
- `/drafts/` を含む → D2 のフォールバックチェーンで解決

ファイル存在チェック（`fs.existsSync`）は関数内で行い、呼び出し側は返り値をそのまま `parseRequestMd` に渡す。

### D4: delta spec は `cli-resume-command` に追加する

`cli-resume-command` spec に「request.md パス解決時の legacy fallback」要件を追加する。`job-state-store` の `RequestInfo.path` 定義そのものは変更しない（path フィールドの型は `string` のまま）。

## File Change Summary

| File | Change |
|------|--------|
| `src/core/runtime/local.ts` | draft コピー後に `updateJobState` で `state.request.path` を永続パスに更新 |
| `src/core/runtime/managed.ts` | 同上 |
| `src/core/resume/resolve-request-path.ts` | **新規**: legacy fallback パス解決関数 |
| `src/core/command/resume.ts` | `parseRequestMd` 前に `resolveRequestPath` を呼び出し |
| `src/core/resume/resolve-request-path.test.ts` | **新規**: 3 ケース + local/managed 分岐のユニットテスト |
| `specrunner/changes/resume-draft-path-fix/specs/cli-resume-command/spec.md` | `cli-resume-command` への delta spec |

## Scope Boundaries

- draft 削除挙動は変更しない（現状維持）
- `RequestInfo` の型定義は変更しない
- `state.request.path` 以外のフィールドは変更しない
