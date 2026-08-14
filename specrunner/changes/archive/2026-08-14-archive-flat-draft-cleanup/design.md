# Design: archive の draft 削除を repo 本体側・両形式に直す

## Context

`runArchiveOrchestrator` は archive 完了時に該当 slug の draft を削除する設計だが、
実際には二重のバグにより一度も機能していなかった:

1. **場所の誤り**: `fs.rm(nodePath.join(recordDir, draftsDir(), slug), ...)` — `recordDir` は job worktree のパスであり、untracked な draft はそこに存在しない。削除は常に no-op だった。
2. **形式の取りこぼし**: ディレクトリ形式 `drafts/<slug>/` のみを対象にし、フラット形式 `drafts/<slug>.md` を見ていなかった。

`fs.rm` の `force: true` により "対象が存在しない" は無音で成功するため、失敗が観測されないまま蓄積した。

`ArchiveInput.cwd` はすでに "Main repo root" と型コメントに明示されており、`cancel/runner.ts:154` が `deps.repoRoot` を直接使って drafts/ に書き戻す前例がある。

worktree 側の draft 削除 (lines 260–265) と drafts の git add/staging (lines 272–284) は現状いずれも実質 no-op。

## Goals / Non-Goals

**Goals**:
- archive 完了時に repo 本体(cwd)の `drafts/<slug>.md` と `drafts/<slug>/` を両方削除する
- untracked draft を確実に削除する
- tracked draft に対して警告を出し、working tree を黙って dirty にしない
- worktree 側の no-op 処理を整理する

**Non-Goals**:
- 既存の蓄積 draft の一括削除
- `cancel --restore-draft` の形式対応
- draft の形式統一・git 管理方針の変更

## Decisions

### D1: 削除先を `cwd`(repo 本体) に変更する

worktree (`recordDir`) ではなく `cwd` を基点に draft を削除する。

**Rationale**: untracked ファイルは git worktree に複製されない。`cwd` = repo 本体の working tree のみに存在するため、そちらを操作する必要がある。`cancel/runner.ts` が `deps.repoRoot` 基準で drafts に書き戻す前例と対称的。

**Alternatives considered**:
- `git worktree` を経由して repo 本体にアクセス: 不要な複雑さ。`cwd` が直接渡されているので使わない理由がない。

### D2: フラット形式と ディレクトリ形式の両方を削除する

`specrunner/drafts/<slug>.md` と `specrunner/drafts/<slug>/` を順に試みる。存在しない場合は `fs.exists` で事前確認してスキップ。

**Rationale**: `store.ts:resolveWithFallback` が両形式を受け入れる実装になっており、削除も対称的に両形式を対象にする必要がある。フラット形式が実運用の標準であり、これまで一度も削除できていなかった直接の原因。

**Alternatives considered**:
- フラット形式のみ: ディレクトリ形式の残骸が引き続き蓄積する。
- ディレクトリ形式のみ: 現行の不具合を踏襲するだけ。

### D3: Tracked draft は削除せず警告を出す

削除前に `git ls-files -- <relPath>` を `cwd` で実行し、stdout が非空 = tracked の場合は `stderrWrite` で警告を出してスキップする。

**Rationale**: tracked ファイルを黙って削除すると repo 本体の working tree が dirty になり、不意打ちのステージなし変更として残る。archive の完了より安全側に倒すことを優先する。

**Alternatives considered**:
- `git rm` で削除してコミット: archive commit は feature branch に積む設計であり、draft 削除を同一 commit に混ぜると base branch への cherry-pick で conflict リスクがある。スコープ外。
- 黙って `fs.rm` のみ実行: working tree を汚す。

### D4: worktree 側の draft 削除・staging を削除する

`orchestrator.ts` lines 260–265 (worktree-side `fs.rm`) と lines 272–284 (worktree-side git add + archivePathspecs push) を削除する。

**Rationale**:
- lines 260–265: untracked draft は worktree に存在しないため常に no-op。D1 で repo 本体削除に置き換えるため不要。
- lines 272–284: untracked draft の worktree-side staging は常に no-op。tracked draft は D3 で警告のみに変更したため、staging する対象がない。draft 削除はそもそも archive commit に載せない設計（untracked ファイルは git add できない）。

**残す理由がないため削除する。これにより archive commit は `specrunner/changes/` のみを含むという元の設計意図に合致する。**

**Alternatives considered**:
- 残す: no-op を保持するだけで混乱の素になる。コメントで "no-op" と書くより消す方が正直。

**影響する既存テスト** (D4 に起因して変更が必要なもの):

| テスト ID | 現状の主張 | 変更後の対処 |
|-----------|-----------|-------------|
| T-01 | `fs.rm` が worktree パス + ディレクトリ形式で呼ばれる | repo 本体パス (flat + dir 両形式) で呼ばれるよう更新 |
| T-08 | drafts dir 不在時 git add NOT called | worktree-side staging を削除したため trivially true。内容を「draft が存在しない場合に rm が呼ばれない」に更新 |
| T-09 | drafts dir 存在時 git add IS called | worktree-side staging を削除したため無効。repo 本体パスの rm が呼ばれることを検証する内容に更新 |

### D5: `FinishFs` インターフェースおよび `ArchiveInput` は変更しない

`exists`・`rm` は既存の `FinishFs` にある。`spawn` は `ArchiveInput` から既に渡されている。追加の DI 不要。

**Rationale**: インターフェースを変えずに実装のみ直せる。

## Risks / Trade-offs

[Risk] tracked な draft が存在する場合に警告を出して残すため、archive 後にユーザーが手動削除を忘れる可能性がある。
→ Mitigation: stderrWrite の警告メッセージに具体的な削除コマンド (`git rm <path> && git commit`) を含める。

[Risk] `git ls-files` は `spawn` 経由で呼ぶため、worktree 環境でも cwd を正しく渡す必要がある。
→ Mitigation: `git ls-files -- <relPath>` を `{ cwd }` で実行。相対パスで呼ぶため worktree との混同がない。

## Open Questions

なし。

<!-- spec-fixer-deferred: T-07 命名衝突（pre-existing）のテストファイル編集 spec-fixer は source code (src/) への書き込みが禁止されているため、orchestrator.test.ts line 326 の T-07 → T-10 改名は tasks.md T-02 に追記して implementer に委譲した。 -->
