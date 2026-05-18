# spec-merge に MODIFIED Requirement header の baseline 一致 machine check を追加する

## Meta

- **type**: new-feature
- **slug**: spec-merge-baseline-header-check
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-19
- **author**: color4pen
- **issue**: #313

## 背景

PR #306 / PR #308 finish で同型の spec-merge escalation が連続発生。`#313` Sub-1 (= `spec-review-baseline-pull-model`) で層 3 (= spec-reviewer agent の baseline check) を Read-tool-pull モデルに切替えるが、LLM 判断ミスで素通りした場合の **最後の安全網** として、機械 check を `spec-merge` (= finish の Phase 1) に追加する。

### 移植元

openspec CLI の `archive` コマンドが内部で実行する baseline header check (= `@fission-ai/openspec` パッケージの `specs-apply.js` 内、`MODIFIED failed for header "..." - not found` で throw する処理):

```
概要: delta spec の MODIFIED block を normalize し、baseline 内の対応 header を 
探索、不一致なら throw。
```

40 行程度のロジック (= normalize + 探索 + throw)。実装時に該当パッケージのソースを参照する (= 行番号は upstream 更新でズレるため概念説明のみに留める)。

### spec-runner との差分

`src/core/finish/spec-merge.ts` (= finish の Phase 1) は既に delta spec を parse して baseline に統合する経路を持つが、**header 一致の事前 check は実装されていない**。現状は統合経路の中で「該当 header が見つからない場合 escalation」する遅延的検出 (= PR #306 / PR #308 の経路)。本 request では Phase 1 の最初に明示的な事前 check として実装する。

## 設計判断

### 1. 配置場所

`src/core/finish/spec-merge.ts` の `mergeSpecsForChange` 内、既存の `applyMerge` 呼び出しの **前** に baseline header 一致 check を実行 (= orchestrator.ts:236 の `mergeSpecsForChange` 呼び出し経路に組み込む):

- delta spec を parse (= 既存処理流用)
- 各 capability について baseline (= `specrunner/specs/<capability>/spec.md`) を読み込み
- MODIFIED / REMOVED の header が baseline に存在するか check
- 1 件でも違反があれば escalation (= 既存の `SpecMergeError` を再利用) → `applyMerge` には到達しない

### 2. header normalization

openspec `specs-apply.js` の `normalizeRequirementName` 相当を移植:

- 前後の空白 trim
- 大文字小文字は維持 (= openspec も大文字小文字保持で比較)
- markdown 装飾 (= bold / code block) は剥がす

実装時に specs-apply.js の normalization ロジックを参照して spec-runner 側で再現。

### 3. check 対象

- `## MODIFIED Requirements` 配下の `### Requirement: <name>` header → baseline に存在 MUST
- `## REMOVED Requirements` 配下の `### Requirement: <name>` header → baseline に存在 MUST
- `## ADDED Requirements` 配下 → baseline に存在しない MUST (= 重複追加を防ぐ)

`## RENAMED Requirements` は本 request スコープ外 (= 既存 `parseDeltaSpec` が RENAMED 未対応、過去 88 archives で発動例 0 件のため将来別 request で対応)。

baseline file が存在しない場合:

- MODIFIED / REMOVED がある時点で違反 (= 新規 capability なら ADDED のみ使うべき)
- ADDED のみなら通過

### 4. escalation message

違反検出時の escalation message は spec-merge の既存 format に準拠:

```
Failed Step:       spec-merge
Detected State:    [<capability>] MODIFIED: Requirement "<header>" not found in baseline
Recommended Action:
  Fix the delta spec errors listed above and re-run: specrunner finish <slug>
```

(= 既存 message format と同じ。違反 reason に「MODIFIED」「REMOVED」「ADDED-duplicate」等を含める)

### 5. 既存検出経路との関係

既存の遅延検出 (= 統合中に header 不在で escalation) は残しつつ、本 request の事前 check が先に弾く形:

- 事前 check 通過 → 既存統合経路で安全に処理
- 事前 check 違反 → 早期 escalation (= 既存統合経路まで到達せず)

= 既存の動作を破壊せず、より早期に違反を検出する構造。

## 要件

### 1. `spec-merge.ts` に baseline header 一致 check 関数追加

`src/core/finish/spec-merge.ts`:

- 新規 function `checkBaselineHeaderConsistency(deltaSpec, baselineSpec)` を追加
  - 入力: 各 capability の delta spec content + baseline spec content (= 不在なら null)
  - 出力: violation list (= 各違反に capability / section / header / reason を含む)
- Phase 1 の最初 (= archive on feature branch の直後、既存の delta spec 統合経路の前) で呼び出し
- violation が 1 件以上あれば既存 `SpecMergeError` で escalation

### 2. header normalization 関数

`src/core/finish/baseline-headers.ts` (= 新規 file、または `spec-merge.ts` 内 local):

- `normalizeRequirementHeader(text: string): string` を実装
- openspec `specs-apply.js` の同等ロジックを参照して再現
- 単独 export して test 可能にする

### 3. test

`tests/unit/core/finish/spec-merge-baseline-check.test.ts` (= 新規):

- TC-SMB-01: baseline に存在する MODIFIED header → 通過
- TC-SMB-02: baseline に存在しない MODIFIED header → escalation (= violation 1 件)
- TC-SMB-03: baseline 不在 + MODIFIED 存在 → escalation (= MODIFIED 件数分の violation)
- TC-SMB-04: REMOVED の baseline 不在 header → escalation
- TC-SMB-05: ADDED の baseline 既存 header → escalation (= duplicate)
- TC-SMB-06: 全 section (= ADDED / MODIFIED / REMOVED) の組合せで違反混在 → 各 violation を個別に報告
- TC-SMB-07: normalization 動作確認 — delta header `### Requirement: **Foo**` (= markdown bold) vs baseline header `### Requirement: Foo` (= 装飾なし) → 通過 (= bold 剥がし正規化が機能)

### 4. 既存 spec-merge test の regression なし

既存 `tests/finish-spec-merge.test.ts` の test 群が全て通過する。

### 5. spec authority への反映

⚠️ 教訓 (= PR #306 / PR #308): delta spec target capability の baseline (`specrunner/specs/spec-merge/spec.md` or 該当 capability) を実装時に MUST Read で確認し、対応 Requirement が存在する場合は MODIFIED、存在しない場合は ADDED を選択する。

delta spec target candidates:

- 既存 `spec-merge` capability があれば MODIFIED (= 事前 check の追加を反映)
- 不在なら ADDED で新規 Requirement 追加

Requirement 内容:

- spec-merge は finish の Phase 1 の最初に baseline header 一致 check を実行 MUST する
- 違反検出時は SHALL escalation (= 既存統合経路に到達しない) する
- baseline が存在しない場合に MODIFIED / REMOVED / RENAMED-FROM が delta spec に含まれている場合 SHALL violation を返す
- baseline に既存の header と一致する ADDED header は SHALL violation を返す
- header normalization は openspec `specs-apply.js` と同等のロジックを使用 MUST

## スコープ外

- spec-review 側の baseline 確認経路強化 (= #313 Sub-1 で別途対応)
- design 側の baseline 確認手順強化 (= 既に design-system.ts:155 に書かれているが実効性問題は別、将来 issue 化)
- spec-merge の Phase 2 (= write + git add) の整理 (= #257 で別途議論)
- openspec validate の機能複製 (= intra-delta sanity check は本 request 範囲外)
- `## RENAMED Requirements` 対応 (= 既存 `parseDeltaSpec` の RENAMED 未対応、過去 archive で発動例 0 件のため将来別 request で parser 拡張と一緒に対応)

## 受け入れ基準

- [ ] `src/core/finish/spec-merge.ts` に baseline header 一致 check 関数が追加されている
- [ ] Phase 1 の最初 (= archive on feature branch 直後) で check が呼ばれる
- [ ] header normalization 関数が `src/core/finish/baseline-headers.ts` (or `spec-merge.ts` 内) に実装されている
- [ ] baseline 不在 + MODIFIED/REMOVED 存在で escalation
- [ ] baseline に存在しない MODIFIED/REMOVED header で escalation
- [ ] baseline に既存する ADDED header (= duplicate) で escalation
- [ ] `tests/unit/core/finish/spec-merge-baseline-check.test.ts` で TC-SMB-01〜07 が green
- [ ] 既存 `spec-merge.test.ts` の regression なし
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec が baseline 確認の上で適切な section (ADDED or MODIFIED) で作成されている

## Workflow Options

- enabled: []
