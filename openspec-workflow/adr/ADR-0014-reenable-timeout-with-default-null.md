# Re-enable timeoutMs with Default Null

**Date**: 2026-05-15
**Status**: accepted
**Supersedes**: ADR-0013

## Context

ADR-0013 で wall-clock timeout を完全撤廃した。理由は implementer 等の長時間ステップで
false positive が多発したため。しかし撤廃により以下の問題が残った:

- config で timeoutMs を設定してもユーザーが timeout を制御できない
- 異常時の手段が Ctrl+C のみ（cancel コマンドは #61 で別途）
- CI 環境で暴走セッションの制御手段がない

## Decision

timeoutMs をデフォルト null（無制限）で再有効化する。ユーザーが config で
明示的に設定した場合のみ、各 adapter が自身の SDK に合った方法で timeout を実施する。

- Claude Code: AbortController + setTimeout（既存配線を活用）
- Codex: AbortController + setTimeout（既存配線を活用）
- Managed Agent: pollUntilComplete() の timeoutMs パラメータ経由
- タイムアウト発生時は awaiting-resume に遷移（再開可能）

ADR-0013 の「false positive 多発」問題は「デフォルト無制限」で解決する。
ユーザーが自環境に合わせて設定する運用とする。

timeout の所有者は adapter（StepExecutor ではない）。3 つの SDK の timeout
メカニズムが異なるため、統一インターフェースは採用しない。

## Consequences

### Positive

- ユーザーが config で timeout を制御できる
- デフォルト null のため既存動作に影響なし
- CI 環境で config 設定により暴走セッションを制御可能
- 既存の adapter 配線を活用するため最小限の変更

### Negative

- 3 adapter で timeout メカニズムが異なる（AbortController vs timeoutMs パラメータ）
- 推奨値の策定は実行時間データ蓄積後に先送り

## Related

- ADR-0013: Remove Wall-Clock Timeout（superseded）
- Request: timeout-enforcement
