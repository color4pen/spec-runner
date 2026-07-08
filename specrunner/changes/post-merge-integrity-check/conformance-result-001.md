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
| tasks.md | ✓ | 全 7 タスク（T-01〜T-07）チェックボックスすべて [x] |
| design.md | ✓ | D1〜D7 すべて実装に忠実に反映（詳細は下記） |
| spec.md | ✓ | Req 1〜4 の SHALL/MUST を全て満たす（詳細は下記） |
| request.md | ✓ | 受け入れ基準 5 件すべてテストで固定済み |

---

## 1. tasks.md — 完了確認

全 7 タスク（T-01〜T-07）のチェックボックスがすべて `[x]`。未完了なし。

---

## 2. Design decisions — 実装トレース

| Decision | 内容 | 判定 |
|---|---|---|
| D1 | 整合性検証は「この実行の squash merge 直後（Step 5→6 間）」のみ | `merge-then-archive.ts` Step 5.5（line 540–555）。resume path（line 195–204）および merge-during-wait path（line 325–332）は直接 `runPostMergeCleanup` を呼んで return しており integrity check を通らない ✓ |
| D2 | 一時 detached worktree (`integrity-<slug>-<sha8>`) に materialize して検証 | `post-merge-integrity.ts`: `git worktree add --detach <integrityPath> <mergeSha>` → コマンド実行 → finally で remove + prune ✓ |
| D3 | SHA は `git fetch` + `git rev-parse origin/<baseBranch>` で解決、GitHubClient port 無変更 | `post-merge-integrity.ts`: fetch → rev-parse のみ。port interface 変更なし ✓ |
| D4 | 設定キー `archive.postMergeVerify: ShellCommand[]` | `schema.ts` `ArchiveConfig` に `postMergeVerify?: ShellCommand[]` 追加、`configSchema` に `optional(array(shellCommandSchema, ...))` 追加 ✓ |
| D5 | 失敗時は escalation（rollback なし、merged 正直報告、cleanup スキップ） | `formatEscalation` に "MERGED" / "NOT rolled back" / 修復手順を含む。`!integrityResult.ok` 分岐は cleanup を呼ばずに即 `return` ✓ |
| D6 | インフラ失敗（fetch/rev-parse/worktree add）は warn + `{ ok: true }` | 各インフラ段階の exitCode ≠ 0 / throw 時に `stderrWrite` + `return { ok: true }` ✓ |
| D7 | CLI 配線: `config.archive?.postMergeVerify` → `runMergeThenArchive` | `archive.ts`: load 成功時に line 165 で読み取り、line 224 で渡す。load 失敗時は `undefined` のまま（後方互換） ✓ |

---

## 3. Spec requirements — カバレッジ

### Req 1: Post-merge integrity command is configurable（SHALL/MUST）

- `archive.postMergeVerify` 未宣言 → `undefined`、検証なし（後方互換）✓
- 有効な string / object 形式の配列 → validation pass ✓
- 非配列・空文字列要素・`run` 欠如/空 → `CONFIG_INVALID` ✓
- schema テスト TC-001〜TC-008 で全バリデーションケース網羅 ✓

### Req 2: Integrity check runs on the merge result of this execution（SHALL/MUST NOT）

- 新規 squash merge 直後にのみ実行（D1）✓
- resume path（state=archived + MERGED）: integrity check 呼ばれない（test T-PMI-04）✓
- merge-during-wait path（別プロセスが merge）: integrity check 呼ばれない（test TC-015）✓
- base working tree を汚さない: fetch は remote-tracking ref の更新のみ、cwd の branch を checkout/reset しない ✓

### Req 3: Failed integrity check escalates without rollback（MUST NOT / MUST）

- 非 0 exit → `{ ok: false, escalation }` を返し、`merge-then-archive.ts` が `exitCode: 1` で即 return ✓
- Rollback/revert/reset コマンド不使用（test TC-PMI-02 で `keys.some(k => k.includes("revert"))` が false を assert）✓
- escalation に PR 番号・merge SHA（7 桁）・失敗コマンド出力・修復手順を含む ✓
- "MERGED" と正直に報告（`detectedState` に "was MERGED into"）✓
- `failedStep` 値が `post-merge integrity check (main)` であることをテスト TC-023 で固定 ✓
- `resumeCommand` 値が `specrunner job archive --with-merge <slug>` であることをテスト TC-024 で固定 ✓

### Req 4: Infrastructure failures do not block or falsely pass（MUST NOT / SHALL）

- fetch 失敗 → warn + `{ ok: true }`（test TC-PMI-04）✓
- rev-parse 失敗 → warn + `{ ok: true }`（test TC-027）✓
- worktree add 失敗 → warn + `{ ok: true }`（test TC-026）✓
- worktree remove 失敗（finally）→ warn のみ、result 不変（test TC-PMI-05）✓

---

## 4. Acceptance criteria — トレーサビリティ

| 受け入れ基準 | テスト |
|---|---|
| コマンド宣言済み + 検証失敗 → escalation（帰属 + 失敗出力 + 対処） | T-PMI-01（wiring）、TC-PMI-02（unit、PR番号/SHA/出力/"NOT rolled back" を assert）|
| コマンド宣言済み + 検証成功 → archive/cleanup 完走 | T-PMI-02（wiring）、TC-PMI-01（unit）|
| config 未宣言 → 挙動不変（既存テスト green） | T-PMI-03, T-PMI-03b（wiring）|
| 検証失敗時も merge 完了の事実が正しく報告される | TC-PMI-02（"MERGED" assert）、T-PMI-01（escalation に "MERGED" を含む fake で assert）|
| `typecheck && test` green | tasks.md T-07 [x] |

---

## 5. Architecture invariant check

- `node:child_process` 不使用: `post-merge-integrity.ts` に import なし ✓
- `process.env` 直接参照なし: SpawnFn 経由のみ ✓
- `src/core/verification/` からの import なし: ShellCommand 正規化はインライン実装 ✓
- `createTransportAuth` による private HTTPS repo 対応: token 存在時のみ wrap ✓
- 新概念の追加なし: `ShellCommand` / `shellCommandSchema` / `formatEscalation` を再利用 ✓
- fail-fast 実行モデル: break on first non-zero ✓

---

## 6. 所見

設計判断（D1〜D7）のすべてが実装に忠実に反映されており、スペックの全 SHALL/MUST を満たしている。テストカバレッジは pass / fail / fail-fast / インフラ失敗（fetch/rev-parse/worktree add）/ cleanup best-effort の各シナリオを網羅し、受け入れ基準との対応も明確。スコープ外事項（rollback、pre-merge 検証、停止機構、常駐監視）は実装に含まれていない。

軽微な観察事項（ブロックにはならない）:
- worktree remove で `input.spawn`（raw、transport-auth なし）を使う点は設計意図（cleanup で auth URL 解決の副作用を避ける）に沿っており正しい。
- 並行 merge によって `origin/<baseBranch>` の tip が「この PR の merge commit」でなくなるリスクは design.md Risks/Trade-offs で認識・受容済み。PR 番号は確定、SHA は「検証時点の tip」として正直報告する実装が適切。
