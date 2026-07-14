# Design: fact-check attestation を source revision に束縛する

## Context

request-review → design の fact-check attestation は、attestation が valid のとき
design が「現状コード断定（code assertion）」の再検証を省略できる最適化である。

現在の実装:

- `FactCheckAttestation` は `requestHash` / `codeAssertionsVerified` / `verifiedAssertions`
  の 3 フィールドを持つ（`src/core/factcheck-attestation.ts:18-22`）。
- 生成: request-review の `enrichContext` が request.md の SHA-256 を決定論的に計算して
  message に注入し（`src/core/step/request-review.ts:81-92`）、agent がその値を verbatim で
  attestation JSON に転記する（`src/prompts/request-review-system.ts:245-247`）。
  ファイル本体を書くのは agent（CLI は書かない）。
- 評価: design の `enrichContext` が request.md と attestation を読み、純関数
  `evaluateFactCheckAttestation(attestationRaw, currentRequestContent)` を呼ぶ
  （`src/core/step/design.ts:103-127`）。stale 判定は
  `!codeAssertionsVerified || requestHash !== hashRequestContent(current)` のみ
  （`src/core/factcheck-attestation.ts:124`）で、**source への束縛は無い**。
- 消費: 評価結果 `{ status, verifiedAssertions }` を `DynamicContext.factCheckAttestation`
  に載せ、`buildFactCheckDirective` が design への directive 文を生成する
  （`src/core/step/design.ts:149-153`）。

### 問題

attestation は request.md の hash のみに束縛されている。request.md が不変のまま source
（assertion が参照する実コード）が変わった場合——手動編集、または commit 後の resume——
attestation は valid のままで、design が古い code 検証結果を再利用する。もはや一致しない
source に対して「検証済み」と誤認する。

### 設計上の要点（本 change の核心的発見）

「request-review 実行時点の HEAD sha」を素朴に記録すると **機能しない**。パイプラインは
各 agent step 後に `git add -A && commit`（`src/core/step/commit-push.ts:33-76`）を行い、
request-review 自身が result / attestation / state を 1 commit にまとめて **HEAD を進める**。
design はその後で attestation を読むため、素朴な HEAD 比較は request-review 自身の
metadata commit によって常に不一致になる。

本 worktree での実測でこれを確認した:

- plain `HEAD` = `407fa8b93`（`request-review: attestation-source-binding` commit。
  変更内容は `specrunner/changes/<slug>/` のみ。source は不変）。
- `git rev-list -1 HEAD -- . ':(exclude)specrunner/changes'` = `90179c532`
  （change folder 外を最後に触れた実 source commit）。この値は request-review 自身の
  metadata commit をまたいでも **不変**。

したがって plain HEAD を記録すると design 側は常に stale（=常に verify-all）となり、
先行 feature（attestation による再検証省略）を暗黙に無効化してしまう。request.md
の背景が述べる「通常の連続実行では…HEAD は安定する」という期待は、pipeline metadata
commit を除外した source-scoped revision でのみ成立する。

## Goals / Non-Goals

**Goals**:

- attestation に source revision 信号を記録し、request-review 以降に source が変化して
  いれば design 側で stale と判定する。
- 判定は決定論的な CLI 側 git 読み取りのみで行う（AI ターン不要）。
- fail-safe: 信号の欠落・取得不能・不一致はすべて stale（verify-all）へ倒す。
  正しさを緩める方向には決して働かせない。
- 通常の連続実行（source 未変化）では valid を維持し、先行 feature の最適化を保つ。
- source 信号を持たない旧 attestation は stale 扱いで後方互換とする。

**Non-Goals**:

- attestation が検証する assertion の内容・粒度の変更。
- request-review が attestation を生成する条件・タイミングの変更
  （source 信号の記録追加を除く）。
- 未 commit の working-tree 編集（HEAD 不変・tree 変化）の捕捉（D5 参照）。
- managed runtime 専用の source 取得経路の新設（既存の縮退でカバー、D6 参照）。

## Decisions

### D1: source 信号は「change folder を除外した最新 source commit の sha」とする

source revision =
`git rev-parse` 相当の HEAD 由来 sha だが、pipeline metadata（`specrunner/changes/`）
の churn を除外して算出する:

```
git rev-list -1 HEAD -- . ':(exclude)specrunner/changes'
```

= HEAD から遡って `specrunner/changes/` 以外のパスを最後に変更した commit の sha。

- **Rationale**: request.md の背景は「git HEAD sha を primary（決定論・安価）」を採用と
  している。素朴な HEAD sha は request-review 自身の metadata commit で常に進むため、
  背景が同時に述べる「通常窓では安定」を満たせない（Context / 実測参照）。change folder
  を除外した source-scoped revision は (a) HEAD 由来で決定論的・安価（git 1 コマンド）、
  (b) request-review / design 間の metadata commit をまたいで安定、(c) 実 source commit
  （手動編集の commit / resume 前の source commit）には反応する——という architect の
  意図（source 変化のみ stale）を正しく実現する。
- **Alternatives considered**:
  - **plain `git rev-parse HEAD`**: 却下。request-review 自身の commit で HEAD が進み、
    design では常に不一致 → 常時 stale。fail-safe ではあるが先行 feature を暗黙無効化
    し、背景の「通常窓では安定」に反する（実測で確認）。
  - **merge-base(baseBranch, HEAD)**: 却下。feature branch 上の source commit をまたいでも
    merge-base は不変のため、resume-after-commit の穴を検出できない（stale すぎず緩い）。
  - **repo 全体の tree hash `HEAD^{tree}`**: 却下。root tree に change folder が含まれ、
    metadata commit で変化 → plain HEAD と同じ欠陥。
  - **source dir を固定（例 `HEAD:src`）**: 却下。SpecRunner は汎用ツールで product の
    source path は固定でない。`specrunner/changes/` の除外は tool 固有 metadata の除外で
    あり、product source path への仮定を含まない。

### D2: source 信号の取得は単一の共有ヘルパに集約する（決定論不変条件）

記録側（request-review）と評価側（design）は **同一の git コマンド** を使わねばならない。
両者が乖離すると常時不一致になる。新規モジュール
`src/git/source-revision.ts` に `readSourceRevision(cwd: string): Promise<string | null>`
を置き、両 step の `enrichContext` から呼ぶ。除外パスは `changesDirRel()`
（= `specrunner/changes`、`src/util/paths.ts`）から導出し、drift を防ぐ。

- **Rationale**: 記録と評価で同一コマンドを保証する唯一の手段は集約。git 呼び出しは既存の
  `gitExec(defaultSpawnFn, cwd, args)` seam（`src/util/git-exec.ts`、secret strip 済み）を
  使い、`src/git/dynamic-context.ts` と同じ「git は seam・判定は純関数」方針に揃える。
- **Alternatives considered**: 各 step に git 呼び出しを直書き → コマンド乖離のリスクと
  重複。却下。

### D3: 記録は既存の agent 転記経路に相乗りする（requestHash と同一パターン）

request-review の `enrichContext` が `readSourceRevision(cwd)` を追加で呼び、値を
`DynamicContext.sourceRevision` に載せる。`buildMessage` は既存 `requestContentHash` と
並べて message に注入し、attestation JSON テンプレートに `sourceRevision` 行を追加する。
agent は requestHash と同様に **verbatim で転記** する。

重要: `enrichContext` は request-review 自身の commit の **前** に走るが、D1 の source-scoped
revision は change folder churn を除外するため、この時点で読んでも design 時点の値と一致する
（実測で確認）。したがって記録タイミングは現状の enrichChat 位置のままで正しい。

- **Rationale**: requestHash と全く同じ「CLI が決定論的に算出 → message 注入 → agent 転記」
  経路に乗せることで、変更を最小化し既存の contract（`writes()` の `verify:false`、
  managed 縮退）をそのまま再利用できる。
- **Alternatives considered**: CLI が agent 実行後に attestation ファイルへ sourceRevision を
  後追い書き込みする案 → attestation は現状 100% agent 生成であり、CLI 後追い write は新機構
  で scope 増。fail-safe（欠落 → stale）が転記漏れを吸収するため不要。却下。

### D4: `evaluateFactCheckAttestation` に current source revision 引数を追加し stale 条件を拡張する

新シグネチャ:

```
evaluateFactCheckAttestation(
  attestationRaw: string | null,
  currentRequestContent: string,
  currentSourceRevision: string | null,
): AttestationEvaluation
```

判定順序（既存を保存しつつ source 条件を追加）:

1. `attestationRaw === null` または parse 失敗 → `absent`（不変）。
2. `!codeAssertionsVerified` または `requestHash` 不一致 → `stale`（**既存挙動を保存**）。
3. 追加（fail-safe）— 次のいずれかで `stale`:
   - attestation に `sourceRevision` が無い（旧 attestation・後方互換）
   - `currentSourceRevision === null`（取得不能）
   - `parsed.sourceRevision !== currentSourceRevision`（source 変化・**本 change の核心**）
4. それ以外 → `valid`。

design の `enrichContext` は request.md 読取後に `readSourceRevision(cwd)` を呼び、第 3
引数として渡す（`src/core/step/design.ts:103-127`）。評価結果 `{ status, verifiedAssertions }`
の形は不変のため、`buildFactCheckDirective` / `design-system.ts` / `DynamicContext.factCheckAttestation`
の投影は変更不要（source 束縛は評価内部に閉じる）。

- **Rationale**: 消費側の shape を変えないことで directive 生成・prompt を無改変に保つ。
  source 束縛は「status の計算方法」だけを変える。
- **Alternatives considered**: 第 3 引数を optional にして未指定時 valid → 却下（fail-safe に
  反する）。optional にして未指定時 stale → 全既存 2 引数呼び出しが stale 化し API が曖昧。
  required `string | null` が最も明示的（null = 取得不能を型で表現）。

### D5: 未 commit working-tree 編集は捕捉しない（残余を明記）

D1 の source revision は **commit 済み** の source 変化のみ検出する。HEAD 不変で working-tree
だけ変化した場合（uncommitted 手動編集）は検出されない。tree hash / dirty marker の追加は
**行わない**。

- **Rationale（費用対効果）**: 主要な穴（resume-after-commit、commit 済み手動編集）は D1 で
  カバーされる。pipeline は step ごとに commit するモデルであり、request-review→design 間に
  source が uncommitted のまま残るのは非典型。dirty 判定（`git status --porcelain` / `write-tree`）
  は untracked ファイル等で非決定的ノイズを持ち込み、限界的な追加カバレッジに対し複雑度が
  見合わない。fail-safe（欠落・取得不能 → stale）が最終的な安全網として残る。
- **残余（design.md 明記事項）**: request-review 完了後、design が attestation を読む前に、
  同一 HEAD 上で source ファイルを **commit せずに** 手動編集した場合、attestation は valid の
  ままとなり design はその assertion の再検証を省略しうる。この窓は狭く（pipeline は連続実行時
  step 間で外部編集を挟まない）、緩める方向でなく「検出漏れ」であるため、次の再検証チョーク
  ポイント（verification / conformance）でも捕捉余地がある。将来 dirty 検出が必要になれば
  D2 のヘルパに追加合成できる（signal を「commit sha + dirty flag」へ拡張）。

### D6: managed runtime は既存縮退でカバーする（専用経路を作らない）

`readSourceRevision(cwd)` は `gitExec` 経由。managed runtime にローカル worktree が無い場合、
`enrichContext` は既に request.md 読取失敗で縮退し attestation instruction を出さない
（`src/core/step/request-review.ts:88-91`）。design 側も request.md 読取失敗で縮退、または
`readSourceRevision` が `null` を返して D4-3 で stale となる。いずれも verify-all に倒れる。

- **Rationale**: `captureHeadSha` が managed で null を返すのと同じ縮退方針
  （`src/core/runtime/managed.ts:318-320`）。専用分岐を足さないことで runtime 差が step に
  漏れない。

## Risks / Trade-offs

- [Risk] agent が `sourceRevision` の転記を漏らす（requestHash は書くが source を書かない）→
  design は source 欠落を stale と判定し verify-all。**Mitigation**: これは fail-safe な失敗
  （再検証が増えるだけ、false-valid にはならない）。requestHash 転記と同じ信頼性プロファイル
  であり新規リスク class ではない。
- [Risk] 除外パス `specrunner/changes` が将来の metadata レイアウト変更で不整合になる →
  metadata commit を source と誤認し過剰 stale。**Mitigation**: 除外パスを `changesDirRel()`
  から導出し単一定義に束ねる（D2）。過剰 stale は fail-safe 側なので安全側。
- [Risk] 既存 `evaluateFactCheckAttestation` の 2 引数呼び出しと、旧 attestation を valid と
  仮定するテストが破綻する。**Mitigation**: これは意図した挙動変更（旧 attestation → stale）
  であり、観測挙動を保つべき refactoring ではない。call-site（design.ts）とテストを新契約に
  更新する（tasks 参照）。既存の requestHash/codeAssertionsVerified の stale 条件自体は保存。

## Open Questions

なし（architect 判断事項の working-tree 捕捉は D5 で「捕捉しない・残余明記」に決着）。
