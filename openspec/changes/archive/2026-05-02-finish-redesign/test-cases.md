# Test Cases: finish-redesign

## Summary

- **Total**: 53 cases
- **Automated** (unit/integration/e2e): 49
- **Manual**: 4
- **Priority**: must: 29, should: 17, could: 7

---

## Test Cases

### TC-101: legacy `/tmp/...` request.path で finish が PR を merge できる

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.1, design.md R3

**GIVEN** `state.request.path = "/tmp/dogfooding-001-request.md"`（slug field は null）かつ `state.branch = "feat/readme-status-section"` の legacy state が存在する
**WHEN** `specrunner finish readme-status-section` を実行する
**THEN** `getJobSlug` が branch fallback 経由で `readme-status-section` を返し、Phase 0〜Phase 4 が正常完了し feature PR が merge される。exit code 0

---

### TC-102: request.path basename と branch suffix が divergent な場合 branch 由来 slug を採用する

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.2, design.md D2

**GIVEN** `state.request.path = "/tmp/dogfooding-001-request.md"`（basename = `dogfooding-001-request`）かつ `state.branch = "feat/readme-status-section"` の状態が存在する
**WHEN** `getJobSlug(state)` を呼ぶ
**THEN** branch の prefix `feat/` を strip した `readme-status-section` を返す（path basename `dogfooding-001-request` は採用されない）

---

### TC-103: archive folder 不在で commit / push / merge を skip し markJobArchived 直行

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.3, design.md D3, spec.md C3

**GIVEN** `openspec/changes/<slug>/` が存在しない、かつ `awaiting-merge/<slug>/` も存在しない
**WHEN** `specrunner finish <slug>` を実行する
**THEN** `openspec archive` subprocess は実行されない、`git mv` は実行されない、`git diff --cached --quiet` が変更ゼロを検出し commit step を skip し、push を skip し、Phase 3 の `gh pr merge` を実行し、Phase 4 で `markJobArchived` のみ実行し exit code 0

---

### TC-104: mergeStateStatus=UNKNOWN が 1 回で CLEAN に正規化される（retry 成功）

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.4, design.md D4 check 4

**GIVEN** `gh pr view` の 1 回目が `mergeStateStatus=UNKNOWN` を返し、3 秒後の 2 回目が `mergeStateStatus=CLEAN` を返す mock
**WHEN** Phase 0 check 4 の retry ロジックを実行する
**THEN** 2 回目で CLEAN を検出し retry 成功扱いになり Phase 1 へ進む。retry 経過（`Retrying check 4: mergeStateStatus was UNKNOWN`）が stdout に出力される

---

### TC-105: Phase 0 で `gh pr view` auth failure → escalation、merge 実行されない

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.5, spec.md Phase 0 check 3

**GIVEN** `gh pr view <num>` subprocess が non-zero（auth failure）で終了する mock
**WHEN** `specrunner finish <slug>` を実行する
**THEN** Phase 0 check 3 で escalation が発生し、`gh pr merge` は実行されない、main の状態は変化しない、state.status は `success` のまま、exit code 1

---

### TC-106: feature PR が既に MERGED の状態で finish 再実行 → Phase 1-3 skip、Phase 4 のみ実行

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.6, spec.md C4 / resume scenario

**GIVEN** `gh pr view` が `state=MERGED` を返す、`state.status = "success"` の状態
**WHEN** `specrunner finish <slug>` を実行する
**THEN** Phase 1（archive 操作）/ Phase 2（push）/ Phase 3（merge）を skip し、Phase 4 の `markJobArchived` と `git pull --ff-only` のみ実行する。exit code 0

---

### TC-107: `openspec validate` dry-run fail → escalation、merge 実行されない

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.7, spec.md Phase 0 check 6

**GIVEN** `openspec/changes/<slug>/` が存在し、`openspec validate <slug>` が non-zero で終了する mock
**WHEN** `specrunner finish <slug>` を実行する
**THEN** Phase 0 check 6 で escalation が発生し、`gh pr merge` は実行されない、state.status は変化しない、exit code 1、stderr に validate の失敗内容が出力される

---

### TC-108: `--dry-run` mode で destructive subprocess spawn が 0 件

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.8, spec.md dry-run Requirement

**GIVEN** Phase 0 が全通過する正常状態
**WHEN** `specrunner finish <slug> --dry-run` を実行する
**THEN** `openspec archive` / `git mv` / `git commit` / `git push` / `gh pr merge` / `git checkout main` / `git pull` / `markJobArchived` の subprocess spawn が 0 件である。stdout に固定スキーマの計画（slug / source / pr-state / merge-state-status / archive-plan / merge-strategy / admin-flag / expected-status）が出力される。state file は更新されない。exit code 0

---

### TC-109: `--pr 48` で headRefName から slug を解決し finish が動作する

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.9, spec.md B3

**GIVEN** `gh pr view 48 --json headRefName` が `{ "headRefName": "feat/readme-status-section" }` を返す mock、対応 state が存在する
**WHEN** `specrunner finish --pr 48` を実行する
**THEN** prefix `feat/` を strip して slug `readme-status-section` を確定し、`getJobSlug` で一致する state を解決し Phase 0〜Phase 4 が正常完了する。exit code 0

---

### TC-110: `specrunner ps --all` に SLUG 列が表示され archived ジョブが含まれる

**Category**: integration
**Priority**: must
**Source**: request.md G1, tasks.md 7.10, spec.md E / ps Requirement

**GIVEN** `state.status=archived` のジョブ 1 件と `state.status=success` のジョブ 1 件が存在する
**WHEN** `specrunner ps --all` を実行する
**THEN** 出力に `SLUG` 列ヘッダが `JOB_ID` の次に存在し、archived ジョブの行に `archived` が STATUS 列に表示され、SLUG 列に `getJobSlug` の戻り値が表示される。exit code 0

---

### TC-111: `getJobSlug` — slug field が存在する場合は slug を返す

**Category**: unit
**Priority**: must
**Source**: design.md D2, job-state-store spec.md Scenario "Primary source"

**GIVEN** `state.request.slug = "readme-status-section"` かつ `state.branch = "feat/readme-status-section"`
**WHEN** `getJobSlug(state)` を呼ぶ
**THEN** `"readme-status-section"` を返す（branch fallback には入らない）

---

### TC-112: `getJobSlug` — slug null かつ branch ありで prefix strip して返す

**Category**: unit
**Priority**: must
**Source**: design.md D2, job-state-store spec.md Scenario "Branch fallback when slug is null"

**GIVEN** `state.request.slug = null` かつ `state.branch = "feat/readme-status-section"`
**WHEN** `getJobSlug(state)` を呼ぶ
**THEN** `"readme-status-section"` を返す

---

### TC-113: `getJobSlug` — slug null かつ branch 空で request.path basename を返す

**Category**: unit
**Priority**: must
**Source**: design.md D2, job-state-store spec.md Scenario "request.path basename fallback"

**GIVEN** `state.request.slug = null`, `state.branch = ""`, `state.request.path = "/tmp/dogfooding-001-request.md"`
**WHEN** `getJobSlug(state)` を呼ぶ
**THEN** `"dogfooding-001-request"` を返す（`.md` 拡張子は strip される）

---

### TC-114: `getJobSlug` — 全 source 不在で空文字を返す（throw しない）

**Category**: unit
**Priority**: must
**Source**: design.md D2, job-state-store spec.md Scenario "All sources absent"

**GIVEN** `state.request.slug = null`, `state.branch = ""`, `state.request.path = ""`
**WHEN** `getJobSlug(state)` を呼ぶ
**THEN** `""` を返す。例外は throw されない

---

### TC-115: `stripBranchPrefix` — 5 種の known prefix を全て strip できる

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 1.4

**GIVEN** 入力 branch が各種 prefix 付き: `feat/foo`, `fix/foo`, `change/foo`, `refactor/foo`, `chore/foo`
**WHEN** `stripBranchPrefix` をそれぞれ呼ぶ
**THEN** いずれも `"foo"` を返す

---

### TC-116: `RequestInfo.slug` — canonical path で slug が populate される

**Category**: unit
**Priority**: must
**Source**: job-state-store spec.md Scenario "Canonical request path populates slug", tasks.md 1.5

**GIVEN** `specrunner run openspec-workflow/requests/active/readme-status-section/request.md` で job が起動される
**WHEN** job state が初期化される
**THEN** `state.request.slug === "readme-status-section"` が設定され、最初の persist で state file に書き込まれる

---

### TC-117: `RequestInfo.slug` — non-canonical path（`/tmp/...`）では null が設定される

**Category**: unit
**Priority**: must
**Source**: job-state-store spec.md Scenario "Non-canonical request path leaves slug null", tasks.md 1.5

**GIVEN** `specrunner run /tmp/dogfooding-001-request.md` で job が起動される（legacy invocation）
**WHEN** job state が初期化される
**THEN** `state.request.slug === null` が設定される

---

### TC-118: 既存 state file（slug field 不在）を loadJobState で読み込めて getJobSlug が動作する

**Category**: unit
**Priority**: must
**Source**: design.md R3, job-state-store spec.md Scenario "Legacy state file lacking slug field", tasks.md 1.6

**GIVEN** `slug` field を持たない旧バージョン出力の state JSON file
**WHEN** `JobStateStore.load()` を呼ぶ
**THEN** エラーなしで読み込み成功し `state.request.slug === null`（null 補完）となり `getJobSlug(state)` が branch または request.path から slug を返す

---

### TC-119: Phase 0 check 4 — UNKNOWN が 3 回連続で escalation

**Category**: integration
**Priority**: must
**Source**: spec.md Phase 0 check 4, design.md D4

**GIVEN** `gh pr view` が 3 回連続 `mergeStateStatus=UNKNOWN` を返す mock
**WHEN** Phase 0 check 4 の retry ロジックを実行する
**THEN** 3 回 retry 後に escalation で停止し、`gh pr merge` は実行されない、exit code 1、stderr に「Phase 0 check 4 fail: mergeStateStatus is UNKNOWN after 3 retries」相当のメッセージが出力される

---

### TC-120: Phase 0 check 2 — `state.pullRequest.number` 不在で escalation

**Category**: integration
**Priority**: must
**Source**: spec.md Phase 0 check 2, tasks.md 4.3

**GIVEN** `state.pullRequest` が存在しない（pr-create が未完了の状態）
**WHEN** `specrunner finish <slug>` を実行する
**THEN** Phase 0 check 2 で escalation が発生し `"pr-create が完走していません"` を stderr に出し、`gh pr merge` は実行されない、exit code 1

---

### TC-121: Phase 0 check 7 — バイナリ不在（`gh` なし）で escalation

**Category**: integration
**Priority**: must
**Source**: spec.md Phase 0 check 7 Scenario, tasks.md 4.8

**GIVEN** `gh` バイナリが PATH に存在しない
**WHEN** `specrunner finish <slug>` を実行する
**THEN** `"Binary not found: gh. Run 'specrunner doctor'."` を stderr に出し exit code 1 で停止、destructive op は実行されない

---

### TC-122: 1-PR モデル — chore/archive-<slug> branch が作成されないこと

**Category**: integration
**Priority**: must
**Source**: spec.md C2 / "chore/archive branch assertion", design.md D3

**GIVEN** 正常な finish 実行環境
**WHEN** `specrunner finish <slug>` を実行する
**THEN** `chore/archive-<slug>` という名前の git branch は作成されない、`gh pr create` は実行されない

---

### TC-123: 1-PR モデル通常成功フロー（archive あり・mergeStateStatus=CLEAN）

**Category**: integration
**Priority**: must
**Source**: spec.md Scenario "通常成功フロー（archive あり）"

**GIVEN** Phase 0 全通過、`openspec/changes/<slug>/` 存在、mergeStateStatus=CLEAN
**WHEN** `specrunner finish <slug>` を実行する
**THEN** Phase 1 で archive commit が feature branch に乗り、Phase 2 で push し、Phase 3 で `gh pr merge --squash --delete-branch`（`--admin` なし）が実行され、Phase 4 で `markJobArchived` が呼ばれ `state.status=archived` で persist される。exit code 0

---

### TC-124: markJobArchived は Phase 4 の `git pull --ff-only` 完了後に実行される

**Category**: integration
**Priority**: must
**Source**: design.md Open Questions 決定事項, spec.md markJobArchived Requirement

**GIVEN** Phase 1〜3 が成功し Phase 4 が実行される
**WHEN** Phase 4 の `git pull --ff-only` が成功する
**THEN** `markJobArchived` が `git pull --ff-only` の後に呼ばれ `state.status=archived` で persist される。Phase 4 の `git pull --ff-only` 前の時点では `state.status` が `archived` になっていない

---

### TC-125: Phase 1 で escalation した場合 markJobArchived が呼ばれない

**Category**: integration
**Priority**: must
**Source**: spec.md Scenario "Phase 1 で fail した場合 markJobArchived しない"

**GIVEN** Phase 0 全通過
**WHEN** Phase 1 の `openspec archive` subprocess が non-zero で終了し escalation が発生する
**THEN** `markJobArchived` は呼ばれず、`state.status` は `success` のままである

---

### TC-126: `state.status=archived` の job への 2 回目 finish は no-op

**Category**: integration
**Priority**: must
**Source**: spec.md Requirement "冪等で resume 可能" Scenario "2 回目実行が no-op", tasks.md 3.9

**GIVEN** `state.status=archived` かつ feature PR が MERGED 状態
**WHEN** `specrunner finish <slug>` を 2 回目実行する
**THEN** 全 Phase skip、stdout に `Already archived` が出力され、exit code 0、subprocess spawn は最小（gh pr view まで）

---

### TC-127: `register_branch` — slug 明示入力で state.request.slug が設定される

**Category**: unit
**Priority**: must
**Source**: register-branch-tool spec.md Scenario "1 回呼び出し（slug 明示）"

**GIVEN** ハンドラが `{ branch: "feat/readme-status-section", slug: "readme-status-section" }` で呼ばれる
**WHEN** handler を実行する
**THEN** `state.branch = "feat/readme-status-section"`, `state.request.slug = "readme-status-section"` に設定され、戻り値が `{ ok: true, branch: "feat/readme-status-section", slug: "readme-status-section" }` になる

---

### TC-128: `register_branch` — slug 省略時に branch から prefix strip して slug を導出する

**Category**: unit
**Priority**: must
**Source**: register-branch-tool spec.md Scenario "1 回呼び出し（slug 省略・branch から導出）", tasks.md 6.4

**GIVEN** ハンドラが `{ branch: "feat/readme-status-section" }` のみで呼ばれる（後方互換）
**WHEN** handler を実行する
**THEN** prefix `feat/` を strip して `readme-status-section` を導出し `state.request.slug` に設定する。戻り値が `{ ok: true, branch: "feat/readme-status-section", slug: "readme-status-section" }` になる

---

### TC-129: `specrunner finish --dry-run` で Phase 0 が fail した場合も destructive op ゼロ

**Category**: integration
**Priority**: must
**Source**: spec.md Scenario "dry-run で Phase 0 が fail"

**GIVEN** Phase 0 のうち escalation 対象 check が fail する状態（例: `gh pr view` auth failure）
**WHEN** `specrunner finish <slug> --dry-run` を実行する
**THEN** escalation メッセージを stderr に出し、Phase 1〜4 の subprocess spawn は 0 件のまま、exit code 1

---

### TC-130: `specrunner finish <slug>` 第一引数で slug を直接指定できる

**Category**: integration
**Priority**: should
**Source**: spec.md Requirement "第一形を finish <slug>", tasks.md 2.1

**GIVEN** `getJobSlug(state)` が `"readme-status-section"` を返す state が存在する
**WHEN** `specrunner finish readme-status-section` を実行する
**THEN** 該当 state を採用し Phase 0 pre-flight に進む。exit code 0（Phase 0 全通過前提）

---

### TC-131: awaiting-merge が 0 件の場合 auto-detect で escalation

**Category**: integration
**Priority**: should
**Source**: spec.md Scenario "awaiting-merge 自動検出で 0 件", tasks.md 2.3

**GIVEN** `openspec-workflow/requests/awaiting-merge/` が空
**WHEN** `specrunner finish` を引数なしで実行する
**THEN** `"No request found in awaiting-merge/. Specify <slug>, --pr, or --job."` を stderr に出し exit code 2 で停止する

---

### TC-132: awaiting-merge が 2 件以上の場合 auto-detect で escalation

**Category**: integration
**Priority**: should
**Source**: spec.md Scenario "awaiting-merge 自動検出で 2 件以上", tasks.md 2.3

**GIVEN** `openspec-workflow/requests/awaiting-merge/` 配下に slug が 2 件以上存在する
**WHEN** `specrunner finish` を引数なしで実行する
**THEN** `"Multiple slugs in awaiting-merge/: <slug1>, <slug2>. Specify <slug>, --pr, or --job."` を stderr に出し exit code 2 で停止する

---

### TC-133: cwd が awaiting-merge/<dir>/ 配下の場合 auto-detect で slug を解決する

**Category**: integration
**Priority**: should
**Source**: spec.md Scenario "cwd auto-detect（worktree 内）", tasks.md 2.3

**GIVEN** cwd が `openspec-workflow/requests/awaiting-merge/readme-status-section/` 配下
**WHEN** `specrunner finish` を引数なしで実行する
**THEN** `readme-status-section` を slug として採用し対応 state を解決し Phase 0 に進む

---

### TC-134: 同一 slug に複数 state がある場合は最新 updatedAt を採用する

**Category**: integration
**Priority**: should
**Source**: spec.md Scenario "同一 slug に複数 state が該当する場合"

**GIVEN** `getJobSlug` が `readme-status-section` を返す state が 2 件存在し updatedAt が異なる
**WHEN** `specrunner finish readme-status-section` を実行する
**THEN** updatedAt が新しい state を採用し `Multiple states found for slug readme-status-section, using most recent (updatedAt: <timestamp>)` を stdout に出力して Phase 0 へ進む

---

### TC-135: Phase 0 check 5 — `openspec/changes/<slug>/` 不在でも escalation せず warning のみ

**Category**: integration
**Priority**: should
**Source**: spec.md Phase 0 check 5, design.md D4

**GIVEN** `openspec/changes/<slug>/` が存在しない
**WHEN** Phase 0 check 5 が実行される
**THEN** escalation は発生せず warning ログが出力されて Phase 1 へ進む

---

### TC-136: Phase 0 check 8 — 未 push commit が残っている場合 warning のみで続行する

**Category**: integration
**Priority**: should
**Source**: spec.md Phase 0 check 8 Scenario "feature branch に未 push commit が残っている（warning）"

**GIVEN** feature branch に local 未 push commit が 1 件以上ある
**WHEN** Phase 0 check 8 が実行される
**THEN** `"Warning: feature branch has unpushed commits."` を stderr に出力するが escalation せず Phase 1 へ進む

---

### TC-137: Phase 0 check 9 — feature branch が MERGED + branch 不在の場合 resume path へ

**Category**: integration
**Priority**: should
**Source**: spec.md Phase 0 check 9, spec.md Scenario "feature branch が既に削除済み（resume）"

**GIVEN** Phase 0 で feature branch が remote / local に存在せず、PR が MERGED 状態
**WHEN** Phase 0 check 9 が実行される
**THEN** archive commit が main に反映済みと判定し Phase 1〜3 skip、Phase 4 のみ実行へ進む

---

### TC-138: Phase 2 `git push` 失敗時の escalation — Phase 3 merge が実行されない

**Category**: integration
**Priority**: should
**Source**: spec.md Scenario "Phase 2 git push 失敗時の escalation"

**GIVEN** Phase 1 が成功し Phase 2 の `git push origin <feature-branch>` が non-zero で終了する
**WHEN** `specrunner finish <slug>` を実行する
**THEN** `gh pr merge` は実行されない、`state.status` は Phase 2 前の値（`success`）のまま変化しない、stderr に `Phase 2 fail: git push exited with non-zero.` 相当のメッセージが出力される。exit code 1

---

### TC-139: escalation フォーマット — 必須 4 要素を全て含む

**Category**: integration
**Priority**: should
**Source**: spec.md Requirement "escalation 時に統一フォーマットで report する"

**GIVEN** Phase 0 check 4（UNKNOWN 3 回連続）で escalation が発生する
**WHEN** escalation メッセージを確認する
**THEN** stderr 出力に (1) 失敗した Phase 名と check 番号、(2) 検知された state（mergeStateStatus 値）、(3) 推奨人間操作、(4) 再実行コマンド（`specrunner finish <slug>`）が全て含まれる

---

### TC-140: `specrunner finish --help` の usage に新フラグが含まれる

**Category**: manual
**Priority**: should
**Source**: spec.md cli-commands Scenario "--help の出力", tasks.md 2.6

**GIVEN** specrunner バイナリがビルドされている
**WHEN** `specrunner finish --help` を実行する
**THEN** stdout に `<slug>` 第一形、`--pr`、`--job`（"forensics / debug 用" 表記）、`--dry-run` の説明が含まれ、exit code 0 で終了する

---

### TC-141: `specrunner --help` usage に finish の 1 行説明（1-PR モデル文言）が含まれる

**Category**: manual
**Priority**: should
**Source**: spec.md cli-commands Requirement, tasks.md 2.7

**GIVEN** specrunner バイナリがビルドされている
**WHEN** `specrunner --help` または `specrunner` を引数なしで実行する
**THEN** finish の 1 行説明として「1-PR model」または「squash-merge」を含む文言が出力される

---

### TC-142: ps の `--all` なし時に archived ジョブが表示されない

**Category**: integration
**Priority**: should
**Source**: spec.md ps Requirement "--all 指定なしは archived を表示しない", tasks.md 5.4

**GIVEN** `state.status=archived` のジョブが 1 件存在する
**WHEN** `specrunner ps`（`--all` なし）を実行する
**THEN** archived ジョブの行は出力されない。active / success / failed / terminated のジョブのみ表示される

---

### TC-143: ps 出力の非 TTY（TAB 区切り）形式に SLUG 列が含まれる

**Category**: integration
**Priority**: should
**Source**: spec.md ps Scenario "非 TTY 出力（パイプ等）", tasks.md 5.3

**GIVEN** stdout が非 TTY（パイプ）でジョブが 2 件存在する
**WHEN** `specrunner ps` を実行する
**THEN** ヘッダ行と 2 データ行がタブ区切りで出力される。ヘッダ行の 2 列目が `SLUG` である

---

### TC-144: dry-run の stdout が固定スキーマ（8 フィールド）に従う

**Category**: integration
**Priority**: should
**Source**: spec.md dry-run Requirement "固定スキーマ"

**GIVEN** Phase 0 が全通過する状態
**WHEN** `specrunner finish <slug> --dry-run` を実行する
**THEN** stdout が `slug:`, `source:`, `pr-state:`, `merge-state-status:`, `archive-plan:`, `merge-strategy:`, `admin-flag:`, `expected-status:` の 8 フィールドを含む bullet 形式で、フィールド順が仕様と一致する

---

### TC-145: `git diff --cached --quiet` の exit code で staged 変更ゼロを判定する（stdout 依存禁止）

**Category**: unit
**Priority**: should
**Source**: spec.md "staged 変更ゼロの検出は MUST git diff --cached --quiet の exit code で行う"

**GIVEN** staged 変更がゼロの状態
**WHEN** commit 前の変更確認ロジックを実行する
**THEN** `git diff --cached --quiet` の exit code 0 を根拠に commit skip を決定する。`git commit` の stdout / stderr 文言（"nothing to commit"）には依存しない

---

### TC-146: `register_branch` definition が環境変数・時刻に依存しない決定論的な JSON を生成する

**Category**: unit
**Priority**: should
**Source**: register-branch-tool spec.md Scenario "definition が安定している"

**GIVEN** Agent 作成時に `custom_tools` に渡される `register_branch` definition
**WHEN** 同じ入力で 2 回 JSON-stringify する
**THEN** name / description / input_schema が完全一致する（環境差異なし）

---

### TC-147: `register_branch` — slug なし branch（known prefix なし）で branch 全体が slug になる

**Category**: unit
**Priority**: could
**Source**: register-branch-tool spec.md Scenario "prefix が無い branch で slug 省略"

**GIVEN** ハンドラが `{ branch: "main-something" }` で呼ばれる（既知 prefix なし）
**WHEN** handler を実行する
**THEN** strip 不可のため `state.request.slug = "main-something"` が設定される（branch 全体を fallback として採用）

---

### TC-148: `register_branch` — 空文字列 slug は無視して branch から導出する

**Category**: unit
**Priority**: could
**Source**: register-branch-tool spec.md Scenario "空文字列 slug が渡された場合は branch から導出"

**GIVEN** ハンドラが `{ branch: "feat/readme-status-section", slug: "" }` で呼ばれる
**WHEN** handler を実行する
**THEN** 空文字列 slug は state.request.slug に書き込まれず、`feat/` prefix を strip して `readme-status-section` を導出し state.request.slug に設定する

---

### TC-149: `register_branch` — 連続 2 回呼び出し（last-write-wins）

**Category**: unit
**Priority**: could
**Source**: register-branch-tool spec.md Scenario "連続 2 回呼び出し"

**GIVEN** ハンドラが `{ branch: "a", slug: "x" }` → `{ branch: "b", slug: "y" }` で連続呼び出しされる
**WHEN** 2 回目の呼び出しが完了する
**THEN** 最終 `state.branch = "b"`, `state.request.slug = "y"` になり、両呼び出しともエラーは発生しない

---

### TC-150: legacy state file に slug field が書き込まれる（次回 persist で migrate）

**Category**: unit
**Priority**: could
**Source**: job-state-store spec.md Scenario "Subsequent persist writes slug field", tasks.md 1.2

**GIVEN** `slug === null` の legacy state が load され、downstream コードが `state.request.slug` に値を代入して `JobStateStore.persist()` を呼ぶ
**WHEN** persist された JSON file を読み込む
**THEN** JSON に `slug` field が含まれている

---

### TC-151: `JobStatus` の `archived` が persist / load を通じて保持される

**Category**: unit
**Priority**: could
**Source**: job-state-store spec.md Scenario "New status value archived persists across load/save"

**GIVEN** `state.status = "archived"` で `JobStateStore.persist()` を呼んだ後
**WHEN** `JobStateStore.load()` で同ファイルを読み込む
**THEN** `state.status === "archived"` が保持されている

---

### TC-152: `specrunner` にサブコマンドなしで実行した場合 6 サブコマンドの usage が出力される

**Category**: manual
**Priority**: could
**Source**: spec.md cli-commands Scenario "引数なしで実行された場合"

**GIVEN** specrunner バイナリがビルドされている
**WHEN** `specrunner` を引数なしで実行する
**THEN** stderr に init / login / run / ps / doctor / finish の 1 行説明を含む usage が出力され、exit code 2 で終了する

---

### TC-153: `specrunner foobar` で unknown command エラーが正しく出力される

**Category**: manual
**Priority**: could
**Source**: spec.md cli-commands Scenario "不明なサブコマンドが渡された場合"

**GIVEN** specrunner バイナリがビルドされている
**WHEN** `specrunner foobar` を実行する
**THEN** `Unknown command: foobar` を stderr に出し、6 サブコマンドの usage を続けて表示し exit code 2 で終了する

---

## 削除対象（実装時参照）

以下は 2-PR モデル前提の既存テストケースであり、1-PR モデル転換に伴い **削除する**:

- TC-001〜TC-064 のうち `createArchivePr` / `pushAndCreateArchivePr` / `prepareArchiveBranch` / `checkArchivePrAlreadyMerged` を呼ぶことを前提とするテストケース
- `chore/archive-<slug>` branch の作成を前提とするテストケース
- archive PR の作成 / auto-merge を前提とするテストケース

削除候補の特定方法: テスト内で `archivePr` / `archiveBranch` / `prepareArchive` / `createArchive` のいずれかを mock / stub しているケースを抽出する。
