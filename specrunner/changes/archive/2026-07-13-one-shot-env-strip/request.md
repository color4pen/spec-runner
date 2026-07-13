# one-shot SDK query の env を stripSecrets 経由に統一し、B-6 の歯を env-omission まで強める

## Meta

- **type**: spec-change
- **slug**: one-shot-env-strip
- **base-branch**: main
- **adr**: false

## 背景

構造不変条件 B-6 は「subprocess / SDK query に渡す env は必ず `stripSecrets` seam 経由」を要求する。step agent 実行（`agent-runner.ts`）はこれを守り、`env: stripSecrets(process.env)` を SDK query options に渡している。一方 one-shot 実行（`query-one-shot.ts`）は SDK query options に `env` キーを**一切渡しておらず**、SDK が親プロセスの `process.env`（`GH_TOKEN` / `ANTHROPIC_API_KEY` 等の credential を含む）をそのまま継承しうる。

これは B-6 が掲げる保証と不整合である。かつ **B-6 の歯（`core-invariants.test.ts`）は raw `process.env` 参照を grep するだけ**なので、「env キーを渡さない = env 参照を一行も書かない」env-omission を検出できない。これは B-12 が `node:child_process` 側で塞いだのと同型の「env 省略」盲点が、SDK query 側に残っている状態である。

現状の唯一の呼び出し元（request 生成 generator）は `allowedTools: []` / `maxTurns: 1` で走るためモデルが env を読み出す実 exploit 経路は無いが、契約の穴自体は実在し、将来 one-shot にツールを許す呼び出しが増えれば顕在化する。本 request は (a) one-shot の env を strip 経由に統一し、(b) 歯を env-omission まで強めて再発を防ぐ。

## 現状コードの前提

- `src/adapter/claude-code/query-one-shot.ts:130-141` — `fn({ prompt, options: { cwd, allowedTools, permissionMode, ...maxTurnsOption, model, systemPrompt, abortController } })`。**`env` キーが無い**
- `src/adapter/claude-code/agent-runner.ts:397, 453` — 参照実装。`const sdkEnv = stripSecrets(process.env as Record<string, string | undefined>)` を作り、query options に `env: sdkEnv` を渡す
- `src/util/env-filter.ts` — `stripSecrets(env)` は SECRET_DENYLIST（`GH_TOKEN` / `GITHUB_TOKEN` / `SPECRUNNER_API_KEY` / `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`）＋ パターン（`*_TOKEN` / `*_API_KEY` / `*_SECRET`）を除去
- `tests/unit/architecture/core-invariants.test.ts:342-363`（B-6 の歯）— `grepE("process\\.env", ...)` で raw 参照を検出し、`stripSecrets` を含む行は安全として除外。**env を省略した query site は grep に一切現れず検出対象外**
- `queryOneShot` は `queryFn?: QueryFn` を注入可能（テストで渡す options を捕捉できる）
- one-shot が SDK に渡す `permissionMode` は `"bypassPermissions"`（本 request では不変。env の扱いのみ対象）

## 要件

1. `queryOneShot` の SDK query options に `env: stripSecrets(process.env)` を渡す（`agent-runner.ts` と同一の strip 経路）。one-shot の他挙動（allowedTools / permissionMode / maxTurns / model / systemPrompt / timeout）は不変
2. one-shot の SDK query が受け取る env が **secret を除去し非 secret を保持している**ことをテストで固定する: 注入した `queryFn` が受け取る `options.env` に、事前設定した secret キー（例 `GH_TOKEN`）が**含まれず**、非 secret キー（例 `PATH`）が**含まれる**ことを assert する（env-omission 回帰ガード）
3. B-6 の歯を env-omission まで強める: 「SDK query を呼ぶ call-site は env を省略せず `stripSecrets` 由来の env を必ず渡す」ことを機械検出する。実装方式（grep 構造検査の拡張 / query site の behavioral 捕捉テスト）は design 判断
4. codex adapter・one-shot 以外の経路は挙動不変

## スコープ外

- `stripSecrets` の denylist → allowlist 化（別議論。本 request は既存 strip の適用範囲を one-shot に広げるのみ）
- one-shot の permissionMode / sandbox / ツール制限の変更
- agent-runner 側の env 扱い（既に B-6 準拠）
- `env` に明示値を注入する API（呼び出し元が個別 env を渡す機構）の追加

## 受け入れ基準

- [ ] `queryOneShot` の SDK query options に `env` が渡り、その値が `stripSecrets(process.env)` と一致する（注入 queryFn で options を捕捉して固定）
- [ ] 事前設定した secret（`GH_TOKEN` 等）が one-shot の SDK env に含まれず、非 secret（`PATH` 等）が含まれることをテストで固定する
- [ ] env-omission（query site が env を渡さない状態）を歯が red にすることを固定する（方式は design 判断だが、検出できることをテストで示す）
- [ ] 既存の B-6 の歯（raw process.env 検出）が無変更で green
- [ ] one-shot / codex の既存凍結テストが無変更で green
- [ ] `typecheck && test` が green

## 設計の方向（request 作成者の推奨・design step で確定する）

- **推奨（要件2・3）**: query site の **behavioral 捕捉テスト**を第一の歯にする。`queryOneShot`（および可能なら agent-runner）に注入した `queryFn` が受け取る `options.env` を捕捉し、secret 除去 + 非 secret 保持を assert する。grep では env-omission（不在）を頑健に検出しづらいため、実際に渡る値を凍結する方が確実で偽陰性が少ない
- **補完（任意）**: 構造 grep の歯を追加する場合は「SDK query options を構成するファイル（`agent-runner.ts` / `query-one-shot.ts`）に `env:` が存在する」ことを検査する形が候補。ただし options 構築が多様だと脆いため、behavioral 捕捉を主・grep を従とする
- **不採用**: one-shot 側で env を省略したまま「呼び出し元がツールを渡さない運用」に依存して塞いだことにする — 契約の穴を運用前提で覆う形になり、B-6 の「seam 経由」を構造で守る方針に反する
