# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーションの事実確認

**アサーション 1: `src/adapter/claude-code/agent-runner.ts:627,638`**
- 確認方法: ファイルを offset=620 で読み出し
- 結果: 実際のループ開始は line 626 (`for await (const message of ...)`), line 627 は最初のループ本体文 (`emitToolProgress`)、line 638 が `if (isToolUse(message))` ✅
- ループ観測点として利用可能という説明は正確

**アサーション 2: `src/adapter/claude-code/message-types.ts:34-35`**
- 確認方法: ファイル全文読み出し
- 結果: line 34 に `type: "content_block_start";`、line 35 に `content_block: { type: "tool_use"; name: string; input?: Record<string, unknown> };` が存在 ✅
- `isToolUse` が `content_block_start` を narrow し、`input` が partial (`{}`) であり得るという記述は正確

**アサーション 3: `src/adapter/shared/artifact-bundle.ts`**
- 確認方法: ファイル全文読み出し
- 結果: `buildArtifactBundle` は size 超過時 `""` を返す (fail-open)、`changeFolderPath(slug)` でパスを構築、`INPUT_ARTIFACT_NAMES` のみ対象 ✅
- MAX_ARTIFACT_BUNDLE_BYTES = 64KB（本 request の注入上限 16KB とは異なるが、同パターン）

**アサーション 4: `src/adapter/claude-code/agent-runner.ts:462-464`**
- 確認方法: ファイルを offset=455 で読み出し
- 結果: line 462 に `buildArtifactBundle` 呼び出し、line 463 に `artifactSection` 組み立て、line 464 に `buildAdditionalInstructions` ✅
- `baseFullPrompt` への `artifactSection` 挿入パターンが確立済み

**アサーション 5: `src/adapter/codex/agent-runner.ts:335-336`**
- 確認方法: ファイルを offset=328 で読み出し
- 結果: line 335 に `buildArtifactBundle`, line 336 に `artifactSection` ✅
- codex adapter も同一パターン

### Step 2: 技術的実現可能性の検証

**"完全な input が得られる message 種別" の確認**
- `@anthropic-ai/claude-agent-sdk/sdk.d.ts` の `SDKMessage` 型 union を確認
- `SDKAssistantMessage` (`type: 'assistant'`) が存在し、`message: BetaMessage` フィールドで完全な会話ターンを保持
- `BetaMessage.content` に `ToolUseBlock[]` が含まれ、各 block の `input` は解析完了済み JSON
- これが「streaming の `content_block_start` に依らず完全な input が得られる message 種別」に該当 ✅

**Read の allowedTools 問題**
- line 574-579: `Edit`/`Write` は `allowedTools` から除外されており `canUseTool` 経由
- `Read` は `allowedTools` に含まれており `canUseTool` を**バイパス**する
- これは message stream 観測で解決（`SDKAssistantMessage` はすべてのツール呼び出しを含む）✅
- request が "SDK message stream から記録" を指定しているのは正当

**state schema 検証**
- `src/state/schema/types.ts` の `StepRun`, `JobState` を確認
- `StepRun` に任意の optional フィールドを追加するパターンが多数存在（`modelUsage`, `commitOid`, `addedTurns` 等）
- `AgentRunResult` に optional field を追加して StepExecutor 経由で state に書く既存パターンも確認

**resume 経路**
- `state.json` に格納されるため resume 後も自動で保持される ✅
- in-memory → `persistJob()` → disk の一元フローで既知の "別 store 追記で巻き戻る" 問題を回避 ✅

### Step 3: 受け入れ基準の評価

- 記録の unit test（4 項目）: 明確かつ実装可能 ✅
- 注入の unit test（3 項目）: 明確 ✅
- resume 経路の test: 明確 ✅
- 既存 buildMessage テスト無改変: 妥当な回帰ガード ✅
- typecheck && test green: 標準ゲート ✅

## 検証できなかった項目

- 実際の `@anthropic-ai/claude-agent-sdk` の `SDKAssistantMessage` が当該 job 内で実際に emit されるかの動的確認（型定義からは確認済み）
- 100 件キャップが現実の step で実際に到達するかの実測

## Findings 詳細

### Finding 1: "完全な input が得られる message 種別" が request に明記されていない（Low / fixable）

**要件 1** は「streaming の `content_block_start` は input が部分的であり得るため、それを根拠にしない」と制約するが、代わりに何を使うかを明示していない。  
SDK の `SDKAssistantMessage`（`type === 'assistant'`、フィールド `message: BetaMessage`）が正解であり、型定義から発見可能。しかし実装者が誤って `content_block_delta` 累積や別のアプローチを取るリスクがある。  
**推奨**: 設計判断セクションに「`SDKAssistantMessage`（type: 'assistant'）を観測点とする」を一行追記する。ただし SDK 型から自己解決可能であるため blocking ではない。

### Finding 2: `AgentRunResult` への `touchedFiles` 追加が未明示（Low / fixable）

touched files をアダプタから StepExecutor へ渡す経路として `AgentRunResult` への optional フィールド追加が自然だが、request に明記されていない。既存パターン（`addedTurns`, `invocationMetrics` 等）で自己解決可能。
