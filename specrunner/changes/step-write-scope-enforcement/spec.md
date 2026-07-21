# Spec: sequential step の commit を write-set 境界で機械強制する

この spec は sequential step の commit 境界における write-scope 強制の振る舞い正典である。
並列 round 経路（既存の coordinator-owned scoped staging）の振る舞いは対象外であり変更しない。

正典用語:

- **sequential commit 点**: `commitAndPush`（`src/core/step/commit-push.ts`）が単一 sequential
  step の worktree 変更を stage / commit / push する点。
- **write-scope 単一ソース**: 各 step の staging mode と広域 write step の禁止 path 集合を定義する
  leaf module（`src/core/step/write-scope.ts`）。
- **確定的 step（scoped mode）**: `writes(state, deps)` が固定 path を返し、成果物を事前に完全
  列挙できる step。
- **広域 write step（guarded mode）**: 成果物を事前列挙できない step（source code を書く
  implementer / build-fixer / code-fixer / test-materialize、実ファイル名が実行時決定の adr-gen）。
- **宣言出力（declared outputs）**: step の `writes(state, deps)` が返す worktree 相対 path のうち
  `artifact: "gitState"` でない file path の集合。
- **pipeline 管理 path**: `specrunner/changes/<slug>/` 配下の state.json / events.jsonl / usage.json。
- **禁止領域（forbidden paths）**: 広域 write step が変更してはならない正典・他 step 成果物集合。
  request.md を最低限含み、spec.md / design.md / tasks.md / test-cases.md /
  request-review-attestation.json ／ 判定成果物（`*-result-*.md` / `review-feedback-*.md`）から
  その step が writes() で宣言する path を差し引いた集合。

## Requirements

### Requirement: write-scope は単一ソースで定義され責任範囲表と矛盾しない

各 step の許可書込領域は、単一の leaf module（write-scope 単一ソース）で機械可読に定義され
なければならない（MUST）。この定義は rules.md の責任範囲表と矛盾してはならない（MUST NOT）。
具体的には、責任範囲表の 禁止 セルのうち path 表現可能な項目は、対応する step の禁止領域に
含まれなければならず（表 ⊆ 機械）、責任範囲表が Touch 可能とする path を禁止領域に含めては
ならない（MUST NOT）。

#### Scenario: 単一ソースが責任範囲表の禁止項目を下回らない

**Given** write-scope 単一ソースと rules.md 責任範囲表が存在する
**When** 広域 write step の禁止領域を責任範囲表の 禁止 セル（spec / design / tasks / test-cases の
うち該当するもの）と照合する
**Then** 責任範囲表が禁止する path 表現可能な項目はすべて禁止領域に含まれる

#### Scenario: 単一ソースが Touch 可能 path を禁止しない

**Given** implementer は責任範囲表で tasks.md を Touch 可能とされている
**When** implementer の禁止領域を求める
**Then** tasks.md は禁止領域に含まれない

### Requirement: 確定的 step は宣言出力に限定して scoped stage する

sequential commit 点は、確定的 step（scoped mode）に対して、宣言出力と pipeline 管理 path の
union に **限定して** stage しなければならない（MUST）。worktree 全体を無差別に対象とする
`git add -A`（pathspec なし）を使ってはならず（MUST NOT）、宣言 path を pathspec に指定した
scoped add（`git add -A -- <paths>`）でなければならない（MUST）。境界外（request.md 等）の変更が
worktree に存在しても、その変更は commit に混入してはならない（MUST NOT）。

#### Scenario: judge step の request.md 変更が commit に入らない

**Given** judge step（spec-review 相当・scoped mode）の実行後に worktree で request.md が変更されて
いる
**And** その judge step の宣言出力ファイルも変更されている
**When** sequential commit 点が stage / commit を行う
**Then** commit には request.md の変更が含まれない
**And** commit には宣言出力ファイルの変更が含まれる
**And** stage は pathspec を伴わない `git add -A` を用いない

#### Scenario: 正常経路の commit 内容が現行と同一

**Given** 確定的 step が宣言出力と pipeline 管理 path のみを worktree に書き出した
**When** sequential commit 点が stage / commit を行う
**Then** commit 内容は宣言出力と pipeline 管理 path の変更を含み、現行（`git add -A`）と同一である

### Requirement: 広域 write step は禁止領域変更を検出したら fail-closed で halt する

sequential commit 点は、広域 write step（guarded mode）に対して、stage の **前に** worktree 変更を
列挙し、禁止領域への変更が無いことを検証しなければならない（MUST）。禁止領域への変更が 1 件でも
あれば、commit / push を行わず、違反 path を列挙した halt を発生させなければならない（MUST）。
検証不能や違反検出を無視して commit する fail-open であってはならない（MUST NOT）。禁止領域への
変更が無ければ、従来どおり worktree 全体を stage して commit / push する。

#### Scenario: implementer の request.md 変更で commit されず halt する

**Given** 広域 write step（implementer 相当・guarded mode）の実行後に worktree で request.md が
変更されている
**When** sequential commit 点が commit 処理を行う
**Then** commit も push も行われない
**And** halt が発生し、その報告に request.md の path が含まれる

#### Scenario: 境界内のみの変更なら従来どおり commit する

**Given** 広域 write step が禁止領域外（source code / 自身の宣言出力 / pipeline 管理 path）のみを
変更した
**When** sequential commit 点が commit 処理を行う
**Then** worktree 全体が stage され、commit / push が従来どおり行われる
**And** halt は発生しない

### Requirement: spec-review は request.md を入力として宣言する

spec-review step の `reads()` は request.md（`specrunner/changes/<slug>/request.md`）を入力
参照として含まなければならない（MUST）。これにより review が request を正典として読む事実が
step の I/O contract に残り、pre-execution 入力検証の対象になる。

#### Scenario: spec-review の reads() に request.md が含まれる

**Given** spec-review step の I/O contract を評価する
**When** `reads(state, deps)` を呼ぶ
**Then** 返される参照集合に request.md（`specrunner/changes/<slug>/request.md`）が含まれる
