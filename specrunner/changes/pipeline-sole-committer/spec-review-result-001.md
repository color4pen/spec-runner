# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/pipeline-sole-committer/request.md`
- `specrunner/changes/pipeline-sole-committer/design.md`
- `specrunner/changes/pipeline-sole-committer/spec.md`
- `specrunner/changes/pipeline-sole-committer/tasks.md`

### コード実態の照合

**request.md / design.md が主張する現状コードの前提を実コードで照合した。**

| 主張 | 確認結果 |
|------|----------|
| `commit-push.ts:498` — guarded mode が裸 `git add -A` | ✅ 確認。`gitExecResult(infra.spawnFn, cwd, ["add", "-A"])` — pathspec なし |
| `commit-push.ts:561` — `commitFinalState` が裸 `git add -A` | ✅ 確認。`spawnFn("git", ["add", "-A"], { cwd })` — pathspec なし |
| `commit-push.ts:242` — push-as-is 経路 | ✅ 確認。`hasChanges === false && HEAD 前進` → `pushOnly()` 直行（行 237–244） |
| `parallel-review-round.ts` — HEAD guard なし | ✅ 確認。fan-out 前後に `headBeforeRound` キャプチャなし。`listWorktreeChanges` のみ |
| scoped residual の `getWorktreeChangedPaths ok:false` → 黙殺 | ✅ 確認。`if (postStatus.ok && ...)` — ok:false 時はブロック全体をスキップ |
| `pipelineManagedPaths` に `biteEvidenceResultPath` が含まれない | ✅ 確認。`round-git-scope.ts:99–101` で state.json / events.jsonl / usage.json のみ |
| guarded の restore (git clean / git checkout) 失敗を黙殺 | ✅ 確認。`commit-push.ts:492–493` で結果を参照していない |
| `StepRun.commitOid` は存在するが `synthesizedCommits` は存在しない | ✅ 確認。`state/schema/types.ts:209` で `commitOid?: string` のみ |
| `propagateVerificationResult` が独立した commit / push 発生点 | ✅ 確認。`src/core/verification/propagate.ts` で git add → commit → push をアトミックに実行 |
| `commitRoundArtifacts` は `void` を返す | ✅ 確認。`local.ts:812–823`、`runtime-strategy.ts:524` — 戻り値なし |

### 設計・仕様の整合性

- **D1–D8 の設計判断**: request.md の architect 判断（mixed reset + 合成、hard reset 却下、push-as-is 廃止、checkpoint add-A 廃止）と design.md の決定が整合していることを確認。
- **spec.md のシナリオ**: 各 Requirement に対応するシナリオが存在し、GIVEN/WHEN/THEN が設計意図を正確に表現していることを確認。
- **tasks.md の受け入れ基準**: request.md の受け入れ基準との対応を照合し、T-01〜T-17 が全受け入れ基準を網羅していることを確認。
- **commitOid 意味論不変**: D4 が `synthesizedCommits` を StepRun.commitOid から独立した field に分離する設計を採用しており、revision 束縛 / canonHash 束縛への無影響を確認。
- **R6 E2E テスト要件**: T-12 / T-13 が実ローカル git repo を使う実証テストであり、v23 で実証された 2 経路をテスト可能な設計になっていることを確認。
- **セキュリティ — git コマンド注入**: 全 git コマンドが配列 args 形式（shell 非介在）で呼ばれており、pathspec は `--` セパレータで分離される。入力インジェクションリスクなし。
- **セキュリティ — D1/D3 の壁**: mixed reset + 合成（D1）と HEAD guard + reset（D3）が独立した 2 層の壁を形成し、inspection モデルの非収束問題を構造的に解決していることを確認。

### 検証済みの設計判断

- `synthesizedCommits` が state.json 内にあるため agent がファイルシステム経由で直接書き込めるリスクがある。ただし egress backstop の位置付けは "合成漏れ・harness 欠陥の backstop"（一次防御は D1/D3）であり、request が明示的にスコープ外とした SDK permission 層の遮断が後続 request で予定されていることを確認。
- D7 の "non-declared worktree 変更の累積（遅延検出）" リスクは design.md に Mitigation とともに記載されており、fail-closed として許容されていることを確認。

---

## 検証できなかった項目

- `scope-escalation.test.ts` / `fast-scope-checkpoint.test.ts` の全内容（partial read のみ）。D7 で "checkpoint 対象変更に追随" と記載されているが、これらのテストは conformance scope 検出（PermissionScope 機構）をテストしており pipeline-sole-committer の変更対象（commitFinalState）とは別概念に見える。フル確認は未実施。

---

## Findings 詳細

### F-1: T-08 — `propagateVerificationResult` の egress 統合経路が未指定（medium / fixable）

**根拠コード**: `src/core/verification/propagate.ts:30–72`

現行の `propagateVerificationResult` は `git add → git commit → git push` を単一関数内でアトミックに実行し、`PropagateResult` を返す。D4/T-08 では "propagate の直 push は egress 検証を経由する" と記述されているが、commit と push の間に egress 台帳照合を挟むには関数シグネチャ変更または commit/push 分離リファクタリングが必要になる。

tasks.md T-08 では "executor runCliStep で step.run 後の exit-HEAD を捕捉し CommitOrchestrator 経由で台帳へ append する" と記述されており、台帳 append 自体は step.run 後に `captureHeadSha` を呼ぶパターンで実装可能。しかし egress 照合をその push（`propagateVerificationResult` 内部）に通す方法は未指定。

想定実装案（tasks に追記が望ましい）:
- (a) `propagateVerificationResult` を commit-only / push-separately に分割し、caller が egress 照合後に push を実行する
- (b) `propagateVerificationResult` に egress コールバックを引数追加する

どちらの案も既存の `PropagateResult` インターフェースの変更を伴う。実装者が独自判断する必要がある範囲が大きい。

### F-2: D3 — HEAD guard で `captureHeadSha` が null を返した場合の挙動が未規定（low / fixable）

**根拠コード**: `src/core/pipeline/parallel-review-round.ts:132`

D3 では "fan-out 前に `headBeforeRound = captureHeadSha(cwd)` を記録する" と記述されているが、local runtime での git 障害時に `captureHeadSha` が null を返す場合の挙動が design.md / spec.md いずれにも記載がない。

- null → skip guard (fail-open): 攻撃者が意図的に git を壊せる環境では bypass される
- null → fail-closed (halt): 正常な managed runtime でも null が返る（managed は HEAD なし）

既存コードでは managed runtime が `captureHeadSha: null` を返し baselineCommit のチェックを無効化する（fail-safe）。D3 の HEAD guard も同じ convention を採用すると推定されるが、spec.md のシナリオに明示なし。実装者は convention を明確にし、テストで固定することが望ましい。

### F-3: `commitFinalState` の best-effort push と egress fail-closed の整合（low / fixable）

**根拠コード**: `src/core/step/commit-push.ts:582–591`

現行 `commitFinalState` は push 失敗時に `stderrWrite` で警告するが throw しない（best-effort）。D4 では "すべての push を検証付き push に集約する" と記述されており、checkpoint / finalize の push も egress 検証を経由させる方針。

egress 違反は fail-closed（push せず halt）であるため、checkpoint publish 時に egress 違反が検出された場合は halt になる。これは現行の "push 失敗でも warn して継続し local resume を保存する" ポリシーと矛盾する。

- checkpoint は pipeline 管理パス限定（D2）のため egress 違反になる可能性は合成漏れのみ
- 合成漏れは harness バグ（稀）であり、その場合に halt することは正当
- ただし spec.md / tasks.md に "checkpoint push の egress 違反時は halt" と明記されていない

実装時に "checkpoint の egress halt → resume で再 checkpoint" の経路を確認することが望ましい。

---

### Observations（要対応なし）

**OBS-1**: ステージング処理の移動が大規模リファクタリングを伴う（info）

現行コードは `commitAndPush` でステージング（`git add -A -- <stagePaths>`）を先行してから `commitAndPushTail` を呼ぶ構造。新設計では "HEAD 確認 → 必要なら mixed reset（index クリア）→ 再ステージング → commit" の順に変更される。mixed reset 後は index がクリアされるため、commitAndPush で行ったステージングは無効化される。ステージング処理を tail (reset 後) に移す構造変更が必要で、tasks T-04 は "tail entry で HEAD を取得し... git add -A -- <stagePaths>" と記述しているが、変更規模が大きく既存テストへの影響も大きい。

**OBS-2**: `commitRoundArtifacts` の OID キャプチャは関数外の `captureHeadSha` で可能（info）

`commitRoundArtifacts` が `void` を返すことは既知。tasks T-08 の "commitRoundArtifacts 後の HEAD OID を捕捉し" は、関数呼び出し後に `deps.runtimeStrategy.captureHeadSha(cwd)` を追加呼び出しするパターンで実装可能（executor で commitOid をキャプチャする既存パターンと同様）。関数シグネチャの変更は不要。

**OBS-3**: `scope-escalation.test.ts` / `fast-scope-checkpoint.test.ts` の変更必要性確認（info）

D7 に "scope-escalation.test.ts / fast-scope-checkpoint.test.ts: checkpoint 対象変更に追随" と記載あり。これらのテストは PermissionScope 機構（conformance scope breach 検出）をテストしており、コミット内容とは直接関係しない。pipeline-sole-committer の変更（commitFinalState を管理パス限定化）がこれらのテストに影響する可能性は低いと推定されるが、実装者は変更前後で green のままか確認すること。

**OBS-4**: `synthesizedCommits` backward compat が tasks.md にのみ記載（info）

T-01 に "既存 state.json（field なし）を読んでも互換（undefined → 空集合扱い）" と記載があるが、spec.md に対応するシナリオが存在しない。既存テスト（revision 束縛等）が過去の state.json フォーマット（synthesizedCommits なし）を前提とする場合、後方互換性の確認が必要。
