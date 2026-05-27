# Test Cases: agent-env-allowlist

## TC-ENV-01 — denylist key が除去される（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/1.3(a), request/受け入れ基準1

**GIVEN** `GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` を含む env object がある  
**WHEN** `stripSecrets(env)` を呼ぶ  
**THEN** 返却 object に `GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` が存在しない

---

## TC-ENV-02 — denylist 外の key は保持される（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/1.3(b), request/受け入れ基準3

**GIVEN** `PATH`, `HOME`, `NODE_ENV` など denylist に含まれない key を持つ env object がある  
**WHEN** `stripSecrets(env)` を呼ぶ  
**THEN** 返却 object に `PATH`, `HOME`, `NODE_ENV` がそのままの値で残っている

---

## TC-ENV-03 — 元の env object が変更されない（immutability）（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/1.3(c)

**GIVEN** `GITHUB_TOKEN` を含む env object `original` がある  
**WHEN** `stripSecrets(original)` を呼ぶ  
**THEN** `original.GITHUB_TOKEN` は元の値のまま変わっていない（shallow copy で返し、元 object を mutate しない）

---

## TC-ENV-04 — denylist key が元から存在しない場合もエラーにならない（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/1.3(d)

**GIVEN** `GITHUB_TOKEN` などの denylist key を一切含まない env object がある  
**WHEN** `stripSecrets(env)` を呼ぶ  
**THEN** 例外が発生せず、他の key をそのまま含む object が返る

---

## TC-ENV-05 — `SECRET_DENYLIST` が named export されている（should）

- **Category**: Unit
- **Priority**: should
- **Source**: design/D1

**GIVEN** `src/util/env-filter.ts` が存在する  
**WHEN** `SECRET_DENYLIST` を import する  
**THEN** 4 要素（`GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`）を持つ readonly 配列が得られる

---

## TC-SPAWN-01 — spawnCommand が子プロセスに GITHUB_TOKEN を渡さない（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/1.4(e), request/受け入れ基準1

**GIVEN** `process.env.GITHUB_TOKEN` に値がセットされている  
**WHEN** `spawnCommand()` で `echo $GITHUB_TOKEN` を実行する  
**THEN** 子プロセスの stdout が空文字列（GITHUB_TOKEN が展開されない）

---

## TC-SPAWN-02 — spawnCommand が子プロセスに ANTHROPIC_API_KEY を渡さない（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/1.4(e), request/受け入れ基準1

**GIVEN** `process.env.ANTHROPIC_API_KEY` に値がセットされている  
**WHEN** `spawnCommand()` で `echo $ANTHROPIC_API_KEY` を実行する  
**THEN** 子プロセスの stdout が空文字列

---

## TC-SPAWN-03 — opts.env で明示的に渡した変数は子プロセスから見える（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/1.4(f), request/受け入れ基準3

**GIVEN** `opts.env` に `MY_CUSTOM_VAR=hello` を渡す  
**WHEN** `spawnCommand()` で `echo $MY_CUSTOM_VAR` を実行する  
**THEN** 子プロセスの stdout が `hello`

---

## TC-SPAWN-04 — opts.env は stripSecrets 後に merge される（must）

- **Category**: Unit
- **Priority**: must
- **Source**: design/D2, request/受け入れ基準3

**GIVEN** `process.env.GITHUB_TOKEN` に値がセットされており、`opts.env` に `PATH` 拡張が含まれる  
**WHEN** `spawnCommand()` を呼ぶ  
**THEN** 子プロセスに `GITHUB_TOKEN` は渡らず、`opts.env` の `PATH` は有効になっている

---

## TC-SPAWN-05 — 既存テスト TC-33 / TC-34 が引き続き通る（must）

- **Category**: Regression
- **Priority**: must
- **Source**: tasks/1.4

**GIVEN** spawn.test.ts の既存テスト TC-33 / TC-34 がある  
**WHEN** `bun run test` を実行する  
**THEN** TC-33 / TC-34 が green のまま

---

## TC-SDK-01 — agent-runner の queryOptions に filtered env が渡される（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/2.1, request/要件3

**GIVEN** `process.env` に `ANTHROPIC_API_KEY` がセットされている  
**WHEN** `agent-runner.ts` の `queryOptions` を構築する  
**THEN** `queryOptions.env` に `ANTHROPIC_API_KEY` が含まれない

---

## TC-SDK-02 — agent-runner の queryOptions で denylist 外の env 変数は保持される（should）

- **Category**: Unit
- **Priority**: should
- **Source**: tasks/2.1, design/D3

**GIVEN** `process.env` に `HOME` がセットされている  
**WHEN** `agent-runner.ts` の `queryOptions` を構築する  
**THEN** `queryOptions.env.HOME` が元の値のまま存在する

---

## TC-SDK-03 — local.ts の buildSdkOptions に filtered env が渡される（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/2.2, request/要件4

**GIVEN** `process.env` に `SPECRUNNER_API_KEY` がセットされている  
**WHEN** `buildSdkOptions()` を呼ぶ  
**THEN** 返却 options の `env` に `SPECRUNNER_API_KEY` が含まれない

---

## TC-VER-01 — verification commands の spawn が GITHUB_TOKEN を渡さない（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/3.1, request/受け入れ基準2

**GIVEN** `process.env.GITHUB_TOKEN` に値がセットされている  
**WHEN** `verification/commands.ts` の `spawnCommand()` で `sh -c "echo $GITHUB_TOKEN"` を実行する  
**THEN** stdout が空文字列

---

## TC-VER-02 — verification commands の spawn で PATH 拡張が機能する（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/3.1, request/受け入れ基準3

**GIVEN** `verification/commands.ts` が `PATH` に `node_modules/.bin` を追加するロジックを持つ  
**WHEN** `spawnCommand()` を呼ぶ  
**THEN** 子プロセスの `PATH` に `node_modules/.bin` が含まれる（PATH 拡張が stripSecrets 後も維持される）

---

## TC-VER-03 — spawnScript fallback が ANTHROPIC_API_KEY を渡さない（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/3.2, request/要件6

**GIVEN** `process.env.ANTHROPIC_API_KEY` に値がセットされており、`verification.commands` が未設定（fallback 経路）  
**WHEN** `verification/runner.ts` の `spawnScript()` が呼ばれる  
**THEN** 子プロセスに `ANTHROPIC_API_KEY` が渡らない

---

## TC-VER-04 — spawnScript fallback が SPECRUNNER_API_KEY を渡さない（must）

- **Category**: Unit
- **Priority**: must
- **Source**: tasks/3.2, request/要件6

**GIVEN** `process.env.SPECRUNNER_API_KEY` に値がセットされており、fallback 経路が使われる  
**WHEN** `verification/runner.ts` の `spawnScript()` が呼ばれる  
**THEN** 子プロセスに `SPECRUNNER_API_KEY` が渡らない

---

## TC-TYPE-01 — typecheck が通る（must）

- **Category**: Build
- **Priority**: must
- **Source**: tasks/1.5, 2.3, 3.3, request/受け入れ基準5

**GIVEN** 全実装変更が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-TEST-01 — 全テストが green（must）

- **Category**: Build
- **Priority**: must
- **Source**: tasks/1.5, 2.3, 3.3, request/受け入れ基準5

**GIVEN** 全実装変更が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが green（既存テスト + 新規ユニットテスト含む）

---

## TC-SCOPE-01 — ANTHROPIC_BASE_URL も除去される（must）

- **Category**: Unit
- **Priority**: must
- **Source**: request/要件2, design/D1

**GIVEN** `process.env.ANTHROPIC_BASE_URL` に値がセットされている  
**WHEN** `stripSecrets(process.env)` を呼ぶ  
**THEN** 返却 object に `ANTHROPIC_BASE_URL` が存在しない

---

## TC-SCOPE-02 — denylist 以外の secret 名に似た key は除去されない（could）

- **Category**: Unit
- **Priority**: could
- **Source**: design/D1（denylist 方式の境界確認）

**GIVEN** `process.env` に `GITHUB_TOKEN_EXTRA`, `MY_ANTHROPIC_API_KEY` など denylist と部分一致するが完全一致しない key がある  
**WHEN** `stripSecrets(process.env)` を呼ぶ  
**THEN** `GITHUB_TOKEN_EXTRA`, `MY_ANTHROPIC_API_KEY` は除去されず保持される（完全一致のみ除去）
