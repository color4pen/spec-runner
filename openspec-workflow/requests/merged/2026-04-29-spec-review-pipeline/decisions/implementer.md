# Implementer Decisions

## 実装上の判断記録

### 1. `runProposePipeline` の削除 vs 薄いラッパー保持

既存の `pipeline.test.ts` が `runProposePipeline` を直接 import しているため、完全削除すると既存テストが壊れる :: `module-analysis.md` は削除を推奨しているが、既存テストの後方互換を維持するために `@deprecated` 薄いラッパーとして残す。内部 API のため将来の PR で削除可能。

### 2. `runRunCore` + `runRun` の分離

`run.ts` を `runRunCore`（exit code を return）と `runRun`（process.exit を呼ぶ）に分離した :: `process.exit` のモック時に thrown error が `run.ts` 内の `try/catch` に捕捉され exit code 1 になる問題を回避するため。`runRunCore` は直接 exit code を返すため、テストから `process.exit` モックなしに検証可能。

### 3. `runSpecReviewStep` の throw 時に `err.state` を付与

`runSpecReviewStep` が `failJobState` 後に throw する際、`(err as any).state = state` で失敗後の状態をエラーに付与する :: `runPipeline` の catch ブロックがエラーを受け取っても最終的な state（`status: "failed"`）を返せるようにするため。`state` 変数はエラー発生時点では更新前の値を保持しており、失敗状態を呼び出し元に正確に伝えるにはエラーオブジェクトへの付与が最もクリーン。

### 4. `system_prompt` パラメータの削除

`createSession` に `system_prompt` フィールドを渡していたが、`SessionCreateParams` 型に存在しないためコンパイルエラーが発生 :: SDK の `sessions.create` は `system_prompt` を受け付けない。spec-review エージェントへの役割指示はセッション作成時の初回メッセージで行うか、エージェント定義に組み込む必要がある。今回は `buildSpecReviewInitialMessage` で役割を伝える設計のため問題なし。

### 5. CLI テストの実装方針（module mock 汚染回避）

`vi.mock` によるモジュールモックを使わず、`simulateRunOutput` 関数でロジックを直接テストする方針を採用 :: Bun の Vitest 互換実装では `vi.mock` が同一テストプロセス全体に影響し、他テストファイルのモジュールが汚染される問題があった。`runRunCore` の verdict 出力ロジックを独立した `simulateRunOutput` 関数として分離してテストすることで、モジュールモックに依存しない安定したテストを実現。

### 6. 動的 import を静的 import に統一

`propose.ts` で動的 `import("../../state/store.js").then(...)` を使っていたが静的 `import` に置換 :: `constraints.md` の「同一モジュールからの import は静的 import に統一する」制約に準拠するため。
