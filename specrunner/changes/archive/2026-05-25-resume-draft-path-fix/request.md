# `state.request.path` が指す draft の削除で resume が ENOENT 失敗する bug を修正する

## Meta

- **type**: bug-fix
- **slug**: resume-draft-path-fix
- **base-branch**: main
- **adr**: false

## 背景

`specrunner job resume <slug>` が、削除済みの draft file を読もうとして ENOENT で失敗し、resume できなくなる bug がある。実例 (#386):

```
Error: Failed to read request.md at '/.../specrunner/drafts/jobs-to-dotspecrunner.md':
  ENOENT: no such file or directory, open '/.../specrunner/drafts/jobs-to-dotspecrunner.md'
```

### 原因

1. `specrunner request new <slug>` で `specrunner/drafts/<slug>/request.md` を作る
2. `specrunner job start <slug>` 起動時、`src/core/runtime/local.ts:228` (および `runtime/managed.ts:118`) で `fs.rm(opts.requestFilePath)` により **draft 本体を削除**
3. ただし `state.request.path` には **削除前の path**（drafts/ 配下）が記録されたまま
4. 後で `job resume` すると `parseRequestMd(state.request.path)` がその削除済 path を読もうとして ENOENT

= 一度 halt した job は resume できない。緊急時は worktree 内の `changes/<slug>/request.md` を drafts に手動 copy する workaround が必要。

## 要件

1. **`state.request.path` を永続側のパスに保存する**
   - run 起動時に worktree 内の `changes/<slug>/request.md` (= 永続) を `state.request.path` に記録する
   - 「draft 削除」と「state path 記録」の責務を整合させる

2. **resume が ENOENT で失敗しないことを保証する**
   - 新規 job: 上記 1 の修正で path が永続側を指すため、削除済 file を読みに行かない
   - 既存 job (legacy state file): `state.request.path` が drafts/ を指している場合のフォールバック解決を追加
     - **第 1 候補**: `state.worktreePath` が non-null かつ実存する場合（local runtime） → `<worktreePath>/specrunner/changes/<slug>/request.md`
     - **第 2 候補**: 上記が無効な場合（managed runtime / worktree 削除済） → `<process.cwd()>/specrunner/changes/<slug>/request.md`
     - 両方失敗 → 現状と同等の ENOENT エラー

3. **後方互換の維持**
   - 既存の `~/.local/share/specrunner/jobs/*.json` で `state.request.path` が drafts/ を指していても resume が動く
   - フォールバック解決が失敗した場合は現在と同等の ENOENT エラーを出す

## スコープ外

- `fs.rm(opts.requestFilePath)` の削除挙動そのものの変更（drafts を削除し続けるか残すかの設計判断は本 request では扱わない、現状の削除挙動を維持）
- `specrunner job resume` の他の bug (#386 の silent exit など) の修正
- `state.request.path` 以外の `RequestInfo` field の見直し
- drafts/ 配下の構造変更（既に flat → directory 移行済、本 request の対象外）

## 受け入れ基準

- [ ] `job start` 完走後、`state.request.path` が `<repo-root>/specrunner/changes/<slug>/request.md` を指している
- [ ] 削除済 drafts/ 配下の path しか持たない既存 state file でも `job resume` がフォールバックで動作する
- [ ] `bun run typecheck && bun run test` が green
- [ ] 関連 unit test を追加（新規 path 記録 / legacy fallback / 完全 ENOENT の 3 ケース）
- [ ] legacy fallback test は **local runtime (worktreePath あり) / managed runtime (worktreePath null)** の両 case をカバー

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- **draft 削除自体は維持**: 「draft = 起票エントリポイント、run で消費されて消える」という意味論を変えない
- **state path を永続側に切り替える**: state は worktree 寿命より長い (archive 後も残る) ので、worktree 内の永続パスを記録するのが正しい
- **legacy fallback で互換維持**: 既存の archived / awaiting-resume な state file を壊さない
