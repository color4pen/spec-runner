# custom reviewer の承認を canonical 入力 hash に束縛し、全 skip を非 green にする

## Meta

- **type**: spec-change
- **slug**: custom-reviewer-canon-binding
- **base-branch**: main
- **adr**: true

## 背景

custom reviewer の承認再利用（resume / round 跨ぎの skip）には 2 つの盲点が残っている。

1. **正典変更が invalidation に見えない**: round の変更判定は `specrunner/changes/**` を一括で touched リストから除外する。この除外は「reviewer 自身の findings commit で誤 invalidate しない」ための正当な措置だが、正典文書（request.md / spec.md / design.md / tasks.md / test-cases.md）まで巻き込んでいる。このため正典を変更しても、既存の承認が現在の HEAD に付け替えられて（re-anchor）skip が成立する。「文書を修正したのに reviewer が再走しない」という事故経路が custom reviewer に残存している。
2. **全 skip が approved に合流する**: aggregateVerdict は member verdicts が全て "skipped" の場合（および空の場合）に approved を返す。reviewer が構成されているのに 1 件も実検査が行われなかった round が green として合流する。これは typed 完了契約の「検証実績ゼロは非 green」原則（checked=0 → escalation）と食い違う。

## 現状コードの前提

- `src/core/pipeline/round-git-scope.ts` — filter が change folder 全体（`specrunner/changes` 配下すべて）を touched リストから除外する。コメントに「findings files are also pipeline-managed from the perspective of source diff」とあり、正典と pipeline 出力を区別していない
- `src/core/pipeline/reviewer-status.ts:190-199` — `aggregateVerdict` は escalation > needs-fix > approved の優先で畳み込み、全 "skipped" / 空配列はいずれも approved になる
- `src/core/pipeline/parallel-review-round.ts` — approved member は `listChangedFiles` の結果が activation paths に触れない限り維持され、approvedAtCommit が現在の baseline に re-anchor される
- `src/core/pipeline/reviewer-status.ts` selectPendingMembers — approvedAtCommit と baselineCommit の一致で skip を判定する（revision 束縛は導入済み。ただし上記 1 により正典変更が baseline 差として観測されても、touched 除外により activation 判定に現れない経路がある）
- reviewer status の永続構造（state.reviewerStatuses）は既存フィールドの追加に対して後方互換を要する
- runtimeStrategy には digestArtifacts（ファイル hash 計算）が存在する（lineage 記録で使用中）

## 要件

1. **canonical 入力 hash への束縛**: custom reviewer の承認時に、その時点の正典文書集合（`specrunner/changes/<slug>/` の request.md / spec.md / design.md / tasks.md / test-cases.md。存在するもの）の内容 hash（canonHash）を reviewer status に記録する。skip 判定（selectPendingMembers 相当）は revision（approvedAtCommit）に加えて canonHash の一致を要求し、不一致・欠落は pending に戻す（fail-closed）。現在の canonHash は round 開始時に一度計算して渡す（判定関数自体は state + 引数のみで純粋に保つ）。
2. **除外の絞り込み**: round の変更判定の除外対象を pipeline 出力（`*-result-*.md` / `review-feedback-*.md` / state.json / events.jsonl / usage.json / attestation / rules.md）に限定し、正典文書の変更は touched リストに現れるようにする。reviewer 自身の findings commit で誤 invalidate しないという既存の目的は維持する。
3. **全 skip の非 green 化**: reviewer が 1 件以上構成されている round で全 member verdict が "skipped" の場合、合流 verdict を approved ではなく escalation にする（検証実績ゼロ = 判定不能）。reviewer が構成されていない場合（member 0 件）は現行どおり approved（機能未使用）。既存テストがこの旧挙動を固定している場合は本変更の意図に沿って期待を更新する（対象を design で列挙）。
4. **legacy 互換**: canonHash を持たない既存の承認 record は不一致扱い（pending に戻す）。record 自体の書き換えは行わない。
5. **E2E（状態捏造方式）**: 「承認済み reviewer を持つ job → 正典文書を変更 → 依存 reviewer が全て pending に戻る → 再実行後の承認が新 revision / 新 canonHash に束縛される」一連を、実 LLM なしの fabricated state + 実 git 操作でテストする。

## スコープ外

- managed runtime の hash 計算基盤（captureHeadSha 不在の既知制約は #886。canonHash が計算不能な環境では fail-closed に倒す）
- sequential 経路（conformance / code-review）の canon 束縛拡張 — revision 束縛（commitOid 照合）が導入済みであり、本 request は custom reviewer round に限定する
- reviewer 定義（activation paths / 判定基準）の仕様変更
- 全 skip の escalation 文言・resume UX の作り込み（既存 escalation 経路に載せる）

## 受け入れ基準

- [ ] 承認済み custom reviewer を持つ state で正典文書（request.md / spec.md / design.md / tasks.md / test-cases.md のいずれか）を変更すると、該当 reviewer が pending に戻る（skip されない）ことをテストで固定する
- [ ] 正典・activation 対象がいずれも不変の resume では承認 skip が維持されることをテストで固定する（挙動保存）
- [ ] reviewer 構成ありで全 member "skipped" の round の合流 verdict が escalation になることをテストで固定する。member 0 件は approved のまま
- [ ] canonHash を持たない legacy 承認 record が pending に戻ることをテストで固定する
- [ ] reviewer 自身の findings commit（result ファイルのみの変更）が invalidation を誘発しないことをテストで固定する（既存目的の保存）
- [ ] E2E: 承認済み state → 正典変更 → 全依存 reviewer 再走 → 新承認が最終 revision と新 canonHash に束縛される一連を fabricated state + 実 git でテストする
- [ ] 修正前の挙動（正典変更でも skip / 全 skip approved）に戻すと該当テストが fail することを破壊確認として記録する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: revision 束縛（commitOid）に canonHash を重ねる二重束縛**。commitOid は「コードが動いたか」、canonHash は「この reviewer が読む正典が変わったか」を直接表す。除外リストの調整だけでは activation paths が正典を含まない reviewer（src 監視型）の承認が正典変更後も生き残るため、hash 束縛が必要。
- **採用: hash 計算は round 境界で一度、判定は純粋関数**。revision 束縛（PR #885）と同じ構図。guard 内 I/O を避ける。
- **却下: 除外リストの絞り込みのみで対応** — activation paths 経由の間接検出は reviewer の定義に依存し、正典を監視しない reviewer に対して穴が残る。
- **却下: 全 skip を warning 表示に留める** — 非 green 化は typed 完了契約の checked=0 原則との整合要求であり、表示では合流判定が変わらない。
- **却下: skip 判定を廃止して毎回全再走** — 束縛が有効な限り skip は安全であり、毎回全再走はコスト過大。束縛の正しさを歯（テスト）で担保する方針を維持する。
