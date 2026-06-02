# spec-merge を廃止し finish の pipeline→specs 閉ループを断つ

## Meta

- **type**: spec-change
- **slug**: abolish-spec-merge
- **base-branch**: main
- **adr**: false

## 背景

ADR-20260602（spec-model）D3 を実装する。

現状 `job finish` の Phase 1 は `mergeSpecsForChange` で各 change の delta spec を baseline spec に書き込み、pipeline→`specs/` の閉ループを成立させている。この書き込み点は構造ドキュメント上「最も trust load-bearing」と位置づけられている。

実測では baseline は下流（implementer / code-review / verification）に消費されず、振る舞いの真実は test suite と構造の歯（B-1〜B-10 / §3 DSM closure）が担う。この閉ループを断ち、pipeline が自身の振る舞い authority を書き換える経路を消す。

## 要件

1. `job finish` の Phase 1 から delta→baseline 反映（spec-merge）を除去する。archive folder 移動・usage.json derive・archive commit・push・PR merge は従来どおり維持する。
2. spec-merge 実装（`src/core/finish/spec-merge.ts`、それのみが import する `src/core/finish/baseline-headers.ts`、orchestrator からの呼び出し、専用 helper）を撤去し、残置参照を残さない。
3. finish は request type を読んで delta spec の有無を fail/skip 判定しない。spec-merge 由来の type 別ガードを廃止する（delta 必須性は pipeline の delta-spec-validation step が担う）。
4. README の finish 説明から delta→baseline 反映の記述を除き、archive + squash merge のみに更新する。
5. spec-merge を前提とした prompt の文言を実態に合わせる。フォーマット規約・guard 方針自体は維持し、spec-merge 由来の rationale のみ更新する: `src/prompts/spec-fixer-system.ts` / `src/prompts/code-fixer-system.ts` の delta spec フォーマット規約の理由付け（「spec-merge が parse に依存」）、`src/prompts/request-review-system.ts` の「authority specs are auto-updated by `specrunner finish` spec-merge」記述。

## スコープ外

- baseline corpus の capability 別ディレクトリ構造と merge 用 format の整理（ADR D4 / 別リクエスト baseline-capability-consolidation）。
- architecture/ 配下の構造ドキュメント同期。

## 受け入れ基準

- [ ] `job finish` 実行後、対象 change の delta spec が baseline spec へ反映されず archive のみ行われる
- [ ] spec-change の change で delta spec が無くても finish が escalation せず完了する
- [ ] `spec-merge.ts` / `baseline-headers.ts` への参照が `src/` 内に残らない
- [ ] prompt 内に spec-merge を前提とした rationale が残らない
- [ ] README の finish 説明に delta→baseline 反映の記述が無い
- [ ] `bun run typecheck && bun run test` が green（B-1〜B-10 / §3 DSM closure を含む）

## architect 評価済みの設計判断

ADR-20260602（spec-model）D3 に準拠。spec-merge 廃止により baseline は source-of-truth でなくなり、振る舞いの authority は test suite + 構造の歯に一本化される。
