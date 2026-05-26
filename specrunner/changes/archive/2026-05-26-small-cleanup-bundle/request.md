# module-boundary guard の grep pattern 更新 + gitignore Exception dedup (#370 + #406)

## Meta

- **type**: spec-change
- **slug**: small-cleanup-bundle
- **base-branch**: main
- **adr**: false

## 背景

dogfood 中に発見された既存不備 2 件の小規模修正:

### #370: module-boundary spec の grep pattern が stale

`specrunner/specs/module-boundary/spec.md` の scenario で「core が SDK を直 import していないこと」を検証する grep pattern が旧 SDK 名 (`@anthropic-ai/(sdk|claude-code)`) のまま。現在の SDK 名は `@anthropic-ai/claude-agent-sdk` で pattern にマッチしない = **guard が false-negative**。

### #406: ensureDotSpecrunnerGitignore で Exception 行が dedup されない

PR #405 (gitignore-config-exception) の事後 audit で発見。`src/util/gitignore.ts` の Step 2 dedup が `.specrunner/*` のみ対象、`!.specrunner/config.json` の重複は dedup されない。機能影響なし (= gitignore は重複行でも動く) だが idempotency が不完全。

## 要件

### 1. module-boundary spec の grep pattern を新 SDK 名に更新 (#370)

`specrunner/specs/module-boundary/spec.md` の scenario grep pattern を `@anthropic-ai/(sdk|claude-agent-sdk)` に更新し、旧 `claude-code` を削除する。delta spec 経由で変更。

### 2. ensureDotSpecrunnerGitignore の Exception 行 dedup 追加 (#406)

`src/util/gitignore.ts` の Step 2 dedup logic に `!.specrunner/config.json` も対象に追加。test も追加 (= Exception 行重複 → 1 行に集約)。

## スコープ外

- **core/runtime/local.ts の SDK 直 import 是正** — #370 は spec の guard 修正のみ、code 修正は別 request
- **spec.md L56-59 の独立 scenario (`@anthropic-ai/claude-code` 参照)** — 本 request は L42 の grep alternation pattern 更新のみ、L56-59 の独立 scenario は別 request で対応
- **gitignore.ts の他の edge case 対応** — 本 request は #406 の dedup のみ

## 受け入れ基準

- [ ] module-boundary spec の grep pattern が `@anthropic-ai/(sdk|claude-agent-sdk)` に更新されている
- [ ] 旧 `claude-code` パターンが削除されている
- [ ] `ensureDotSpecrunnerGitignore()` が `!.specrunner/config.json` の重複を dedup する
- [ ] Exception 行 dedup の regression test が追加されている
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **2 件を 1 request にまとめる**: 両方 super small scope、触る file 完全分離 (spec vs gitignore.ts)、1 PR で完結する自然なまとまり
