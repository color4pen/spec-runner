# ADR-20260416: Session 間のコード共有は Git branch 経由

## ステータス

採用

## コンテキスト

Managed Agents の Session はコンテナレベルで完全に分離されている（Phase 1 で検証済み）。同じ Environment を使っても `/workspace` は共有されない。

SpecRunner で execute-request を実装するには、implementer Session が書いたコードを reviewer Session が参照できる必要がある。Session 間のファイル共有メカニズムが必要。

## 決定

**Git branch を Session 間のコード共有レイヤーとして使用する。**

### フロー

```
1. SpecRunner: implementer Session を作成（default branch で mount）
2. Implementer Agent: コードを書く → commit → git push origin feat/xyz
3. SpecRunner: push 完了を検知
4. SpecRunner: reviewer Session を作成
   resources: [{ type: 'github_repository', url: ..., checkout: { type: 'branch', name: 'feat/xyz' } }]
5. Reviewer Agent: /workspace/repo が feat/xyz の状態 → レビュー実行
6. needs-fix → implementer Session に戻って修正 → push → 新 reviewer Session
7. approved → SpecRunner が GitHub API で PR 作成
```

### 根拠となる検証結果

1. **git push がコンテナ内から動作する**: ローカルプロキシ（`127.0.0.1:49622`）が read/write 両方を GitHub に中継することを確認（2026-04-16 検証）
2. **Session 作成時に `checkout` パラメータで branch / commit を指定可能**: SDK の `BetaManagedAgentsBranchCheckout` / `BetaManagedAgentsCommitCheckout`
3. **Session 間のファイルシステムは完全分離**: 共有ストレージは存在しない

## 理由

1. **SDK が想定している設計**: `checkout` パラメータの存在が、この使い方を想定していることを示す
2. **追加インフラ不要**: GitHub が中間ストレージとして機能する（S3 等の追加ストレージ不要）
3. **コードレビューとの親和性**: branch ベースのワークフローは PR ベースの開発フローと自然に接続する
4. **監査性**: Git の履歴が残るため、誰（どの Session）が何を変更したか追跡可能

## 却下した代替案

- **diff テキスト中継**: implementer Session から diff を取得 → reviewer にテキストで渡す。動作するが、reviewer がファイル全体のコンテキストを失う。レビュー品質が低下する
- **Files API 中継**: 変更ファイルを Files API でアップロード → 別 Session にマウント。Session から「ファイルをダウンロード」する API が存在しないため、Agent に `cat` させる必要があり煩雑
- **Custom Tools 経由の push**: Agent が `push_changes` ツールを呼ぶ → アプリが GitHub API で push。git push が直接動くため不要
- **共有ストレージ（Research Preview の Multi-agent 等）**: 未公開機能に依存するのは計画が立たない

## リスク

- **clone コスト**: reviewer Session を作るたびにフルクローンが走る。大きなリポでは数十秒かかる可能性。shallow clone（`--depth 1` 相当）のオプションが SDK にあるか要調査
- **push の競合**: 複数 Session が同じ branch に push した場合の挙動は未検証。SpecRunner 側で branch 名のユニーク性を保証する必要あり
- **ローカルプロキシの将来的変更**: Anthropic がプロキシの挙動を変更（push をブロック等）する可能性。beta 期間中は特に注意

## 結果

- Session 間のコード共有戦略が確定
- execute-request の Managed Agents 版の設計が具体化
- Phase 2b（Custom Tools）以降で、このフローを実装に落とし込める
