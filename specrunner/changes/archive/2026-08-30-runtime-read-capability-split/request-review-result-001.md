# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コード事実確認（実測セクション）

`src/core/port/runtime-strategy.ts` を直接 Read して以下を確認した。

| 項目 | 実値 | request 記載値 | 一致 |
|------|------|----------------|------|
| ファイルパス | `src/core/port/runtime-strategy.ts` | `src/core/runtime/runtime-strategy.ts` | ✗ 不一致 |
| 行数 | 793 行 | 793 行 | ✓ |
| `RuntimeStrategy` メソッド数 | 28 | 28 | ✓ |
| `unknown` token 数 | 20（grep 一致数） | 21 | 差異あり (△) |
| `as unknown as RuntimeStrategy` | 6（テストファイル） | 6 | ✓ |
| production の `RuntimeStrategy` import 数 | 19 | 19 | ✓ |

**ファイルパス誤記の確認根拠**:
- `src/core/port/runtime-strategy.ts` は実際に存在し、先頭コメントに "Moved from core/runtime/strategy.ts to core/port/runtime-strategy.ts" と記載
- `src/core/runtime/runtime-strategy.ts` は存在しない
- `architecture/components.md` 171 行目も "→ `src/core/port/runtime-strategy.ts`" と正しく参照

**`as unknown as RuntimeStrategy` 6 件の所在**（確認済み）:
- `tests/pipeline-sole-committer-e2e.test.ts:382`
- `tests/pipeline-sole-committer-e2e.test.ts:539`
- `tests/custom-reviewers-e2e.test.ts:421`
- `tests/pipeline-integration.test.ts:206`
- `tests/unit/core/step/finding-recency.test.ts:83`
- `tests/unit/core/step/finding-recency.test.ts:109`

### 2. 対象 leaf consumer の現状確認

各ファイルの `runtimeStrategy` 依存型を読んで確認した。

| consumer | 現状の依存型 | 問題 |
|----------|-------------|------|
| `scope-check.ts` | `deps: PipelineDeps`（`deps.runtimeStrategy?: RuntimeStrategy`） | 間接的に full interface |
| `runtime-capability-gate.ts` | `Pick<RuntimeStrategy, "canDeriveChangedFiles">` | ✓ 既に narrowing 済み |
| `no-op-detect.ts:36` | `runtimeStrategy: RuntimeStrategy` | full interface（対象） |
| `prior-round-context.ts:132` | `runtimeStrategy: RuntimeStrategy \| undefined` | full interface（対象） |
| `custom-reviewer-round-context.ts:244` | `runtimeStrategy: unknown`（→ cast as `RuntimeStrategy \| undefined`） | forced cast（対象） |
| `post-fix-context.ts:226` | `runtimeStrategy: RuntimeStrategy \| undefined` | full interface（対象） |
| `finding-recency.ts:127,222` | `runtimeStrategy: RuntimeStrategy` | full interface（対象） |
| `achieved-assurance.ts:28` | `AssuranceProvenanceRuntime = Pick<RuntimeStrategy, "readFileAtCommit">` | ✓ 既に narrowing 済み |

### 3. architecture 文書の stale 記述確認

`architecture/components.md` 171 行目に "commit/round 系 git 面（scoped stage・commit 間 diff・revision 読み取り・**commit 時テスト実行**）" という記述が残っており、request の §5 が指摘する stale な責務記述を確認した。

### 4. RealRuntimeStrategy 型の確認

`src/core/port/runtime-strategy.ts:764–793` に `RealRuntimeStrategy` 交差型が定義されており、`LocalRuntime`/`ManagedRuntime` の必須化強制（`canDeriveChangedFiles`, `assertNoDuplicateLiveJob`, etc.）が実装済みであることを確認した。

### 5. 設計の整合性確認

- `listChangedFiles`, `listCommitChangedFiles`, `readRevisionContent`, `readFileAtCommit`, `snapshotMainCheckoutGuard`, `listWorktreeChanges`, `canDeriveChangedFiles` はすべて read-only で mutation/lifecycle を含まないことを確認した
- `lastCommitTouchingPath` は production consumer が見当たらないことを確認（request §1 の扱い方針と一致）
- non-goal（facade 廃止・mutation 分割）は requirements に含まれていないことを確認

### 6. stop condition の事前評価

以下のいずれも現時点で発動条件なし:
- read-only 分割のみで観測可能振る舞いを維持できる（mutation 不要）
- Local/Managed の fallback policy 変更不要
- 新規 architecture layer 不要

## 検証できなかった項目

- `unknown` token 正確数のカウント方法（grep -w または目視カウントで 20 が上限確認値。request の 21 との差は 1。アーキテクチャへの影響なし）
- test fake の forced cast 数（test ファイルを全件探索していない。上記 `as unknown as RuntimeStrategy` 6 件は確認済み）

## Findings 詳細

### F1: 実測セクションのファイルパスが誤っている（medium / fixable）

**場所**: `request.md` §実測  
**誤**: `src/core/runtime/runtime-strategy.ts`  
**正**: `src/core/port/runtime-strategy.ts`  

実装者がベースライン計測をしようとすると誤パスではファイルが見つからず、混乱を招く。行数・メソッド数は正しいパスで一致する。

修正: `実測` セクションのパスを `src/core/port/runtime-strategy.ts` に訂正する。

### F2: `unknown` token 計上値の軽微な不一致（low / fixable）

**場所**: `request.md` §実測  
**誤**: 21  
**実測 (grep)**: 20  

PR 記載のベースライン数値として 1 件の差がある。動作・実装方針への影響はない。
