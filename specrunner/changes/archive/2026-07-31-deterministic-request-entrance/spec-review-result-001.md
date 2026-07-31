# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### Spec ファイル全体の照合
- `request.md` / `design.md` / `tasks.md` / `spec.md` を全文精読し、相互整合性・コードベース前提の正確性を確認した。

### コードベース前提の照合（request.md § 現状コードの前提）
- `src/cli/command-registry.ts:76,389` — `generate` サブコマンドと USAGE 文字列の `request generate "<text>"` の存在を確認 ✓
- `src/core/command/request-create.ts` — `executeCreate(text, opts, client: OneShotQueryClient)` の存在を確認 ✓
- `src/core/request/manager.ts:5,10` — `create` / `generator.generate` 呼び出しを確認 ✓
- `src/core/request/generator.ts:5,20` — `REQUEST_GENERATE_SYSTEM_PROMPT` import および `appendInvocation` 呼び出しを確認 ✓
- `src/prompts/request-generate-system.ts` — `buildSystemPrompt` 使用の約 90 行 system prompt を確認 ✓
- `src/core/port/one-shot-query-client.ts` / `src/adapter/claude-code/one-shot-query-client.ts` — port + adapter の存在、消費者が上記一本鎖のみであることを `src/core/port/index.ts` で確認 ✓
- `src/core/usage/types.ts:11` — `"request-review" | "request-generate" | "job"` union を確認 ✓
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts:68,121` — `REQUEST_GENERATE_SYSTEM_PROMPT` import および `ALL_15_AGENT_PROMPTS` への収録（TC-028 が `.length === 15` を assert）を確認 ✓
- `buildScaffoldTemplate` が `src/core/command/request.ts` に存在し、`executeTemplate` / `executeNew` が消費していることを確認 ✓

### 既存 prompt-coverage テストとの照合（T-07 対象範囲）
- `tests/unit/prompts/common-context-catch.test.ts:23,36,42` — `REQUEST_GENERATE_SYSTEM_PROMPT` の import・`ALL_AGENT_PROMPTS` エントリ・`expect(ALL_AGENT_PROMPTS.length).toBe(11)` の存在を確認 ✓
- `tests/unit/prompts/fragment-coverage.test.ts:25,40` — 同 import・エントリの存在を確認 ✓（明示的カウント assert なし）
- `tests/unit/rules-md.test.ts:23,36` — 同 import・エントリの存在を確認 ✓（describe 名に "11" があるが assert ではない）
- `tests/unit/cli/removed-commands.test.ts:38` — `request-create.js` の `vi.mock` 行の存在を確認 ✓

### アーキテクチャ整合性
- 既存 B-1（`core-invariants.test.ts`）が `src/core/` の adapter import を禁止していることを確認。B-18 はその補完（LLM 系 port 名および adapter ディレクトリ指定）であることを確認 ✓
- `src/core/port/index.ts` で `OneShotQueryClient` を re-export している行の存在を確認（T-03 削除対象）✓
- `tests/unit/architecture/` ディレクトリに既存 `core-invariants.test.ts` / `module-boundary.test.ts` があり、B-18 テスト追加の雛形として利用可能なことを確認 ✓

### セキュリティ観点の確認（OWASP Top 10 適用範囲）
- `request prompt` はフラグなし・引数なし・LLM 呼び出しなし・ファイル書き込みなし・認証なしの静的出力コマンドであり、入力制御不備（A01）・インジェクション（A03）のリスクなし ✓
- `OneShotQueryClient` 削除により LLM API 認証情報の使用経路が 1 つ減少し、セキュリティ設定の暴露面が縮小する（A05 正の変化）✓
- B-18 の歯が将来の LLM import 混入を構造的に検知する（前向きな制御）✓

### Drift-guard TC-025 / TC-028 対応確認
- TC-025 ブロックが `prompt-skeleton-drift-guard.test.ts:747–770` にあることを確認 ✓
- TC-028 が `ALL_15_AGENT_PROMPTS.length === 15` を assert しており、tasks.md T-07 が 14 への更新を明記していることを確認 ✓

### docs 追随確認
- `docs/request-authoring.md` に現在 `request generate` の記載がなく、T-08 の主作業は `request prompt` の追記であることを確認 ✓

## 検証できなかった項目

- `src/adapter/claude-code/query-one-shot.ts` の型定義が `ClaudeCodeOneShotQueryClient` 削除後も port 型に依存しないことの実行時確認（D5 の rationale を静的に確認し問題なしと判断したが、実際の typecheck は未実行）
- drift-guard `extractSection` 関数の実装詳細（TC-025 削除の影響がないことは文脈から判断）

## Findings 詳細

### F-01: tasks.md T-07 — `common-context-catch.test.ts` のカウントアサーション更新が未記載

`tests/unit/prompts/common-context-catch.test.ts:42` に以下のアサーションが存在する:

```typescript
expect(ALL_AGENT_PROMPTS.length).toBe(11);
```

tasks.md T-07 は同ファイルに対して `:23 import / :36 エントリ` の除去のみを指示する。REQUEST_GENERATE エントリ除去後は `ALL_AGENT_PROMPTS.length === 10` となり、このアサーションは **red** になる。

参照:
- `tasks.md` T-07: `tests/unit/prompts/common-context-catch.test.ts`（:23 import / :36 エントリ）
- `tests/unit/prompts/common-context-catch.test.ts:42`

**補足**: T-09 の `typecheck && test` 受け入れ基準が最終的な安全網であり、実装者は T-09 で発見できる。しかし task 指示として不完全であり、実装後のデバッグコストが生じる可能性がある。修正は `toBe(11)` を `toBe(10)` へ更新する 1 行変更で足りる。

drift-guard（TC-028）の count 更新（15→14）は tasks.md T-07 に明記されているため問題なし。`rules-md.test.ts` / `fragment-coverage.test.ts` には明示的カウント assert がないため問題なし。

---

### Observations（情報、アクション不要）

**O-01: `request.ts`（ハイフンなし）は B-18 の `request-*.ts` glob 対象外**

設計 D6 が "request 要件がこの pattern を明示しているため踏襲する" として明示的に認識・受容。`request.ts`（`executeTemplate` / `executeValidate`）は現在 LLM import を持たず実害なし。将来追加された場合も B-1（adapter import 禁止）が部分的に機能する。

**O-02: `OneShotQueryClient` は B-18 禁止リストに未収録（T-06 が補完）**

B-18 の禁止対象は `AgentRunner` / `SessionClient` / `AnthropicClient` と adapter ディレクトリのみであり、`OneShotQueryClient` 同名での再導入は B-18 では検知されない。ただし T-06 残存参照ガードが `src/` / `docs/` での `OneShotQueryClient` 文字列を 0 件要求するため、同名再導入は即 red になる。実質的な安全網は T-06 が担う。

**O-03: `queryOneShot`（D5）が production dead code として残留**

設計 D5 が明示的に受容した既知のトレードオフ。`query-one-shot.ts` は export 関数かつ独自 unit test から参照されるため typecheck / lint / coverage は破綻しない。将来の別 request での撤去が望ましい旨 design.md に記載済み。
