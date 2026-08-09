# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: tasks.md への適合（全チェックボックス完了）

全タスクが `[x]` でマーク済みであることを確認。実装を直接検査し照合した。

- **T-01**: 非 design step 13 箇所の const を grep で確認。すべて `"claude-sonnet-5"` に更新済み。
- **T-02**: `src/core/step/design.ts` の `DESIGN_AGENT_MODEL = "claude-opus-5"`（`[1m]` なし）を確認。
- **T-03**: `PROVIDER_DEFAULTS.anthropic.defaultModel = "claude-sonnet-5"`, `designModel` プロパティ不在, `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-5"` を確認。model-registry.ts のコメントに旧モデル名なし（registry key 行のみ残存）を確認。
- **T-04**: `src/cli/init.ts:117` コメントが `claude-opus-5` を参照。`src/core/step/test-case-gen.ts:21` Design D2 注記が `claude-sonnet-5`（設計根拠「Opus is overkill」維持）。`src/core/command/reviewers-new.ts:25` scaffold 例が `# model: claude-sonnet-5`。いずれも確認済み。
- **T-05**: 更新すべき 3 ファイルの expectation を確認（model-registry.test.ts:102, init.test.ts:40/102/499/514, test-case-gen-step.test.ts:68/70）。据え置き対象の init.test.ts 行 527（fixture）・行 539（preserve 期待値）が `"claude-sonnet-4-6"` のまま不変であることを確認。
- **T-06**: grep 2 種を実行し期待結果を確認（下記参照）。verification-result.md で build/typecheck/test すべて passed を確認。

### J2: spec.md への適合

各 Requirement および Scenario を実装と照合した。

- **Req: 非 design step の built-in 既定は claude-sonnet-5**: 13 step すべての const が `"claude-sonnet-5"` であり、旧値 `"claude-sonnet-4-6"` は残存しない。`tests/anthropic-step-model-refresh.test.ts` TC-001/TC-002 がこれを assert し、テストは green。
- **Req: design step の built-in 既定は claude-opus-5（[1m] なし）**: `DESIGN_AGENT_MODEL = "claude-opus-5"`。TC-003 が値・`[1m]` 不在・旧値否定をすべて assert。
- **Req: anthropic init scaffold は claude-sonnet-5 を書き steps.design を省略**: `runInit` integration test（TC-004）で `steps.defaults.model = "claude-sonnet-5"` かつ `steps.design = undefined` を確認。init.test.ts の preserve test（行 539）も不変で green。
- **Req: one-shot fallback は claude-sonnet-5**: `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-5"`。TC-006 が assert。
- **Req: 新既定モデルが registry で解決可能**: `BUILTIN_MODEL_REGISTRY` に `claude-sonnet-5`（line 24）・`claude-opus-5`（line 23）が存在。TC-007 が `resolveProvider` を呼び `"anthropic"` を返し例外なしを確認。旧モデル key の backward-compat も TC-008 が確認。

### J3: design.md 設計判断への適合

- **D1（一括更新）**: 13 const がすべて同一値 `"claude-sonnet-5"` に更新。世代混在なし。
- **D2（opus-5, [1m] なし）**: `"claude-opus-5"` 厳密一致、`[1m]` サフィックスなし。
- **D3（designModel 省略維持）**: `PROVIDER_DEFAULTS.anthropic` に `designModel` プロパティが存在しない（`undefined`）。TC-009 が assert。コメント内モデル名も更新済み。
- **D4（DEFAULT_ONE_SHOT_MODEL 更新）**: `"claude-sonnet-5"` に更新。
- **D5（コメント追随、設計根拠保持）**: 3 コメントサイトすべてで旧モデル名が消え新モデル名に追随、設計根拠の文言は維持。
- **D6（registry key 据え置き、grep 精緻化）**: registry key 行（lines 18–20）は旧モデル名を保持。default 定数・コメントには旧モデル名なし。T-06 コマンドで確認。
- **D7（preserve 系は据え置き）**: init.test.ts 行 527（input fixture）・行 539（preserve expectation）は `"claude-sonnet-4-6"` のまま。テスト green を確認。

### J4: request.md 受け入れ基準への適合

- **AC1（grep で旧文字列残存なし）**: `src/core/step/` および `src/core/command/` で旧モデル文字列 0 件を live grep で確認。`src/config/model-registry.ts` では registry key 行のみ残存（default 定数・コメントに旧モデル名なし）。`src/cli/init.ts` も旧モデル名 0 件。
- **AC2（既存テスト green、期待値更新は許容 3 ファイルのみ）**: 全 11083 テスト pass（1 skipped）。更新は許容 3 ファイルの expectation のみ。init.test.ts の fixture 行・preserve 期待値は不変。
- **AC3（typecheck && test が green）**: verification-result.md: typecheck passed（0 errors）、test passed（11083/11083）。

## T-06 grep 実行結果

```
# step/command: 0 件
$ grep -rnE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' \
    src/core/step src/core/command --include='*.ts' | grep -v '__tests__'
(no output — 0 hits)

# config: registry key 行のみ
$ grep -nE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' \
    src/config/model-registry.ts
18:  "claude-opus-4-6[1m]": { provider: "anthropic" },
19:  "claude-sonnet-4-6": { provider: "anthropic" },
20:  "claude-sonnet-4-5": { provider: "anthropic" },

# init.ts: 0 件
$ grep -n 'claude-opus-4-6\|claude-sonnet-4-6\|claude-sonnet-4-5' src/cli/init.ts
(no output — 0 hits)
```

## 検証できなかった項目

None — 全項目を静的解析・grep・verification-result.md で確認済み。

## Findings 詳細

None。すべての要件・設計判断・受け入れ基準に適合している。
