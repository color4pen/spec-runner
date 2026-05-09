# Spec Review Result: rm-short-job-id (Iteration 1)

- **verdict**: approved
- **iteration**: 1
- **review-scope**: full

## Summary

仕様は request.md の全要件を網羅しており、proposal / design / tasks / delta spec 間の整合性も高い。`resolveJobId` の配置（store.ts）、エラー設計（AMBIGUOUS_JOB_ID）、resume のフォールバック順序（slug → jobId prefix）はいずれも既存コードベースのパターンに合致する。セキュリティ上の懸念なし（ローカル CLI、ネットワーク非関与、入力は `startsWith` で使用されファイルパスインジェクション不可）。LOW severity の指摘 2 件のみで、承認阻止要因なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | tasks.md:9 / design.md:33 | Task 2.2 は「36 文字」の長さチェックのみ記述しているが、Design D2 は「UUID v4 形式（36 文字、ハイフン含む）」と形式チェックを含意している。実装時にどちらを採用するか不明瞭 | 実装上は長さチェックのみで十分（非 UUID な 36 文字は `loadJobState` が `JOB_NOT_FOUND` で reject する）。tasks.md に「長さのみで判定し、形式検証は不要」と明記すると clarity が向上する |
| 2 | LOW | completeness | specs/job-state-store/spec.md | `resolveJobId("")`（空文字列）のケースが未定義。`"".startsWith("")` は true なので全件 match → AMBIGUOUS_JOB_ID になるが、spec 上は undocumented | CLI の arg parser が空文字列を positional に渡すことはないため実害なし。必要なら spec に「空文字列は undefined behavior」と注記するか、テストケースに追加する |

## Evaluated Categories

### architecture

`resolveJobId` を `state/store.ts` に配置する判断は適切。`listJobStates()` の走査はストア層の責務であり、`rm` / `resume` 両方から利用するための一元化ポイントとして正しい。`errors.ts` への `AMBIGUOUS_JOB_ID` 追加も既存の factory helper パターンに従っている。

### correctness

D2（36 文字パススルー）は `loadJobState` に存在確認を委ねることで二重チェックを回避しつつ、存在しない UUID に対する `JOB_NOT_FOUND` エラーの一貫性を保っている。D4（resume フォールバック順序）は slug 優先で後方互換性を維持し、slug と hex prefix の衝突リスクは実質ゼロ。破損ファイル耐性は既存の `listJobStates()` の skip 動作を継承しており、delta spec にもシナリオが追加されている。

### completeness

request.md の 4 要件すべてが proposal → design → tasks → delta spec に traceable。受け入れ基準 6 項目のうち 5 項目（rm 短縮 ID / 曖昧エラー / 完全 UUID 互換 / resume 短縮 ID / ユニットテスト）が tasks に直接対応し、残り 1 項目（typecheck + test green）は Task 6 で検証される。スコープ外の明示（ps 表示変更、finish、slug 検索）も適切。

### consistency

delta spec の `resolveJobId` シグネチャ・エラーコード・動作ルールが design.md の D1-D5 と一致。既存の `JOB_NOT_FOUND` エラーコード再利用は `errors.ts` の定義と整合。`resume.ts` の `resolveJobStateBySlug` の null 返却パターンとフォールバック設計が合致。

### feasibility

参照先のソースファイルすべて（`errors.ts`, `state/store.ts`, `cli/rm.ts`, `core/command/resume.ts`）が存在し、想定されるインターフェース（`listJobStates(): Promise<JobState[]>`, `SpecRunnerError` コンストラクタ、`removeSingleJob` の `jobId` パラメータ）が実コードと一致。実装リスクなし。

### security

ローカル CLI ツールでネットワーク通信なし。prefix 入力は `Array.filter` + `String.startsWith` で使用され、ファイルパスやシェルコマンドに直接挿入されない。`listJobStates()` は固定ディレクトリ内の `.json` ファイルのみ走査し、symlink 攻撃やパストラバーサルのリスクなし。OWASP Top 10 該当項目なし。
