# 設計層 topic 排出 — archive 時に design-level findings を design/topics/ へ機械排出する

## Meta

- **type**: new-feature
- **slug**: design-topic-emission
- **base-branch**: main
- **adr**: true

## 背景

設計層 CLI（aozu）の交換面契約（aozu リポジトリ spec/integration.md §6）は、実装工程で出た設計レベルの摩擦（レビューの構造指摘・スコープ外 finding）をパイプラインが topic として設計正本へ機械排出することを定めている。契約の要点（本 request 内で自己完結するよう転記）:

- 排出対象は「解決が change folder の外——設計正本（design/）——への変更を要する finding」。判定は呼び出し側（本ツール）の責務で、**過剰排出は許容される**（topic の下流は人が裁く。取りこぼし = 設計債務の不可視化の方が高くつく）
- 書式: `design/topics/<slug>.md`。flat frontmatter（ネスト・複数行値なし）で `id: top-<slug>`（必須）と `source:`（出所への逆リンク、任意）。本文は症状・動機。暫定裁定を書いてよいが「提案であって決定ではない」
- slug 文法: `[a-z0-9]+ ("-" [a-z0-9]+)*`（小文字英数のハイフン区切り）
- 冪等: slug は finding の同一性から決定的に導出し、既存ファイルは上書きしない
- タイミング: 遅くとも取り込み（archive / merge）まで
- 縮退: designLayer 無効または design/ 不在では排出しない（no-op）。design/topics/ が無ければ作成してよい
- aozu CLI の呼び出しは不要（ファイル契約のみ）

実地の根拠: aosora（designLayer 有効プロジェクト）の 4 ジョブ（2026-07-04〜05）で halt 6 件のうち 2 件は解決が設計正本に返った（request-review の needs-discussion finding → 依存設計の取り込み手順を定める ADR の新設 / spec-review escalation の decision-needed findings → design 文書の BAN セマンティクス修正）。現状この種の finding は escalation 出力・issue コメント・decision ledger にしか残らず、設計層のバックログ（design/topics/）には人手でしか届かない。

## 現状コードの前提

- archive orchestrator は draft 削除 → scoped git add（specrunner/changes/ 等）→ design-layer mark-hook（src/core/archive/orchestrator.ts:292-298 で `runDesignLayerMarkHook` を呼ぶ）→ `commitArchive`（orchestrator.ts:307）の順で実行する。mark-hook は「archive 時に外部書き込みを行い `git add -A -- design` でステージして archive commit に載せる」実装パターンを持つ（src/core/design-layer/mark-hook.ts:60-77）
- designLayer 設定は `DesignLayerConfig { enabled?, command?, requireCitationTypes? }`（src/config/schema.ts:464-481）。`resolveDesignLayerConfig`（schema.ts:1255-1261）が既定値を適用して `ResolvedDesignLayer`（schema.ts:1244-1248）を返す
- findings の正典型は `Finding { severity, resolution: "fixable" | "decision-needed", file, line?, title, rationale, fixTarget?, options?, origin?: "scope" }`（src/kernel/report-result.ts:15, 40-75）。各 step run の findings は `state.steps[step][].outcome.toolResult.findings` から取得でき、収集と dedupe の既存実装がある（src/core/pipeline/findings-ledger.ts:28-47、`dedupeFindings`）
- 人の裁定は decision ledger に記録される（`DecisionRecord`: src/state/schema.ts:225、`state.decisions`: schema.ts:322、src/core/decision/decision-ledger.ts）
- merge 経路（`job archive --with-merge`）にも designLayer は伝播済み（src/core/archive/merge-then-archive.ts:86, 124, 223）

## 要件

1. **排出モジュールの新設**: design-layer 系の新 hook（mark-hook と同層・同パターン、src/core/design-layer/ 配下）として、archive フェーズで job の全 step run の findings から `resolution: "decision-needed"` **または** `origin: "scope"` の finding を収集・dedupe し、1 finding = 1 topic ファイルとして worktree（recordDir）の `design/topics/<slug>.md` に書き出す
2. **topic ファイル書式**（契約準拠）: flat frontmatter で `id: top-<slug>` と `source: specrunner:<job-slug>/<step>-<iteration>#<finding-index>`。本文に finding の title・rationale（症状として）、severity・step・file（文脈として）、decision ledger に対応する裁定があれば「暫定裁定（提案であって決定ではない）」の見出しで併記する
3. **slug の決定的導出**: `<job-slug>-<step>-<iteration>-<index>` を基に契約の slug 文法（`^[a-z0-9]+(-[a-z0-9]+)*$`）へ正規化する。同一入力からは常に同一 slug
4. **冪等**: 排出先ファイルが既に存在すれば上書きせず skip する。再 archive で重複ファイル・重複 ID を作らない
5. **ステージング**: 書き出したファイルを archive commit に含める（mark-hook と同様の scoped `git add`。mark-hook の成功/失敗には依存しない独立したステージングとする）
6. **縮退**: `designLayer.enabled` が false、または新設定 `topicEmission` が false、または recordDir に design/ が不在なら no-op（既存挙動を完全に維持）。design/ が存在し design/topics/ が無ければ作成する
7. **設定追加**: `DesignLayerConfig` に `topicEmission?: boolean` を追加し、resolver の既定値は true（designLayer.enabled 配下でのみ意味を持つ）
8. **両経路対応**: `job archive` と `job archive --with-merge` の両方で排出が走る
9. **可視化**: 排出があった場合のみ、件数と書き出し先を stdout に 1 行で出す

## スコープ外

- 正本テストの完全自動判定（解決コミットのパス解析等）。v1 は decision-needed / origin:"scope" の機械分類とし、契約が明示的に許容する過剰排出側に倒す
- escalation 時点でのリアルタイム排出（v1 は archive 時のみ）
- aozu CLI の呼び出し（契約はファイルのみ。既存 mark-hook の変更も不要）
- 排出済み topic の後続管理（addressed の判定は aozu 側で ADR 引用から計算される）
- GitHub issue コメント・escalation 出力との重複排除

## 受け入れ基準

- [ ] designLayer.enabled=true の job archive で、decision-needed と origin:"scope" の finding が `design/topics/<slug>.md` として作成され、archive commit に含まれる（統合テスト）
- [ ] 生成ファイルが flat frontmatter・`id: top-<slug>`・`source:` を持ち、slug が `^[a-z0-9]+(-[a-z0-9]+)*$` に一致する（ユニットテスト）
- [ ] fixable のみの job では何も排出されない（テスト）
- [ ] 同一 job の再 archive・既存同名ファイル存在時に上書き・重複しない（冪等テスト）
- [ ] designLayer 無効 / topicEmission=false / design/ 不在の各条件で no-op であり、既存テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: archive 時排出（mark-hook と同層）** / 却下: escalation 時排出 — escalation 時点の finding は後続 iteration で fix され得るため確定は archive 時。また archive には「外部書き込みを commit に載せる」実証済みパターン（mark-hook）が既にあり、同じ層に並べるのが構造的に最小
- **採用: decision-needed + origin:"scope" の機械分類** / 却下: 全 finding 排出 — fixable はパイプライン内で解決済みでありノイズが過大 / 却下: 人の明示マーキング — 新しい UI/ジェスチャーが必要で v1 過剰。契約が過剰排出を許容しているため機械分類で足りる
- **採用: topicEmission 既定 true** / 却下: 既定 false — designLayer.enabled 自体が opt-in であり、契約の既定挙動として排出が立つ方が整合する。opt-out は残す
- **採用: 1 finding = 1 topic** / 却下: job 単位で 1 topic に集約 — topic は個別に ADR で addressed になる単位であり、集約すると一部だけ決定済みの状態が表現できない
