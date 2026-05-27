# CLI ログレベル体系の整備

## Meta

- **type**: spec-change
- **slug**: cli-log-level-system
- **base-branch**: main
- **adr**: false

## 背景

Phase 1 (#418 / PR #433) で全出力パスを logger 経由に統一した。次のステップとして、ログレベルの制御体系を整備する。

現状ログレベルに関する 4 系統が混在している:

1. `--verbose` / `setVerbose(true)` — `logWarn` の表示/非表示のみを制御 (boolean)
2. `SPECRUNNER_LOG_LEVEL=verbose` — `--verbose` と同等
3. `SPECRUNNER_DEBUG=pipeline` — pipeline diagnostic のみ (comma-separated、`logPipelineDiag`)
4. `DEBUG` env var — `logDebug` の表示/非表示

各系統が独立に制御されており、統一的なログレベル体系がない。

## 要件

### 1. ログレベルを 4 段階に統一

| レベル | 出力内容 | CLI フラグ | 環境変数 |
|---|---|---|---|
| quiet | error のみ | `-q` | `SPECRUNNER_LOG_LEVEL=quiet` |
| default | error + warn + info (進捗表示) | (なし) | (なし) |
| verbose | + debug 相当の詳細情報 | `-v` | `SPECRUNNER_LOG_LEVEL=verbose` |
| debug | + 全 diagnostic ログ | `-vv` | `SPECRUNNER_LOG_LEVEL=debug` |

- `logInfo` / `logStep` / `logSuccess`: default 以上で出力
- `logWarn`: default 以上で出力（現状は verbose 以上だが、warn は常に出すべき）
- `logDebug`: debug レベルで出力
- `logError`: 常に出力

### 2. SPECRUNNER_DEBUG サブシステムフィルタの維持

`SPECRUNNER_DEBUG=pipeline,session` の仕組みはログレベルとは直交する軸として維持する。debug レベル有効時のみサブシステムフィルタが機能する。

### 3. 既存の DEBUG env var の統合

Node.js 汎用の `DEBUG` env var は `SPECRUNNER_LOG_LEVEL=debug` への alias として維持する。将来的に deprecation するが、本 request では互換性を保つ。

### 4. logWarn の挙動変更

現状 `logWarn` は verbose=true のときのみ出力されるが、warning は default レベルでも出力すべき。verbose チェックを外し、quiet 以外で常に出力する。

## スコープ外

- **exit code の標準化** — 別リクエストで対応
- **ログの永続化 / retention** — Phase 3 (#420) で対応
- **構造化出力 (JSON Lines)** — Phase 4 (#421) で対応
- **logger/stdout.ts のファイル名変更** — 本 request では変更しない

## 受け入れ基準

- [ ] `-q` で error のみ、`-v` で verbose、`-vv` で debug レベルが有効になる
- [ ] `SPECRUNNER_LOG_LEVEL=quiet|verbose|debug` で環境変数からレベル制御できる
- [ ] `logWarn` が default レベル（フラグなし）で出力される
- [ ] `SPECRUNNER_DEBUG=pipeline` が debug レベル有効時のみ機能する
- [ ] `DEBUG` env var が設定されている場合 `SPECRUNNER_LOG_LEVEL=debug` と同等に動作する
- [ ] verbose レベル以上で既存の `initVerboseLog` が有効化される（従来の `--verbose` と同等）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **4 段階**: Gradle の 6 段階は過剰、npm の 8 段階も不要。quiet / default / verbose / debug の 4 段階が CLI として必要十分（業界調査に基づく）
- **サブシステムフィルタは直交軸**: Terraform の TF_LOG + TF_LOG_CORE 方式と同じ。レベルとフィルタを独立に制御
- **logWarn の挙動変更**: warning を verbose 限定にしていたのは過剰な抑制。POSIX の stderr は診断メッセージ用であり、warning は常に出すのが標準
