# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-05 の全チェックボックスが [x] 済み |
| design.md | ✅ | D1〜D4 の全決定が実装に反映されている |
| spec.md | ✅ | 全 4 Requirement (SHALL/MUST) と全 Scenario がコード・テストで充足 |
| request.md | ✅ | 全 5 受け入れ基準を充足。typecheck/test green を verification-result.md で確認 |

## Detail

### tasks.md — T-01〜T-05 全完了

T-01 から T-05 の全チェックボックスが `[x]` でマークされていることを確認。

### design.md — D1〜D4 実装確認

| Decision | 実装確認 |
|----------|---------|
| D1: `saveConfig` の `github` strip 除去 | `src/config/store.ts` の `saveConfig` に `delete toSave["github"]` が存在しない。`agent` / `timeout` / `anthropic` の strip は維持 |
| D2: `init` の config 存在チェック | `fs.access(configPath)` で存在確認。`configExists = true` の分岐で `loadConfig` / `saveConfig` を呼ばない。project scaffold コードは分岐外で常時冪等実行 |
| D3: `login` の config 存在チェック | `fs.access(configPath)` で存在確認。存在する場合は `saveConfig` を呼ばない。`saveCredentials` は分岐外で常時実行 |
| D4: stale コメント修正 | "without github field" の文字列が `src/cli/login.ts` に存在しない。新コメントが実装を正確に説明 |

### spec.md — 全 Requirement 充足

**Req 1: saveConfig shall not strip the github field**
- `delete toSave["github"]` が `store.ts` から削除済み ✅
- legacy fields (`agent` / `timeout` / `anthropic`) の strip は維持 ✅
- Scenario "GHES config survives saveConfig" → `store.test.ts` TC-001 でカバー ✅
- Scenario "Legacy fields are still stripped" → `store.test.ts` TC-002 でカバー ✅

**Req 2: init shall not overwrite an existing global config**
- `fs.access` check + `configExists` 分岐で `loadConfig` / `saveConfig` を回避 ✅
- project scaffold は分岐外で冪等実行 ✅
- Scenario "First-time init creates global config" → 既存テスト群でカバー ✅
- Scenario "Repeated init does not overwrite" → TC-011 追加ケース + `config-write-hygiene` テスト でカバー ✅
- Scenario "Project scaffold is created regardless" → T-01 "config が存在する場合でも project scaffold は作成される" でカバー ✅

**Req 3: login shall not overwrite an existing global config**
- `fs.access` check で存在確認。存在する場合は `saveConfig` をスキップ ✅
- `saveCredentials` は条件外で常時実行 ✅
- Scenario "login with no existing config creates scaffold" → TC-LOGIN-015 でカバー ✅
- Scenario "login with existing config preserves it" → TC-LOGIN-014 でカバー ✅

**Req 4: login.ts stale comment shall be updated**
- "without github field" が `src/cli/login.ts` に存在しないことを grep で確認 ✅
- Scenario "Stale comment is absent after the change" → 充足 ✅

### request.md — 受け入れ基準

| 基準 | 充足 |
|------|------|
| GHES host 設定が `init` / `login` 実行後も消えない | ✅ D1+D2+D3 の組み合わせ、テストカバー済み |
| global config が存在する状態で `init` を実行してもファイルが書き換わらない | ✅ TC-011 "2 回目実行後も config.json のコンテンツが変わらない" |
| global config が存在する状態で `login` を実行しても config が書き換わらない | ✅ TC-LOGIN-014 |
| global config が存在しない状態で `init` / `login` を実行すると scaffold が生成される | ✅ 既存 init テスト群 + TC-LOGIN-015 |
| `typecheck && test` が green | ✅ verification-result.md に build/typecheck/test/lint すべて passed を記録 |

### 備考

- `init.ts` の `delete runtime` / `delete anthropic` は `!configExists` 分岐内に残存するが、request.md の "スコープ外" に明記されており、新規 scaffold 生成時にのみ実行されるため問題なし。
- スコープ外事項（`managed setup` / `managed reset`、`saveProjectConfig`）に変更なし。
