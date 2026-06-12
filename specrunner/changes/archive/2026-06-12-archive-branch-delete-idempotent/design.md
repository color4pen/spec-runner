# Design: archive-branch-delete-idempotent

## Context

`job archive --with-merge` および `job cancel` の cleanup フェーズでは、`git push origin --delete <branch>` を best-effort で実行する。GitHub の「merge 時に branch を自動削除」設定が有効な場合、archive が remote branch 削除を試みる時点で branch はすでに存在しない。

現状は `exitCode !== 0` を一律 warning として扱うため、意図した最終状態（branch が無い）に到達していても `Warning: failed to delete remote branch <branch>.` が出力される。これは偽 warning であり、真の失敗（認証・ネットワーク等）の signal を埋もれさせる。

対象コード:
- `src/core/archive/orchestrator.ts:308-311` — exitCode のみで判定、stderr を参照しない
- `src/core/cancel/runner.ts:192-194` — stderr を warning 文言に含めるが、不存在の区別なし

## Goals / Non-Goals

**Goals**:
- remote branch が既に存在しない場合を成功扱いにし、warning を出力しない（冪等化）
- それ以外の失敗（認証・ネットワーク等）は従来通り warning を出す
- archive / cancel の両経路に同じ意味論を適用する

**Non-Goals**:
- ローカル branch 削除（`git branch -D`）の挙動変更
- 削除失敗時のリトライ
- Phase 2 のその他の best-effort 処理（worktree 撤去・sidecar 削除）

## Decisions

### D1: 判別方法 — stderr の検査 vs 事前 `ls-remote` 確認

**Options**:
- A: 削除実行前に `git ls-remote --heads origin <branch>` で存在確認し、不在ならスキップ
- B: 削除を実行し、失敗時に stderr に `remote ref does not exist` が含まれるか検査

**Decision**: B（stderr 検査）

**Rationale**: A は余分なネットワークラウンドトリップを要し、確認と削除の間に branch が削除される TOCTOU 競合がある。B は 1 回の呼び出しで完結し、競合がない。`remote ref does not exist` は git の安定した出力文字列であり、複数のメジャーバージョンにわたって変化していない。

### D2: ヘルパー関数の配置

**Options**:
- A: 各呼び出し箇所にインライン判定を書く
- B: 純粋な判定関数 `isRemoteRefNotFound(stderr: string): boolean` を共有 utility として抽出する

**Decision**: B（共有 utility 抽出）

**Rationale**: archive / cancel の 2 箇所が同じロジックを持つ。共有関数として単体テストし、呼び出し箇所ではその返り値を使うだけにするとテスト密度が上がる。配置先は `src/util/git-push.ts`（新規、`git push` セマンティクスの utility）。

### D3: マッチングのパターン

`git push origin --delete <non-existent-branch>` の stderr:
```
error: unable to delete '<ref>': remote ref does not exist
error: failed to push some refs to '...'
```

マッチング対象: `"remote ref does not exist"`（大文字小文字を無視）

大文字小文字を無視するのは防御的な措置。部分文字列マッチで十分（完全一致は不要）。

## Risks / Trade-offs

- [Risk] 将来の git バージョンが stderr メッセージを変更し、偽 warning が再発する  
  → Mitigation: マッチングロジックを `isRemoteRefNotFound` に局所化してあるため、メッセージ変更時の修正箇所が 1 ファイルに限定される。また、この文字列は git 2.x 系全体で安定している実績がある

- [Risk] stderr に複数のエラーメッセージが混在し、不存在以外の失敗を誤って成功扱いにする  
  → Mitigation: 判定は stderr 全体の検索だが、`remote ref does not exist` はこのシナリオ特有の文字列であり、認証エラーやネットワークエラーには含まれない

## Open Questions

なし
