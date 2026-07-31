# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: Design decisions (D1–D7) への適合

| Decision | Evidence |
|----------|----------|
| D1: `request prompt` は決定的な静的出力コマンド | `src/core/command/request-prompt.ts` に同期関数 `executePrompt(): number` 実装。LLM / 認証 / config ロードの import なし（ソース確認）。`src/cli/command-registry.ts:386–391` に `prompt` subcommand が flags なし / requiresRepo なしで配線。 |
| D2: 雛形知識源は `buildScaffoldTemplate` 一本 | `request-prompt.ts:11` が `buildScaffoldTemplate` を `./request.js` から import。独自雛形本文なし。TC-003 で import 構造アサーション済み。 |
| D3: 生成一本鎖と port / adapter impl を削除 | 5 ファイル（`request-create.ts` / `generator.ts` / `request-generate-system.ts` / `one-shot-query-client.ts` port+adapter）が存在しないことを確認。`manager.ts` は `list` / `resolve` のみに縮小済み。`port/index.ts` に `OneShotQueryClient` 系 re-export なし。 |
| D4: `"request-generate"` usage リテラル残置 | `src/core/usage/types.ts:11` に `"request-review" \| "request-generate" \| "job"` が残存。 |
| D5: `query-one-shot.ts` は削除しない | `src/adapter/claude-code/query-one-shot.ts` が存在することを確認。 |
| D6: B-18 の歯を `tests/unit/architecture/` に追加 | `request-entrance-llm-boundary.test.ts` が grep-based 様式で `src/core/request/` と `src/core/command/request-*.ts` を対象に LLM 系 port / adapter import 禁止を検査（7 パターン × 2 スコープ）。sabotage simulation（tmpDir 書き込み + grep）で検知機構の実在を regression guard で固定。 |
| D7: 残存参照ガードと docs / usage 追随 | `src/` / `docs/` に `OneShotQueryClient` / `request-generate-system` / `request generate` の参照が 0 件であることを grep で確認。`docs/request-authoring.md` に `request prompt` の知識注入フロー説明追記済み。CLI USAGE に `request prompt` を Request commands として列挙、`request generate` 行は除去済み。 |

### J2: Spec requirements (SHALL/MUST) への適合

| Requirement | Verdict |
|-------------|---------|
| R1: `request prompt` が決定的な起票プロンプトを stdout に出力する | `buildRequestPrompt()` が (a) 起票規律・(b) `buildScaffoldTemplate` 雛形・(c) `specrunner request validate` 自己検証指示の 3 部を出力。6 必須セクション・type 選択規律・自己検証指示を TC-001 でアサーション済み。`architecture/` 参照なしを TC-015 で確認。exit 0 を TC-002 で確認。 |
| R2: 雛形の知識源は単一 | `request-prompt.ts` / `request.ts` が共に `buildScaffoldTemplate` を消費。TC-003 が import 構造と行動（出力の部分文字列一致）で確認。 |
| R3: `request generate` とその一本鎖は廃止される | 生成一本鎖 5 ファイル削除済み。`specrunner request generate` が `Unknown request subcommand: generate` を返し exit 2 になることを `removed-commands.test.ts` TC-004 で確認。`"request-generate"` リテラルは `types.ts` に残置。 |
| R4: request 系入口は LLM 系 port / adapter を import しない（B-18 の歯） | `request-entrance-llm-boundary.test.ts` が 2 スコープ × 7 パターン = 14 アサーションで 0 件を検査。verification で全 green 確認。sabotage 検知機構も regression guard で固定。 |
| R5: docs と CLI usage が新しい入口を案内する | CLI USAGE に `request prompt` 記載・`request generate` なし。`docs/request-authoring.md` に `request prompt` の知識注入フロー説明あり。TC-007 でアサーション済み。 |

### J3: Acceptance criteria (request.md) への適合

| Criterion | Status |
|-----------|--------|
| B-18 の import 検査テストが `tests/unit/architecture/` に存在し sabotage で red になる | ✅ |
| `request prompt` の stdout に 6 必須セクション・type 選択規律・validate 自己検証指示が含まれることをテストで固定 | ✅ |
| `request prompt` が network / LLM / 認証なしで exit 0 する（決定的）ことをテストで固定 | ✅ |
| 雛形の知識源が単一（同一モジュール消費）を import 構造で保証 | ✅ |
| `src/` と `docs/` に廃止シンボルへの参照が残らない | ✅ |
| prompt-skeleton drift-guard から request-generate エントリが除去され green | ✅（`ALL_14_AGENT_PROMPTS` / `toBe(14)`、`request-generate-system` import なし） |
| generate 系テストの削除を除き既存テストは無変更で green | ✅（654 test files, 9790 tests passed） |
| `typecheck && test` が green | ✅（verification-result.md で全フェーズ passed 確認） |

### J4: Tasks の完了確認

全タスク（T-01〜T-09）の全チェックボックスが `[x]` であることを tasks.md で確認。

## 検証できなかった項目

None。全項目を実装・テストコード・grep・verification-result.md から機械的に確認できた。

## Findings 詳細

None（指摘なし）。
