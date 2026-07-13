# ADR-20260713: 常駐プロセスは `util/spawn.ts` seam 拡張で spawn し、B-12 allowlist を増やさない

**Date**: 2026-07-13
**Status**: accepted

## Context

local runtime で job 実行中に OS のアイドルスリープを抑止するため、`caffeinate` を job 全期間にわたって生存する常駐プロセスとして spawn する必要が生じた（issue #758）。

この要求に対して、既存の spawn 経路が2種類あった:

1. **`src/util/spawn.ts` の `spawnCommand`** — `close` イベントで resolve する await 型ヘルパー。buffers stdout/stderr を集約して返す短命コマンド専用であり、kill ハンドルを露出しない。常駐プロセスには使えない。
2. **新モジュールで `node:child_process` を直接 import する** — B-12 アーキ不変条件（`tests/unit/architecture/core-invariants.test.ts` + `arch-allowlist.ts`）が direct import を seam モジュールと縮小専用 allowlist に限定しており、新規エントリ追加は一方向 ratchet（allowlist は削除のみが正）に逆行する。

また、`acquirePowerAssertion` は `registerCleanup`（同期・fail-open 必須）から呼ばれるため、spawn の失敗（ENOENT 等）が例外として上に伝播してはならないという制約があった。

managed runtime（GitHub-hosted の短命実行）はアイドルスリープの概念がなく、電源アサーションの対象外である。

## Decision

### D1: `util/spawn.ts` seam を `spawnBackground` で拡張する（新 direct importer を追加しない）

`src/util/spawn.ts`（既存の B-12 seam モジュール）に `spawnBackground(cmd, args, opts): BackgroundProcessHandle` を追加した。

- `BackgroundProcessHandle { readonly pid: number | undefined; kill(): void }` — `kill()` は冪等で例外を投げない。
- env は `spawnCommand` と同じ単一ストリップポイント: `stripSecrets(process.env)`（B-6 準拠）。
- `stdio: "ignore"`, `shell: false`, `proc.unref()` — child が CLI の event loop を保持しない。
- `error` イベントは synchronous listener で捕まえ `opts.onError` へ転送する（listener なしでは unhandled crash）。

**採用理由**:

- B-12 の意図は「spawn を seam に封じ込める」ことであり、新しい spawn シェイプを seam 内に追加することは ratchet に反しない。seam を拡張すれば allowlist エントリ追加は不要で、ratchet の一方向性が保たれる。
- 将来 Linux の `systemd-inhibit` など別の常駐プロセスを追加する際も、同じ `spawnBackground` 経路を通せば B-12 が自動的に green を維持する。

### D2: `core/runtime/power-assertion.ts` を platform-gated・fail-open・完全 injectable にする

`src/core/runtime/power-assertion.ts` を新設し、`acquirePowerAssertion(opts)` を export した。

- `platform !== "darwin"` → 共有の no-op `PowerAssertion` を返す（将来プラットフォーム追加の拡張 seam）。
- `platform === "darwin"` → `caffeinate -i -w <parentPid>` を `spawnBackground` 経由で起動し、`release()` が `kill()` を呼ぶ `PowerAssertion` を返す。child の `error` イベント（ENOENT 等）は `opts.warn` を呼ぶだけで例外を投げない（fail-open）。
- `platform` / `parentPid` / `spawnBackgroundFn` / `warn` は injectable — テストがホスト OS 非依存で acquire/release を観測できる。

**macOS の実装選択**: `caffeinate -i -w <parentPid>`

- `-i`: アイドルスリープのみ抑止（issue #758 の原因に正確に対応）。
- `-w <parentPid>`: CLI プロセスの終了に連動して自動終了するため、teardown を経ない停止（SIGKILL・クラッシュ）でも orphan が残らない。

### D3: 電源アサーションの acquire/release を job lifecycle の境界に binding する

`src/core/runtime/local.ts` の `registerCleanup`↔`teardown` が「job が走っている間」の正確な境界であり、ここに acquire/release を掛けた。

- **acquire**: `registerCleanup` で `acquirePowerAssertion(...)` を呼び、`releasePowerAssertion` クロージャを `LocalCleanupInternals` に格納する。
- **release（通常経路）**: `teardown` で `internals.releasePowerAssertion()` を `cleanupWorktreeOnFailure()` より前に呼ぶ（success/error/failed の全 `finalStatus` 値で無条件）。
- **release（signal 経路）**: `signalCleanup` は `teardown` を経ずに `process.exit(130)` するため、`signalCleanup` 内で明示的に `releasePowerAssertion()` を呼ぶ。

**opt-in 構成**: `LocalRuntimeOptions` に追加した `spawnBackgroundFn`（デフォルト: `noopSpawnBackground`）と `platform`（デフォルト: `process.platform`）は省略可能。production は composition root（`factory.ts` の `createRuntime`）のみが実 `spawnBackground` を注入する。既存テストが `LocalRuntime` を構築しても副作用が発生しない。

### D4: managed runtime は変更しない

`src/core/runtime/managed.ts` には電源アサーションの配線を一切加えない。managed runtime は GitHub-hosted 短命実行であり、アイドルスリープの概念がない。

## Alternatives Considered

### Alternative 1: `spawnCommand` を流用する（D1 対抗案）

- **Pros**: 既存 API を追加なしで再利用できる。
- **Cons**: `spawnCommand` は `close` イベントで resolve する await 型であり、常駐プロセスの起動〜継続をモデル化できない。kill ハンドルも露出しない。
- **Why not**: 用途に根本的に合わない。

### Alternative 2: 電源アサーション専用モジュールで `node:child_process` を直接 import し B-12 allowlist に追加する（D1 対抗案）

- **Pros**: ファイル単位で完結し、seam モジュールに手を入れずに済む。
- **Cons**: B-12 allowlist は「削除のみが正」の一方向 ratchet であり、新規エントリ追加は ratchet に逆行する。env ストリップ（B-6）をサイトごとに判断する必要も生じ、seam が存在する意味を薄める。
- **Why not**: seam 拡張で足りるため allowlist を増やす必要がない。ratchet の健全性を維持する。

### Alternative 3: `git-exec.ts` seam の raw-`ChildProcess` `SpawnFn` を流用する（D1 対抗案）

- **Pros**: 既存の raw `ChildProcess` handle を返す `SpawnFn` 型があり、kill 可能なハンドルを得やすい。
- **Cons**: `git-exec.ts` seam は git 操作向けであり、その内部ヘルパー（`runSubprocess` 等）は close まで collect する設計。電源アサーション用の常駐プロセスとは意味的に無関係で、コードの意図が曖昧になる。request も新機能の追加先を `util/spawn.ts` に明示している。
- **Why not**: seam の責務が混濁する。`util/spawn.ts` への追加が設計上正しい場所。

### Alternative 4: caffeinate ロジックを `registerCleanup` にインラインで書く（D2 対抗案）

- **Pros**: ファイル数が増えず、コードの追跡が一か所で済む。
- **Cons**: lifecycle plumbing（acquire/release の境界）とプラットフォーム固有の実装詳細が同一関数内に混在する。platform gate・fail-open・ENOENT ハンドリングをテストする際に `registerCleanup` 全体を経由する必要があり、テストが重くなる。
- **Why not**: `power-assertion.ts` を independent helper に切り出す方が、プラットフォーム別挙動のユニットテストが simple かつ host-independent になる。

### Alternative 5: 非サポートプラットフォームで例外を投げ、呼び出し側で catch する（D2 対抗案）

- **Pros**: 「使えなかった」という情報が例外として明示的に伝播する。
- **Cons**: `acquirePowerAssertion` は `registerCleanup`（同期・fail-open 必須）から呼ばれる。例外が発生すると job が止まり、fail-open 要件（要件 3）に違反する。呼び出し側の catch 忘れのリスクも残る。
- **Why not**: fail-open は caller 側の catch ではなく acquire 自体の no-op 戻り値で保証する設計の方が安全で堅牢。

### Alternative 6: `caffeinate` を `-s`（AC 電源のみスリープ防止）フラグで起動する（D3 対抗案）

- **Pros**: より保守的な（弱い）アサーションで済む。
- **Cons**: `-s` は AC 接続時のみ有効で battery 駆動中は無効になる。issue #758 の原因は AC/battery 問わないアイドルスリープであり、バッテリー駆動の Mac（ラップトップ無人実行）では抑止できない。
- **Why not**: `-i`（idle sleep 限定）が要件に対して最小かつ正確な対応。

### Alternative 7: `-w <parentPid>` なしで teardown / signal の `kill()` のみに頼る（D3 対抗案）

- **Pros**: orphan 防止のコードパスが teardown と signal に集約されてシンプル。
- **Cons**: CLI が SIGKILL される・クラッシュするなど teardown を経ない停止では caffeinate が残り続ける。`-w <pid>` はカーネルレベルで pid 消滅を検知する race-free な backstop であり、追加ブックキーピング不要。
- **Why not**: teardown-less stop でも orphan を残さないという要件 5 を `-w` なしでは満たせない。

### Alternative 8: `acquirePowerAssertion` 関数全体を `LocalRuntime` コンストラクタへ注入する（D4 対抗案）

- **Pros**: `LocalRuntime` レベルで電源アサーション戦略を丸ごと差し替えられる。
- **Cons**: inject されるのが「acquire 済みの assertion 戦略」であり、spawn 呼び出し自体が `LocalRuntime` 外に隠れる。受け入れ基準「注入した spawn を観測して acquire/release を確認」を達成するためには、lifecycle テストが spawn の記録まで担う別のラッパーが必要になる。
- **Why not**: `spawnBackgroundFn` / `platform` を注入して `power-assertion.ts` を通す方が、acquire（spawn 呼び出し）と release（kill 呼び出し）の両方を同一の lifecycle テスト内で直接観測できる。

## Consequences

### Positive

- B-12 allowlist が増えず、ratchet の一方向性が保たれる。今後の常駐プロセス追加も `spawnBackground` 経由が前例となる。
- `power-assertion.ts` が fully injectable なため、ホスト OS 非依存のユニットテストで darwin・非 darwin・ENOENT 全経路を網羅できる。
- opt-in デフォルト（`noopSpawnBackground`）により、既存テストが `LocalRuntime` を構築しても caffeinate 副作用がない。composition root のみが production 動作を有効化する。
- 三重の orphan 防止（teardown `kill()`・signal 経路 `kill()`・`caffeinate -w <parentPid>`）により、クラッシュ・SIGKILL を含むあらゆる停止形態で常駐プロセスが残らない。

### Negative

- `LocalRuntimeOptions` に省略可能なフィールドが2つ増える（表面積の微増）。
- `spawnBackground` は `unref()` で event loop から切り離しているため、child の終了を CLI が検知しない。caffeinate の早期終了を CLI がログするには `exit` イベントのリスナーが必要（現在は未実装）。

### Known Debt

- Linux の `systemd-inhibit` など non-darwin プラットフォームの実抑止実装は `power-assertion.ts` の `platform` switch に追加するだけで済む構造になっているが、実装は out of scope。現在は fail-open no-op。
- `spawnBackground` の `detached` + process-group kill（子ツリーを持つ常駐プロセス向け）は `caffeinate` が子を持たないため不要。将来子ツリーが必要な常駐プロセスが来たときに検討。

## References

- Request: `specrunner/changes/job-power-assertion/request.md`
- Design: `specrunner/changes/job-power-assertion/design.md` — D1–D6
- Spec: `specrunner/changes/job-power-assertion/spec.md`
- Review: `specrunner/changes/job-power-assertion/review-feedback-001.md`
- Implementation: `src/util/spawn.ts`, `src/core/runtime/power-assertion.ts`, `src/core/runtime/local.ts`, `src/core/runtime/factory.ts`
- Tests: `tests/unit/util/spawn-background.test.ts`, `tests/unit/core/runtime/power-assertion.test.ts`, `tests/unit/core/runtime/local-power-assertion.test.ts`
- B-12 tooth: `tests/unit/architecture/core-invariants.test.ts`
- ADR `2026-06-01-arch-invariant-enforcement-vitest-ratchet` — B-12 ratchet の成立背景
