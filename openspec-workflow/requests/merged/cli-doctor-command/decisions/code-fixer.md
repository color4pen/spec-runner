# code-fixer decisions — cli-doctor-command (iter 2)

## Fix Decisions

- `--help`/`-h` を stdout + exit 0、空引数を stderr + exit 2 に分岐する :: spec cli-commands/spec.md MODIFIED Requirement は明示的に「stderr に USAGE を出力し exit 2」を要求している。既実装の単一 if は 2 つのケースを混在させており spec 違反だった

- `main()` を export し VITEST 環境外でのみ自動呼び出しするガードを追加する :: テストで `main()` を直接呼ぶために export が必要。auto-invoke はプロダクション実行時のみ行われるべきであり、テスト実行時に副作用が発生するのは望ましくない

- `DoctorContext` に `processVersion: string` と `platform: NodeJS.Platform` フィールドを追加し、`src/cli/doctor.ts` で `process.version` / `process.platform` から populate する :: constraints.md が「module-level の global 参照禁止」を定めており、core check が直接 `process.*` にアクセスするのはポートパターン違反。テストは env mock で偶発的に通過していただけで production path が global に漏れていた

- `src/core/doctor/checks/runtime/node.ts` の `ctx.env["process_version"] ?? process.version` を `ctx.processVersion` に置き換える :: 上記 DoctorContext 拡張に対応。env への文字列ベースのアクセスより型付きフィールドの方が型安全であり、global fallback を排除できる

- `src/core/doctor/checks/config/file-exists.ts` の `ctx.env["platform"] ?? process.platform` を `ctx.platform` に置き換える :: 同上。platform は NodeJS.Platform 型で持つことで win32 判定が型安全になる

- `_registry` module-level mutable cache を削除し `buildRegistry()` を check() 内で毎回呼ぶ :: constraints.md の「module-level mutable state を持たない」に違反。AgentRegistry.fromSteps() は純粋なデータ構築で I/O なし、コストは無視できる。並列セッション時の非決定論的挙動を防ぐ

- `openspec/changes/test-slug/pr-create-result.md` を削除する :: commit d005fb1 で混入したテスト実行アーティファクト。production change set に含めるべきでない。verification-result.md は先行 PR から存在するため今回のスコープ外とする

- `src/core/doctor/types.ts` の未使用 `import type * as nodeFsPromises` を削除する :: nodeFsSync.constants のみ参照しており、nodeFsPromises は不要な import

- `DoctorAnthropicClient` インタフェース（空 placeholder）を削除する :: 実装に使われておらず、fetch 直接利用が canonical transport として確立している。dead code がポート形状について誤解を招く

- `src/core/doctor/checks/runtime/openspec.ts` の `timeout: OPENSPEC_TIMEOUT_MS` execFile オプションを削除する :: `signal: controller.signal` で AbortController が既に timeout を管理しており、`timeout` オプションは冗長な second source。2 つが race する状態を解消する

- `openspec/changes/cli-doctor-command/proposal.md` の ADR ファイル名を `ADR-20260430-external-dependency-policy.md` に修正する :: design.md / tasks.md は既に正しいファイル名を参照しており、proposal.md が `{NNN}-` prefix の古い形式のまま不整合だった

- TC-079 を tautology（import 確認のみ）から `AgentRegistry.prototype.hashOf` spy による behavioral assertion に置き換える :: review-lessons.md が指摘する「tautology test」パターン。check() が実際に hashOf を呼ぶことを確認しないとリグレッション検出能力がない

## Fix Decisions (iter 2 — review-feedback-003 対応)

- `mock-context.ts` の `fetch: vi.fn()...` に `as unknown as typeof fetch` キャストを追加し、全テストサイトで同一キャストを適用する :: `DoctorContext.fetch` の型は `typeof globalThis.fetch` であり `vi.fn()` の返り値 `Mock<Procedure>` と構造的に互換しない。tsconfig の lib が ES2022 のみで現在ビルドが通っているのは dom 型が混入しないためだが、undici-types の型変更で将来 TS2741 が再発するリスクがある。`as unknown as typeof fetch` で一意の信頼された代入点を確立する

- `definition-drift.ts` のヒントを `'specrunner init --resync'` から `"Re-run 'specrunner init' to refresh agent definitions."` に変更する :: `--resync` フラグは `bin/specrunner.ts` の init パーサーに存在せず、実行すると silently ignored になる。存在しないコマンドをヒントに表示するのは誤誘導

- `old-state-files.ts` のヒントを `'specrunner gc'` から `Manually remove old .json files in <jobsDir>` に変更し、メッセージを `"${count} job state files found (more than ${GC_THRESHOLD})"` に修正する :: `gc` サブコマンドは存在せず `Unknown command: gc` (exit 2) になる。具体的な手動手順を示す。メッセージは境界値で曖昧だった表現を `count > threshold` の意味に合わせて修正

- `jobs-writable.ts` を祖先ディレクトリを再帰的に walk して最初の実在するディレクトリを W_OK チェックするよう修正する :: 新規ユーザーは `~/.local/share/specrunner` も存在しない状態で起動する可能性がある。現実装は 1 レベルのみ試みるため ENOENT の親を「not writable」と誤って fail する。祖先を walk して最初の実在祖先が writable なら warn を返す

- `git-repository.ts` を `existsSync('.git')` から `git rev-parse --is-inside-work-tree` に置き換える :: `.git` のみ確認する方式はサブディレクトリから呼ばれた場合に false-fail する。`git rev-parse` はリポジトリルートから何段階でも機能する

- `runDoctor` の戻り値を `Promise<void>` から `Promise<number>` に変更し、`process.exit` を呼び出し側 (`bin/specrunner.ts`) に移す :: `process.exit` を直接呼ぶと `runDoctor` の呼び出し元の try/catch が exit 2 を拾えず、stdout のフラッシュが保証されない。関数の責務をテスタブルな終了コード計算に限定し、exit はエントリポイントに委譲する

- `DoctorConfig` に `loadError?: string` フィールドを追加し、`loadConfig()` が例外を投げた場合にメッセージを伝搬する :: 現実装は `catch {}` でエラーを握りつぶすため、malformed JSON の場合に `config-file-exists` が pass し下流チェックが矛盾する結果を返す。loadError を介して `config-file-exists` が `"Config file is malformed: <reason>"` で distinct fail を返せるようにする

- bun.ts / git.ts / github-origin.ts / git-repository.ts の `{ timeout: 5000 }` を `{ signal: AbortSignal.timeout(5000) }` に統一する :: openspec.ts と auth チェックが `AbortSignal` 方式を使用しており、`timeout` オプションとの混在は保守性を下げる。`AbortSignal.timeout()` に統一することで一貫した timeout 実装になる
