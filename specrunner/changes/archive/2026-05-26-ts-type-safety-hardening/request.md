# SDK 境界の `as unknown as` 廃止 + executor event 名の型安全化 (#376 + #377 統合)

## Meta

- **type**: spec-change
- **slug**: ts-type-safety-hardening
- **base-branch**: main
- **adr**: false

## 背景

spec-runner の adapter / core 境界で **TS 型の弛み**が 2 箇所あり、silent failure の原因になっている:

### #376: anthropic-client の `as unknown as` silent v1 fallback

`src/adapter/managed-agent/anthropic-client.ts` が SDK レスポンスの `version` field を `as unknown as { version?: number }` キャストで読み、不在時は `?? 1` で fallback:

```typescript
return { id: agent.id, version: (agent as unknown as { version?: number }).version ?? 1 };
```

4 箇所 + tool 型の二重キャスト (L41/L57) が存在。SDK 更新で `version` が消えても黙って v1 を返す = agent registry の version 不整合に気づけない。

### #377: executor の generic emit forwarder

`src/core/step/executor.ts` の emit forwarder が event 名を `string` で受ける (= 型制約なし)。typo しても compile 通り、runtime まで検出できない。

## 要件

### 1. anthropic-client の `as unknown as` 廃止 (#376)

`src/adapter/managed-agent/anthropic-client.ts` の 4 箇所 + tool 型キャスト 2 箇所から `as unknown as` を廃止する。

- SDK 型定義 (`BetaManagedAgentsAgent`) には **`version: number` が非 optional で既に存在**する (= `node_modules/@anthropic-ai/sdk/resources/beta/agents/agents.d.ts` で確認済)。`as unknown as` は SDK 型が expose されていなかった時期の workaround であり、現在は **SDK 型を直接使う**ことで `as unknown as` を廃止できる
- tool 型キャストも同様に SDK 型を直接 import するか、adapter 関数で型変換責務を切り出して `as unknown as` を一掃

具体的実装方法は **design step で確定**する。

### 2. executor の event 名を型安全化 (#377)

`src/core/step/executor.ts` の emit forwarder の event 名を **string literal union or enum** に制約し、typo を compile 時に検出可能にする。

具体的実装方法は **design step で確定**する。

## スコープ外

- **SDK 型定義の upstream 修正** — anthropic SDK 自体に `version` を expose させる活動は別軸
- **全 `as unknown as` の一掃** — 本 request は #376 の 6 箇所に限定、他ファイルの cast は別 request
- **emit forwarder 以外の event 系型安全化** — EventBus 全体の型見直しは別 request

## 受け入れ基準

- [ ] `anthropic-client.ts` から `as unknown as` が全箇所 (4 + 2) 削除されている
- [ ] SDK 型 (`BetaManagedAgentsAgent.version: number`) を直接使用し、`as unknown as` による workaround が不要になっている
- [ ] executor の emit forwarder で typo した event 名を渡すと compile error になる
- [ ] 既存 pipeline に regression なし
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **#376 と #377 を 1 request にまとめる**: 両方とも「TS 型の弛み → silent failure」という共通テーマ、触る file が分離 (adapter vs core)、1 PR で完結する自然なまとまり
- **`as unknown as` 廃止の方向性**: SDK 型 (`BetaManagedAgentsAgent`) に `version: number` が非 optional で存在することを確認済。SDK 型を直接使えば `as unknown as` 不要。runtime validation も不要 (= SDK 型が保証)
- **port interface 変更を含む** (#377): `AgentRunContext.emit` の event 名を `string` → string literal union に制約する = core/port 変更を伴う。spec-change として扱う
