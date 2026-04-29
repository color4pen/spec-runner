# Code Fixer Decisions — 2026-04-29-executor-cleanup

## MEDIUM #1: Wire createSessionWithHistory into call sites

`createSessionWithHistory` を `runProposeStyleStep` にのみ適用する :: 理由: ヘルパーの JSDoc に "propose-style only (fixed step label 'session-create')" と明記されており、`runPollingStyleStep` の session create ブロックは構造的に異なる（`sendUserMessage` 成功後に "ok" history を記録し、`store.update` によるセッション永続化はポーリング完了後に行われる）。ヘルパーの introduce が polling-style に及ぼす変更はシグネチャの改変か振る舞いの変更を伴うため、最小限の修正方針に反する。propose-style へのワイヤリングのみで "never called" 問題は解消される。

`runPollingStyleStep` の inline session-create ブロックはそのまま維持する :: 理由: polling-style の session create は createSession 成功後すぐに "ok" を記録せず sendUserMessage の成功後に記録する 2 段階構造であり、ヘルパーのシーケンスと一致しない。無理に合わせると動作変更になる。

`createSessionWithHistory` のユニットテストを追加する (TC-NEW-helpers-005, TC-NEW-helpers-006) :: 理由: レビュー指摘 #1 が明示的に要求しており、ヘルパーが実際に呼ばれるようになったため成功パス・失敗パス双方の検証が必要。
