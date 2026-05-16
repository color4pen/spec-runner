# delta spec apply を正規化し silent skip を撲滅する

## Meta

- **type**: spec-change
- **slug**: delta-apply-normalization
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

PR #248 (github-credential-env-separation) を finish した後、`specrunner/specs/github-device-flow-auth/spec.md` を含む 4 capability の baseline spec が delta の内容を反映しない状態のまま archive されていることが判明した。

原因調査:

- `src/core/finish/spec-merge.ts:352` の `mergeSpecsForChange` は `<change>/specs/<capability>/spec.md` 形式 (= 正規 path) を前提に capability ディレクトリを enumerate する
- `<change>/specs/` ディレクトリが存在しない場合、`spec-merge.ts:355-357` は **`{ ok: true, skipped: true }` を返して silent に終了** する
- finish は skip を成功扱いし、archive + PR push が走り、delta は一切反映されないまま完了する

この silent skip 経路は archive 内に複数件 (`codex` / `decouple-pipeline-from-step-names` / `fixer-session-continuity` / `github-credential-env-separation` / `managed-command-extraction`) 累積している。

加えて archive cleanup の調査で判明したこと:

- spec-runner における **delta の正規 path は `<change>/specs/<capability>/spec.md` のみ**である (baseline spec と対称な構造、`src/prompts/spec-fixer-system.ts:48-49` の agent 指示および `src/core/finish/spec-merge.ts:486` の読み込み path で確認可能)
- `<change>/delta-spec.md` 等のフラットファイルは **正規 lifecycle に存在しない**。openspec CLI 時代の旧形式の名残として agent が逸脱して生成したファイル

delta apply は spec-runner の核機能 (baseline spec を SoT として継続的に正しく保つ) であり、silent skip は最も致命的な失敗モード。本 request は silent skip を仕様レベルで撲滅する。

関連 issue:
- #257 (finish 全体の atomicity 一貫設計) は別軸
- #256 (副作用境界の規律) も別軸

## 目的

delta apply 経路の不変条件「`spec-merge` を通過した change は、その change が宣言した delta を baseline に **必ず反映する**」を仕様と実装で保証する。skip は type で正規化された場合のみ許され、それ以外の silent skip は fail に変換する。

## 設計判断

1. **delta apply 経路の不変条件**: `spec-merge` を通過した change はその delta を baseline に必ず反映する。silent skip は不変条件違反として fail にする。delta 自体は SoT ではなく、baseline を更新する operation の集合として扱う
2. **正規 path は format A のみ**: `<change>/specs/<capability>/spec.md` が `spec-merge` が読む唯一の path。正規外ファイル (`<change>/delta-spec.md` 等) は **`spec-merge` の関心外** (検出も apply もしない)。agent が逸脱して書いた場合の対処は `spec-fixer` prompt と review の責任で、`spec-merge` の責務には含めない
3. **cross-capability delta を正規とする**: 1 change が複数 capability に delta を持つことを許す。`spec-merge` は全 capability を atomic に適用する (Pass 1 で 1 capability fail なら全 capability write しない、既存挙動の維持)
4. **type で apply 必須/任意を分岐**:
   - canonical set は `src/config/type-config.ts` の `TYPE_CONFIG` (`new-feature` / `spec-change` / `bug-fix` / `refactoring` / `chore`) を権威ソースとする。比較は厳密一致 (表記揺れは未知 type 扱いで fail)
   - `spec-change` / `new-feature`: `specs/` 必須。実質不在なら fail
   - `bug-fix` / `refactoring` / `chore`: `specs/` 任意。実質不在は正常 skip
   - 補足: `bug-fix` 等でも spec を変えること自体は許される (`specs/` を置けば apply される)。type は「spec を変える可能性」ではなく「spec apply の必須性」を決める軸
5. **atomicity は既存 2-pass を維持**: Pass 1 (parse + validate + compute) で全 capability 検証、Pass 2 (write + git add) は Pass 1 全成功時のみ

## 要件

### 1. type を読み込む

`mergeSpecsForChange` は change の `request.md` から `type` field を読み取る。`src/parser/request-md.ts:parseRequestMdContent` を再利用する。

- `request.md` 不在 → **fail**
- parse error → **fail**
- type field 不在 / `TYPE_CONFIG` に含まれない値 → **fail** (要件 2 の未知 type 分岐)
- 読み込み先は `changeFolderPath(slug)` 配下
- **call order の不変条件**: `mergeSpecsForChange` は `archiveChangeFolder` (= `active → archive` への git mv) **より前に呼ばれる**
- **parser の warn-only 挙動への対応**: `parseRequestMdContent` (`src/parser/request-md.ts:66-68`) は未知 type で **throw せず stderr に warn を出すだけ** のため、`mergeSpecsForChange` 内で TYPE_CONFIG 照合を独立に行い fail にする (parser の戻り値だけに依存しない)

### 2. type 別の skip 判定

`<change>/specs/` ディレクトリの「実質的不在」(= 以下のいずれか) を type 別に分岐させる:

- 実質的不在の定義: (a) `specs/` 自体が無い、(b) `specs/` はあるが capability dir 0 件
- 分岐:
  - `spec-change` / `new-feature`: **fail**。escalation message に「spec を変えると宣言したのに delta が無い」旨を示す
  - `bug-fix` / `refactoring` / `chore`: **正常 skip** (`{ ok: true, skipped: true }`)
  - 未知 type (`TYPE_CONFIG` に無い値): **fail**

### 3. 空 delta の検出

capability dir 配下の `spec.md` が parse できるが **added / modified / removed の合計 0 件** の場合は **fail**。「delta を書いたつもりが何もしていない」silent skip を catch する。

### 4. cross-capability atomic apply (既存挙動の明文化)

現行の 2-pass 実装はすでに cross-capability atomic を満たしている。本要件では:
- 仕様レベルで「複数 capability への delta は atomic」を明文化
- Pass 1 で 1 capability でも fail したら全 capability の write を行わない (既存通り)
- escalation message に「どの capability が、なぜ fail したか」を全部列挙する (1 件目で打ち切らない、既存通り)

### 5. test

- `request.md` 不在 / parse error / type field 不在 → fail
- `spec-change` で `specs/` 実質不在 → fail
- `new-feature` で `specs/` 実質不在 → fail
- `bug-fix` / `refactoring` / `chore` で `specs/` 実質不在 → 正常 skip
- 未知 type (`TYPE_CONFIG` に無い値、表記揺れ含む) → fail
- `specs/` 存在 + capability dir 0 件 → fail (実質的不在の後半分岐 cover)
- capability dir 配下 delta が空 (parse 後 added/modified/removed 合計 0 件) → fail
- cross-capability の Pass 1 部分 fail で全 capability の write が起きない (既存挙動の regression)

### 6. spec authority への反映

`specrunner/specs/spec-merge/spec.md` を **新設** する。新規 capability `spec-merge` を立てて、以下を ADDED で書く:

- Requirement: delta apply の skip 条件は type に依存する (`spec-change` / `new-feature` で specs/ 実質不在は fail、`bug-fix` / `refactoring` / `chore` は正常 skip、未知 type は fail)
- Requirement: capability dir 配下の delta が空 (added/modified/removed 合計 0 件) は fail
- Requirement: cross-capability apply は atomic である
- Requirement: type ↔ apply 規則の権威ソースは `src/config/type-config.ts` `TYPE_CONFIG`。type 追加時には本 spec の規則表を更新する
- Scenario: `spec-change` で `specs/` 無し → fail と escalation
- Scenario: `bug-fix` で `specs/` 無し → 正常 skip
- Scenario: 未知 type → fail
- Scenario: capability dir 配下 delta が空 → fail

`cli-finish-command/spec.md` 等の既存 spec は触らない (= 依存は `spec-merge` への参照のみ)。

### 7. `spec-fixer` の system prompt 更新 (最善努力)

`src/prompts/spec-fixer-system.ts:25-50` の "Delta Spec Format Rules" section を更新し、以下を明示する:
- 正規 path は `<change>/specs/<capability>/spec.md` のみ
- `<change>/delta-spec.md` (単一ファイル)、`<change>/delta-spec/<capability>.md`、`<change>/specs/<name>.delta.md` 等の正規外 path への出力は禁止

**強制ではなく最善努力**。読み側 (`spec-merge`) は正規 path のみを処理し、agent 逸脱を catch する責務は持たない (= 逸脱は prompt と review で対処)。

### 8. Phase 0 check 5-7 から openspec 依存を除去する

`specrunner/specs/cli-finish-command/spec.md:25-44` の Phase 0 check 表のうち以下を削除 / 修正する (openspec CLI graduation 済 [[project_openspec_graduation]] の残骸を一掃する):

- **Check 5** (`openspec/changes/<slug>/` 実存 + delta spec 有無判定 — warning のみ): **削除**。実存判定と delta 検証は `spec-merge` (Phase 1) が type 別 fail-fast で扱う
- **Check 6** (`openspec validate <slug>` dry-run): **削除**。openspec CLI 依存はすでに graduation 済み
- **Check 7** (`gh` `git` `openspec` バイナリ available): **修正**。`openspec` を必須バイナリリストから除去 (`gh` `git` は維持)

`cli-finish-command/spec.md` を **MODIFIED** で更新する (check 表から 5, 6 行を削除、check 7 から `openspec` を削除、関連 Scenario `openspec validate fail で escalation` と `バイナリ不在で escalation` の `openspec` 言及も削除)。

二段階検査 (Phase 0 warning / Phase 1 fail) は乖離リスクを生むため、検証責任を `spec-merge` 1 箇所に集約する。

## スコープ外

- **既存 archive の retro fix** (反映漏れ 5 件の baseline 復元)。本 request は仕様と実装の正規化に絞る。retro fix は別 request (`delta-apply-retro-migration`、未起票) で扱う。**本 request 完了後も既存 archive 配下の正規外 delta は baseline に未反映のまま残る**
- **正規外ファイル (`delta-spec.md` 等) の `spec-merge` での検出**。これは `spec-merge` の責務外 (設計判断 2)。agent 逸脱は `spec-fixer` prompt (要件 7) と review で対処する
- **cross-capability の網羅性検証** (1 change で変えるべき capability を変え忘れていないか)。format では検出不能。spec-fixer prompt と review に委ねる
- **`spec-merge` Pass 2 (write + git add) 失敗時の半適用防止 / Phase 1 内の挿入位置 / fail 時の git 操作抑制 / rollback 戦略** — finish 全体の atomicity 一貫設計として issue #257 で別途扱う
- **副作用境界の規律** (issue #256) は別軸
- **PR description 自動生成** (1 ファイルで意図が読める機能を別経路で埋める案) は別 request

## 受け入れ基準

- [ ] `mergeSpecsForChange` が `request.md` から `type` を読み取る (parser 再利用)
- [ ] `request.md` 不在 / parse error / type field 不在 → fail、test 付き
- [ ] `spec-change` / `new-feature` で `specs/` 実質不在 → fail、test 付き
- [ ] `bug-fix` / `refactoring` / `chore` で `specs/` 実質不在 → 正常 skip、test 付き
- [ ] 未知 type (`TYPE_CONFIG` に無い値、表記揺れ含む) → fail、test 付き
- [ ] capability dir 配下 delta が空 (added/modified/removed 合計 0 件) → fail、test 付き
- [ ] cross-capability の Pass 1 部分 fail で全 write が起きないことの test 付き
- [ ] `specrunner/specs/spec-merge/spec.md` が新設され、上記 Requirement / Scenario が ADDED として書かれている
- [ ] `buildSpecFixerSystemPrompt()` 戻り値が `<change>/specs/<capability>/spec.md` を含み、正規外 path への出力禁止を明示している
- [ ] `cli-finish-command/spec.md` の Phase 0 check 表から 5, 6 行が削除されている (MODIFIED)
- [ ] `cli-finish-command/spec.md` の Phase 0 check 7 から `openspec` バイナリ言及が除去されている
- [ ] `cli-finish-command/spec.md` の `openspec validate fail で escalation` Scenario が削除され、`バイナリ不在で escalation` の `openspec` 言及も削除されている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
