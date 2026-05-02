# finish コマンド再設計 — slug を canonical 化、1-PR モデルへ転換、pre-flight 導入

## Meta

- **type**: spec-change
- **date**: 2026-05-02
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect
  - pattern-reviewer

## 背景

### dogfooding-006 で露呈した defect 群

PR #51 で実装した `specrunner finish` を PR #48 (readme-status-section) に当てる dogfooding-006 で、**設計レベルの defect が 4 件露呈**した:

| # | defect | 影響 |
|---|--------|------|
| 1 | slug 解決を `state.request.path` の basename に過剰結合 | PR #48 の state は `request.path = /tmp/dogfooding-001-request.md` なので slug が `dogfooding-001-request.md` に確定。実際の `openspec/changes/readme-status-section/` を見つけられず archive を silently skip。`state.branch = "feat/readme-status-section"` と PR の `headRefName` に slug が canonical な形で存在していたのに使われなかった |
| 2 | archive 操作が両方 skip されても archive PR を作る | empty な `chore/archive-<slug>` branch を remote に push し、`gh pr create` が "No commits between" で fail。orphan branch が remote に残った |
| 3 | escalation 前に `markJobArchived` しない | feature PR は MERGED 状態なのに job state は `success` のまま。状態と filesystem の現実が乖離 |
| 4 | `mergeStateStatus=UNKNOWN` の transient retry 欠落 | 直前に main が更新された直後に GitHub が再計算で UNKNOWN を返した結果、即 `OPEN_CHECKS_FAILING` 扱いで escalation。再実行で OPEN_MERGEABLE に正規化された |

これらの defect は test 686/686 が pass していても検出されなかった。理由: test fixture が `state.request.path: "/openspec-workflow/requests/active/test-slug"` のような **整合した slug を前提とした clean input** で stub されており、現実の dogfooding state（`/tmp/...`、半端な archive 状態、transient GitHub state）が input distribution に含まれていなかった。

### 構造的な原因

dogfooding-006 で露呈した 4 件は表面的には別個の bug だが、**設計レベルでの根本原因は共通**:

1. **slug の canonical source を schema に固定しなかった** — `state.request.path` という壊れやすい派生情報を slug の唯一の source にした。`state.branch`（`register_branch` custom tool で保存される）や PR の `headRefName` に正しい slug 情報があったのに参照しなかった
2. **2-PR モデルの orchestration を CLI に持ち込んだ** — openspec-workflow `request-merge` skill の 2-PR モデル（feature PR merge → archive PR 作成 → archive PR auto-merge）を翻訳したが、skill が LLM の柔軟性で吸収していた transient state / partial failure / idempotent resume を deterministic CLI で再現するには、設計の adversarial robustness を全部事前組み込みする必要があった。dogfooding-006 でその不足が露呈した
3. **pre-flight 検証が無く、irreversible な merge を先に実行する順序** — feature PR merge は不可逆。merge 後に slug 不整合 / archive sync 失敗 / 認証失敗 などが発覚しても rollback できない

### 設計判断: 1-PR モデルへ転換する

openspec-workflow が 2-PR モデルを採るのは「main への直接 push 禁止」不変条件と LLM の runtime 柔軟性を前提としており、SpecRunner の deterministic CLI には fit しない。**archive 操作を feature branch に commit してから feature PR を merge する 1-PR モデル**に転換すれば、orchestration の中間非整合状態が物理的に発生しなくなる。orphan branch / empty PR / partial failure resume / 状態遷移の atomicity といった defect 群がすべて構造的に消える。

trade-off として branch protection rule の "approval dismissal on new commit" との互換性を諦めるが、SpecRunner repo は当面この設定を入れない方針。fork PR からの finish は将来課題として残す。

## 目的

`specrunner finish` を **dogfooding に耐える deterministic CLI** に再設計する。具体的には:

1. **slug を schema レベルの canonical 情報** として state に保存し、`request.path` のような派生情報に依存しない
2. **`specrunner finish <slug>`** を第一形にして、user の mental model に合った input contract にする
3. **1-PR モデル** に転換し、archive PR 作成 / orphan branch / partial failure resume / 状態遷移 atomicity の問題群を **構造的に発生させない**
4. **Phase 0 pre-flight** を導入し、reversible なチェックは irreversible な merge より前に全部終わらせる
5. **adversarial test fixture** で legacy state（`/tmp/...` request.path）/ slug divergence / transient UNKNOWN / pre-flight fail などを test として固定

## 要件

### A. state schema 改修（最も根本）

A1. **`RequestInfo` に `slug` field を追加する**

```typescript
export interface RequestInfo {
  path: string;
  title: string;
  type: string;
  slug: string | null;  // ← 新設。null は legacy state（non-canonical request.path）でのみ発生
}
```

A2. **slug の populate タイミング**

`request-execute` 起動時、`pipeline-context.md` の `request-path` から slug を抽出（`path.basename`）して `state.request.slug` に書き込む。pipeline-context.md が無い legacy state（`/tmp/...` 等）の場合は `null` 許容で fallback する。

A3. **後方互換性**

既存 state ファイル（slug field 不在）を loadJobState で読む際、以下の優先順で slug を **後付け populate**（state ファイル自体は書き換えない、loadJobState の戻り値で derive）する:

1. `state.request.slug` が存在 → そのまま
2. `state.branch` の prefix（`feat/` `fix/` `change/` `refactor/` `chore/`）を strip した残部 → 採用
3. `path.basename(state.request.path)` → 採用（最後の fallback）

このため `JobState` を直接参照する code は `state.request.slug` を見るのではなく、新設の `getJobSlug(state): string` helper を使う。

A4. **JobStatus の `merged` 中間状態は導入しない**

1-PR モデルでは feature PR merge と archive が単一 commit で main に反映されるため、`success → archived` の 2 段遷移で十分。`merged` 中間状態は不要。

### B. CLI input contract の刷新

B1. **第一形を `specrunner finish <slug>` にする**

```
specrunner finish <slug>          # 第一形（推奨）
specrunner finish                  # cwd / awaiting-merge から auto-detect
specrunner finish --pr <num>       # PR 番号からの逆引き
specrunner finish --job <jobId>    # debug / forensics 専用
specrunner finish --dry-run <slug> # Phase 0 のみ実行、何も commit しない
```

B2. **slug auto-detection の source 拡張**

引数なしで起動された場合、以下の優先順で slug を解決する:

1. cwd の `openspec-workflow/requests/active/<dir>/pipeline-context.md` または `awaiting-merge/<dir>/...` のうち、worktree 内であれば dir 名を採用
2. main worktree の `openspec-workflow/requests/awaiting-merge/<dir>/` が 1 件のみ → その dir 名
3. 0 件 / 2 件以上 → escalation で「`specrunner finish <slug>` で明示してください」を指示

B3. **`--pr <num>` での逆引き**

`gh pr view <num> --json headRefName` を呼んで `headRefName` の prefix を strip → slug 確定 → 該当 state を listJobStates で検索（`getJobSlug` 経由）。

B4. **`--job <jobId>` の降格**

互換性のため `--job` flag は残すが、help text で「forensics / debug 用」と明示。第一引数の jobId 渡しは廃止する。

### C. 1-PR モデルへの転換

C1. **archive 操作を feature branch に push する**

```
Phase 0: pre-flight（reversible only）
Phase 1: feature branch 上で archive 操作
  ├─ git checkout <feature-branch>（必要なら fetch + checkout）
  ├─ openspec archive <slug> [--skip-specs 自動判定]
  ├─ git mv awaiting-merge/<slug> merged/<slug>
  └─ git commit "chore: archive <slug>"
Phase 2: git push origin <feature-branch>
Phase 3: gh pr merge <PR> --squash --delete-branch
Phase 4: markJobArchived + git checkout main + pull --ff-only
```

C2. **archive PR / chore/archive ブランチの完全削除**

`createArchivePr`、`pushAndCreateArchivePr`、`prepareArchiveBranch`、`checkArchivePrAlreadyMerged` を削除する。`src/core/finish/archive-pr.ts` 自体を削除候補に。chore/archive-<slug> branch は作成しない。

C3. **Phase 1 の冪等性**

- `openspec/changes/<slug>/` 不在 → archive subprocess skip（warning ログ）
- `awaiting-merge/<slug>/` 不在 → mv skip（warning ログ）
- 両方 skip かつ staged 変更ゼロ → commit step skip、Phase 2 へ進まない（push する commit が無いため）。Phase 3 へ直接進み、markJobArchived のみ実行
- `merged/<slug>/` が既に存在 → mv 自体を skip

C4. **resume 冪等性**

- feature PR が MERGED 済 → Phase 1-3 を skip、Phase 4 のみ
- feature branch が既に削除済（`gh pr merge --delete-branch` 実行後）→ archive commit が main に反映済みの判定で、Phase 1-3 skip

### D. Phase 0 pre-flight

D1. **pre-flight チェック項目**

irreversible op（feature PR merge）の **前** に全部走らせる:

| # | 検査項目 | fail 時の挙動 |
|---|---------|--------------|
| 1 | slug 確定可能（B1/B2 の解決ロジック） | escalation: "slug を `--slug` で明示してください" |
| 2 | `state.pullRequest.number` 存在 | escalation: "pr-create が完走していません" |
| 3 | `gh pr view <num>` 成功 + state 取得 | escalation: "PR を gh で取得できません。auth / network を確認してください" |
| 4 | mergeStateStatus が `UNKNOWN` の場合は 3 秒間隔で 3 回 retry | retry 後も UNKNOWN なら escalation |
| 5 | `openspec/changes/<slug>/` 実存 + delta spec 有無判定 | 不在なら warning（archive skip path に入る予告）|
| 6 | `openspec validate <slug>` dry-run（change folder 存在時のみ）| fail なら escalation: "delta spec の sync 検証で失敗" |
| 7 | `gh` `git` `openspec` バイナリ available | fail なら escalation: "doctor を実行してください" |
| 8 | feature branch の未 push commit 無し（push 漏れがないか） | 警告のみ（user 判断で続行） |

D2. **`--dry-run` mode**

`specrunner finish <slug> --dry-run` で Phase 0 のみ実行し、「実行したら何が起きるか」を report。 destructive op は一切触らない。stdout には:

- 解決された slug + source（B1/B2 のどの分岐か）
- 検知された PR state
- archive 操作の計画（archive 実行 / `--skip-specs` / skip）
- merge 戦略（squash + delete-branch）
- 想定される最終状態（status: archived）

を出力する。

### E. ps コマンドの slug 列追加

E1. **ps 出力 format**

```
JOB_ID    SLUG                       STEP        STATUS    BRANCH                        AGE
e1a7658e  readme-status-section      pr-create   archived  feat/readme-status-section    2d
```

`JOB_ID` の次に `SLUG` 列を追加。`getJobSlug` helper（A3）の戻り値を表示。

E2. **slug 列幅**

長い slug を切り捨てない。ターミナル幅に応じて wrap する case は許容。

### F. `register_branch` custom tool の slug 連動

F1. **propose agent の register_branch 呼び出しで slug も登録**

現状:
```typescript
{ branch: "feat/readme-status-section" }
```

改修後:
```typescript
{ branch: "feat/readme-status-section", slug: "readme-status-section" }
```

または `branch` から server 側で slug を導出（`stripBranchPrefix` helper）。**slug を客体として保存する**ことが目的。

F2. **後方互換性**

既存 propose agent の出力は slug を含まないため、custom tool handler 側で `branch` から slug を導出する fallback を持つ。

### G. test fixture の adversarial 拡充

G1. **新 test ケース**

| Test ID 候補 | シナリオ |
|-------------|---------|
| TC-101 | `state.request.path = "/tmp/dogfooding-001-request.md"`（legacy slug divergence）で finish が PR を merge できる |
| TC-102 | `state.request.path` の basename と `state.branch` の suffix が divergent な場合、branch を採用する |
| TC-103 | `openspec/changes/<slug>/` が不在の場合、archive skip + commit skip + push skip + markJobArchived 直行 |
| TC-104 | `mergeStateStatus = "UNKNOWN"` を 1 回返した後 `"CLEAN"` を返す mock で、retry 経由で merge 成功 |
| TC-105 | Phase 0 で `gh pr view` が auth failure → escalation で feature PR merge は実行されない（main 不変） |
| TC-106 | feature PR が既に MERGED の状態で finish 再実行 → Phase 1-3 skip、Phase 4 のみで markJobArchived |
| TC-107 | `openspec validate` dry-run が fail → escalation、merge は実行されない |
| TC-108 | `--dry-run` mode で何も commit / push / merge しない（spawn の destructive call 0 件 assertion）|
| TC-109 | `--pr 48` で逆引き、headRefName から slug を解決 |
| TC-110 | `specrunner ps` 出力に SLUG 列が表示され、archived 状態の job が含まれる |

G2. **既存 test の維持**

PR #51 で書かれた TC-001〜TC-064 のうち、2-PR モデル前提のもの（archive PR 作成 / chore branch 操作 / 双方の merge orchestration）は **削除する**。1-PR モデルでは存在しないステップ。

### H. ADR

ADR を 1 本残す（`openspec-workflow/adr/ADR-{date}-finish-1pr-model.md`）:

- title: "finish の 2-PR モデル → 1-PR モデル転換"
- context: dogfooding-006 で 2-PR orchestration の脆弱性が露呈、openspec-workflow との設計分岐
- decision: 1-PR モデル採用、archive を feature branch に commit してから merge
- consequences: branch protection の approval dismissal 設定との非互換、fork PR の将来課題、orchestration 複雑度ごとの defect 消滅

## 受け入れ基準

- [ ] `RequestInfo.slug` field が schema に追加され、新規 state file は populate される
- [ ] `getJobSlug(state)` helper が `slug → branch suffix → request.path basename` の fallback を実装
- [ ] `specrunner finish <slug>` が第一形として動作（jobId 渡しは降格、`--job` flag のみ）
- [ ] `specrunner finish` 引数なしで cwd / awaiting-merge から auto-detect
- [ ] `specrunner finish --pr <num>` で逆引き
- [ ] `specrunner finish --dry-run <slug>` で Phase 0 のみ実行（destructive op ゼロ）
- [ ] `chore/archive-<slug>` branch / archive PR は **作成しない**
- [ ] archive 操作は feature branch に push、feature PR merge で main に反映（1-PR モデル）
- [ ] Phase 0 pre-flight が全部通過してから feature PR merge を実行
- [ ] `mergeStateStatus=UNKNOWN` で 3 秒×3 回 retry
- [ ] `ps` 出力に SLUG 列が追加される
- [ ] `register_branch` custom tool が slug も登録（または branch から導出）
- [ ] TC-101〜TC-110 を含む adversarial test fixture を追加
- [ ] 既存テストのうち 2-PR モデル前提のものを削除し、全 test pass を維持
- [ ] ADR `ADR-{date}-finish-1pr-model.md` が openspec-workflow/adr/ に残る
- [ ] `openspec validate finish-redesign` が通る（delta spec 整合性 + RENAMED + MODIFIED 規約）

## 補足

### dogfooding-006 で踏んだ defect の参照（learned-patterns.md に追記済）

- slug divergence: state.branch / PR headRefName に正しい情報があるのに request.path basename を採用
- empty branch push + PR creation: archive 両方 skip でも push して fail
- markJobArchived タイミング: escalation 前に呼ばないため status=success のまま放置
- transient UNKNOWN: 即 escalation で false positive

### openspec-workflow との設計分岐点

| 観点 | openspec-workflow | spec-runner finish |
|------|------------------|-------------------|
| 実行主体 | LLM agent + 人間監視 | deterministic CLI |
| 入力 | pipeline-context.md（worktree filesystem）| state.json（XDG）|
| flexibility | LLM が runtime 判断 | 設計時に全 case 事前組み込み |
| main への反映 | 全て self-PR merge 経由（不変条件）| feature PR の単一 merge で完結（1-PR モデル）|
| archive 失敗時 | LLM が conflict-resolver auto-fire 等で recover | Phase 0 で事前検出し irreversible op に進まない |

### スコープ外

- **openspec-workflow 側の改善**（propose agent の RENAMED 規約 / spec-reviewer の header consistency / verification phase の openspec validate gate）は別 request
- **fork PR 対応** — 単一 author repo 前提。多人数 contribution は将来課題
- **branch protection rule の approval dismissal 設定** — 入れる場合は別 request で再設計
- **PR #48 / dogfooding-006 の orphan cleanup** — 既に PR #55 で実施済み

### 関連

- PR #51 (cli-finish-command): 初版実装（本 request で再設計対象）
- PR #55 (orphan-cleanup): dogfooding-006 後始末
- PR #48 (readme-status-section): dogfooding-006 のターゲット
- 既知メモリ: `project_specrunner_slug_dual_derivation`、`feedback_evaluate_by_absolute_output`
- learned-patterns.md: dogfooding-006 entry（PR #53 で追加済み）
