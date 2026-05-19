# Review Feedback: delta-spec-auto-classification

## Verdict

- **verdict**: needs-fix

## Summary

Core auto-classification logic、DSV rule、prompt fragment、test coverage は受け入れ基準をほぼ満たしており、自己マイグレーション (T-00) と verification も green。ただし (1) ADR が作成されていない (request.md `adr: true` + 受け入れ基準 + T-15 必須) HIGH 違反、(2) `applyMerge` が strict name 比較のため `classifyDeltaSpec` で normalize-match した markdown decoration 付き Requirement で MODIFIED が ENOENT になる integration バグ、(3) Renamed セクションで ASCII `->` を silently 落とす parser 仕様の見過ごしリスク、の 3 点を fix 推奨。

## Findings

### [HIGH] ADR ファイルが作成されていない (T-15 / 受け入れ基準未達)

**File**: `docs/adr/` (該当ファイル不在)
**Line**: N/A
**Issue**: request.md `adr: true` (L8) を宣言し、受け入れ基準 (L123) と T-15 (tasks.md L204-213) は `docs/adr/` 配下に「LLM 不確定性に対する構造的解決の思想と本 request の位置付け」を記録する ADR ファイルを必須としている。tasks.md では T-15 がすべて `[x]` でチェック済みだが、worktree 内で `find docs/ -type f` および `find . -iname 'adr-*'` を実行しても本 request 用 ADR は存在しない (`openspec-workflow/adr/` は別 repo の archive)。チェックボックスが事実と乖離しており、test-cases.md TC-15-01 / TC-15-02 (must) も実際には未達成。
**Fix**: `docs/adr/ADR-<YYYYMMDD>-delta-spec-auto-classification.md` を作成し、tasks.md T-15 の記録内容 (背景: PR #283/#289/#299/#323、D1〜D7 要約、trade-off: 旧形式 delta spec の移行) を記述する。tasks.md T-15 のチェックボックスは ADR ファイルが実在するまで `[ ]` に戻す。

### [HIGH] applyMerge が strict name 比較のため markdown decoration 付き MODIFIED が ENOENT になる

**File**: `src/core/finish/spec-merge.ts`
**Line**: 408 / 418 / 428
**Issue**: `classifyDeltaSpec` (L204-235) は `normalizeRequirementHeader` を使って `**Existing**` (delta) と `Existing` (baseline) をマッチさせて `modified` に分類する。しかし `applyMerge` (L402-442) は `r.name === block.name` の strict equality で baseline を検索するため、`modified[i].name = "**Existing**"` / `baseline.name = "Existing"` のとき `findIndex` が -1 を返し、`"MODIFIED: Requirement \"**Existing**\" not found in baseline"` で fail する。TC-SM-019b は `classifyDeltaSpec` 単体しか検証しないため抜けている。`checkBaselineHeaderConsistency` (L340-392) は normalize で通すので、結果として「dsv pass → spec-review pass → consistency check pass → merge fail」という最下流での非対称が発生する。design D3 (型互換維持) の前提が崩れている。
**Fix**: 以下のいずれか:
1. `applyMerge` の `findIndex` / `some` を `normalizeRequirementHeader(r.name) === normalizeRequirementHeader(block.name)` に置換し、置換後 `reqs[idx] = block` する際に `block.name`/`block.content` を baseline header に合わせる (header line の rewrite)。
2. `classifyDeltaSpec` で `modified` に詰める際に baseline 側の name にそろえる (`block.name = baselineReqs[idx].name` + content の header line を baseline name で rewrite)。こちらの方が下流に変更を波及させず安全。
追加で TC-SM-104 系に「delta header に `**Bold**` decoration あり + baseline 一致 → merged 後の rendered baseline が baseline name を保ったまま content だけ差し替わる」integration test を追加する。

### [MEDIUM] Renamed セクションが ASCII `->` / 全角クォート等を silently 落とす

**File**: `src/core/finish/spec-merge.ts`
**Line**: 154
**Issue**: `^-\s+"(.+?)"\s*→\s*"(.+?)"\s*$` は U+2192 (`→`) のみを受理する。agent が `->`、`⇒`、または "smart quotes" (`"…"`) を出力した場合、line は match に失敗して `parseDeltaSpec` は無言で renamed を空のまま返す。下流の empty-delta check は requirements が非空であれば通り、結果として「rename 意図が完全に失われた状態で MODIFIED 判定が走り、`### Requirement: <new name>` が ADDED として末尾追加される + 旧 name は baseline に残存」という silent data corruption が起こる。prompt fragment (L72) で `→` を指示しているが、LLM が確率的に守らない領域そのもの (= 本 request の問題意識) で再発する。
**Fix**: 以下のいずれか:
1. parser を寛容にする (`(?:→|->|=>)` のいずれかを許容)。これが最小変更で agent の誤記を吸収できる。
2. `## Renamed` セクション内で list pattern (`-\s+".+?"`) を含むが arrow match に失敗した行を検出した場合、warning または error として `parseDeltaSpec` 経由で escalation に乗せる (silent ignore を禁止)。
prompt 規律で防げない部分は parser で吸収する、という本 request の思想に最も整合する。

### [LOW] tasks.md チェックボックスと実態の乖離

**File**: `specrunner/changes/delta-spec-auto-classification/tasks.md`
**Line**: 206-213
**Issue**: T-15 の subtasks 3 件 (`[x]`) はすべて ADR 作成済みを示すが、ADR ファイルは worktree に存在しない。implementer が手戻りで checkbox を更新せずに完了申告した可能性。HIGH finding #1 で fix 時に同期する。
**Fix**: ADR を作成後 checkbox を維持、または ADR を作成しない判断なら request.md `adr: true` を撤回しチェックを外す。

### [LOW] parseDeltaSpec の `## Requirements` 重複時の flush 順序

**File**: `src/core/finish/spec-merge.ts`
**Line**: 131-133
**Issue**: ファイル内に `## Requirements` が複数回現れた場合、L132 で flush して L133 で同じ section を再 set している。意図 (同セクションの再オープン許容) は推測できるが、tests/finish-spec-merge.test.ts には fixture がない。`parsed.requirements` の重複検出は `validateDeltaSpec` (L300) で `duplicates in ADDED/MODIFIED section` として弾けるが、新形式 delta では「`## Requirements` が複数あれば dsv で reject すべき」の方が UX として明確。本変更のスコープ外と判断できるが、補完テストの追加を推奨。
**Fix**: dsv の canonical-spec-structure rule に「`## Requirements` の出現回数 ≤ 1」の check を追加するか、本件は backlog として記録。

## Acceptance Criteria Check

| # | Criteria | Status |
|---|----------|--------|
| 1 | `spec-merge.ts` が新形式 delta spec を読み baseline と突合して ADDED/MODIFIED を自動分類 (`parseDeltaSpec` + `classifyDeltaSpec`) | ✅ |
| 2 | 新規 capability (baseline 不在) → 全 Requirement が ADDED 扱い (`mergeSpecsForChange` ガード + `classifyDeltaSpec(parsed, null)`) | ✅ |
| 3 | `## Removed` リストの name が baseline から削除される | ✅ |
| 4 | `## Renamed` の old → new が MODIFIED 判定の前に適用される | ⚠️ (アルゴリズムは正しいが ASCII arrow silent drop が Finding [MEDIUM] にあり) |
| 5 | dsv が旧形式 section header (`## ADDED Requirements` 等) を HIGH violation として reject | ✅ |
| 6 | dsv が新形式 (`## Requirements` / `## Removed` / `## Renamed`) を必須とする | ✅ (Requirements は必須、Removed/Renamed は optional でデザイン通り) |
| 7 | `DELTA_SPEC_FORMAT` fragment が新形式に書き換えられている (string assertion) | ✅ |
| 8 | `design-system.ts` checklist が新形式に追随 (string assertion) | ✅ |
| 9 | `tests/` 配下の既存 delta spec fixture が全て新形式 | ✅ (pipeline-integration.test.ts L1481 の "Replace '## ADDED' with '## ADDED Requirements'" は legacy reject 動作の fixture と推定、要確認だが本変更スコープ外) |
| 10 | `bun run typecheck && bun run test` green | ✅ (verification-result.md: 2239/2239 passed) |
| 11 | ADR に「LLM 不確定性に対する構造的解決」の思想と本 request の位置付けが記録 | ❌ (Finding [HIGH] #1) |

### test-cases.md must-scenario coverage spot-check

| TC | Status | Note |
|----|--------|------|
| TC-01-01〜06 (parseDeltaSpec) | ✅ | TC-SM-010〜014 で被覆 |
| TC-02-01〜05 (classifyDeltaSpec) | ✅ | TC-SM-015〜019 で被覆 |
| TC-02-07 (normalized header matching) | ⚠️ | TC-SM-019b は classify 単体のみ。integration (= merge 後の rendered baseline) が抜けており Finding [HIGH] #2 と関連 |
| TC-02-08 (delta 不在 baseline Requirement の保持) | ✅ | TC-SM-072/074 で間接被覆 |
| TC-03-01〜05 (mergeSpecsForChange 統合) | ✅ | TC-SM-103〜105 + 既存テストで被覆 |
| TC-04-01〜07 (dsv legacy reject) | ✅ | canonical-spec-structure.test.ts TC-DSV-13/14 + validator.test.ts TC-V-16 |
| TC-05-01〜07 (prompt fragment) | ✅ | fragments.test.ts T-12 ブロック |
| TC-07-01〜02 (spec-review-system) | ✅ | spec-review-system.test.ts TC-015/016/017 で被覆 |
| TC-15-01〜02 (ADR) | ❌ | ADR 不在 (Finding [HIGH] #1) |
