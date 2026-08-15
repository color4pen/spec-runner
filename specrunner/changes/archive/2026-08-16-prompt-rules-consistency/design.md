# Design: prompt/rules の新 pipeline 構造への追随

## Context

#991〜#999 の一連の変更で pipeline の実体が更新されたが、agent が実行時に読む prompt / rules / PIPELINE_MAP の一部が旧世界の記述のまま残っている。具体的な矛盾は 5 点。

### 現状確認（Fact-Check 済み）

| ファイル | 矛盾の内容 | 矛盾の相手 |
|---|---|---|
| `src/prompts/implementer-system.ts:21` | `tasks.md — 正典（実装の唯一のインプット）` | initial message の `test-cases.md と spec を canon(正)として` + conformance 二層モデル |
| `src/prompts/implementer-system.ts:59` | `commit message に test_cases_skipped` | COMMIT_DISCIPLINE（agent の git commit を禁止） |
| `src/prompts/rules.ts:23` | `前の session の文脈を持たない（各 step は新規セッションで実行される）` | #998 の verification 失敗 → implementer continuation 経路 |
| `src/prompts/pipeline-map.ts` | `bite-evidence` 行が存在しない（14 行） | `bite-evidence` が `CLI_STEP_NAMES` に存在し pipeline descriptor に wired 済み |
| `src/prompts/pipeline-map.ts` | `conformance` 行: `4 成果物（request / design / tasks / spec）への適合性を検証する` | #992 の normative/plan 二層化 |
| `src/core/resume/resolve-step.ts:132` | `stateStep` を `LEGACY_STEP_ALIASES` に通さず `allowed.has(stateStep)` で直接判定 | path 1 / path 3 との非対称（hard crash 時に旧 step 名で throw） |

---

## Goals / Non-Goals

**Goals**:
- agent が読む prompt / rules / PIPELINE_MAP を実体と一致させる（文言追随のみ）
- `stateStep` の legacy alias 解決穴を塞ぎ、旧 job の crash recovery を通す

**Non-Goals**:
- authority の実質変更（責務・write-scope・遷移）
- `test_cases_skipped` の機械的な消費機構の新設
- code-fixer 統合判断・bite-evidence の file-set 変更
- issue の close / 整理

---

## Decisions

### D1: implementer authority 表現を 4 層に置換する

**Decision**: `IMPLEMENTER_BASE` の `## Contract` 入力節を、conformance の二層モデルおよび initial message と整合する 4 層構造に置換する。「唯一のインプット」という旧表現を撤去する。authority の実質（テストと実装を test-cases.md / spec に整合させる責務）は変更しない。

4 層の構造:
- `request.md` / `spec.md` — 依頼意図の正典（normative）
- `test-cases.md` — レビュー済みの検証契約
- `tasks.md` — 実装の作業計画
- `design.md` — 設計根拠・文脈（read-only）

**Rationale**: tasks.md を唯一の正典とする記述は、conformance が request/spec を normative として検証する事実と矛盾する。agent が互いに矛盾する authority 記述を受け取ると判断がぶれる。

**Alternatives**: 変更しない → implementer が tasks.md のみを見て spec/request を軽視するリスクが残る。

---

### D2: test_cases_skipped の記録先を completion report に変更する

**Decision**: `implementer-system.ts:59` の「commit message に `test_cases_skipped`」を「完了報告（completion report）に `test_cases_skipped`」に置換する。書式（`test_cases_skipped: [TC-ID — 理由]`）は変更しない。

**Rationale**: COMMIT_DISCIPLINE が agent の `git commit` を禁止し、executor の commit message format は `<step>: <slug>` 固定。commit message への橋渡し機構が存在しないため当該指示は実行不能。completion report は PRODUCER_REPORT_TOOL 経由で agent が書ける唯一の構造化出力先。

**Alternatives**: passthrough 機構の新設 → スコープ外（消費機構は将来課題）。

---

### D3: rules の session 記述に verification 失敗後の例外を追加する

**Decision**: `rules.ts:23` の全面断言（「各 step は独立した agent session」「前の session の文脈を持たない」）を、原則 + 例外の構造に更新する。

原則: 各 step は独立した新規 session（前の session の文脈を持たない）として実行される。
例外: verification 失敗後の implementer 再入は、直前の implementer session の continuation として実行される（session が無い場合は fresh session に fallback）。

**Rationale**: `verificationFailedLast + getPreviousSessionId` による continuation 経路が `implementer.ts` に実装済みであり、rules の断言と矛盾する。continuation を受けた agent が自分の context を不正だと誤認するリスクがある。

**Alternatives**: 例外を rules から省く → continuation を受けた agent が自分の context に困惑する原因が残る。

---

### D4: PIPELINE_MAP に bite-evidence 行を追加する

**Decision**: `pipeline-map.ts` に `bite-evidence` 行を `implementer` と `verification` の間に追加する（bite-evidence-pipeline.test.ts で `implementer → bite-evidence → verification` の wiring が確認済み）。行数は 14 → 15 になる。TC-018 の `expect(rows.length).toBe(14)` を `15` に更新する（enumerated update target）。

責務例: 「Evidence Base（job 開始時点の実装 + candidate のテスト）上で red→green を機械実行し、テストが変更に噛むことを証明する（CLI step）」

**Rationale**: `bite-evidence` は `CLI_STEP_NAMES` に存在し pipeline descriptor に wired 済みだが PIPELINE_MAP から欠落している。agent が読む pipeline 全体像が不完全。

**Alternatives**: 追加しない → agents が bite-evidence の存在を知らないまま。

---

### D5: conformance 行を normative/plan 二層化後の記述に更新する

**Decision**: `pipeline-map.ts` の conformance 行を以下に更新する。

`| conformance | request / spec を規範（normative）、design / tasks を計画（plan）として適合性を検証する |`

**Rationale**: 現行の「4 成果物（request / design / tasks / spec）への適合性を検証する」は二層化前の記述。conformance prompt 自体は #992 で既に二層化されており、PIPELINE_MAP だけが旧記述のまま。

---

### D6: stateStep path に LEGACY_STEP_ALIASES を適用する

**Decision**: `resolve-step.ts` の path 4（`stateStep` branch、hard crash recovery）に、path 1 / path 3 と同じ「alias → member→coordinator 写像 → allowed 判定」を適用する。

`allowed.has()` ガードは path 4 に維持する（path 3 と異なる）。これにより「alias 解決後に許可集合外の値」は引き続き throw し、誤 routing なし。

変更対象: `if (stateStep !== undefined && allowed.has(stateStep)) {` の前で alias 解決を挟む。

**Rationale**: hard crash 時は `resumePoint` が書き込まれないため、旧 step 名（`build-fixer` / `test-materialize`）が `state.step` にのみ残る。path 4 だけが alias を通さないため、このパスで throw が発生する。path 1 / path 3 との対称性で修正する。

**Alternatives**: stateStep の alias 適用を skip → 旧 job の crash recovery が分かりにくいエラーで止まる状態のまま。

---

### D7: テストの追加場所

| 受け入れ基準 | テストファイル | 追加方式 |
|---|---|---|
| AC-1〜4（prompt / rules / PIPELINE_MAP 変更固定） | `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` | TC-029〜TC-035 を末尾に追加 |
| TC-018 行数更新（14 → 15） | 同上 | in-place 更新（`toBe(14)` → `toBe(15)`、`EXPECTED_STEPS` に `"bite-evidence"` 追加、description 更新） |
| AC-5（stateStep path-4 alias） | `src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts` | TC-012 / TC-013 を末尾に追加 |

---

## Risks / Trade-offs

**[Risk] TC-018 の行数更新が他の変更と衝突する** → 変更は単一箇所（`toBe(14)` → `toBe(15)`）で影響が局所的。bite-evidence 行追加と同一 commit で適用するため不整合なし。

**[Risk] stateStep path-4 の alias 適用で許可外の step が通過する** → `allowed.has(resolvedStateStep)` ガードを残すため、alias 解決後に許可集合外の値は引き続き throw。誤 routing なし。

**[Risk] rules の例外記述が agent に continuation を強制させると誤解させる** → 記述は「CLI が…として実行する」という事実の説明であり、agent が自分で continuation かどうかを決める指示ではない。

---

## Open Questions

なし（要件が明確で設計分岐なし）。
