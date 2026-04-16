# Constraints

プロジェクト固有の制約。implementer が実装時に守るべき事項。
learned-patterns.md から distill-learnings が自動生成する。手動編集しないこと。

## 生成日時: 2026-04-16 00:00
## 蒸留元: learned-patterns.md (10 パターンから 6 件抽出)

### 認証 / 認可

- 認証チェック (authn) を通過したエンドポイントでも、リソースの所有権検証 (authz) を個別に実装する。Route Groups の構造的保護は API Route に及ばない (出現: 3回)
- 新規コードでセキュリティパターン（所有権検証等）を導入した場合、既存の関連コード全てに同じパターンを遡及適用する (出現: 1回)

### アーキテクチャ / エラーハンドリング

- 外部 API 呼び出し + DB 操作の2段階処理では、部分的失敗時のロールバック処理を必ず実装する (出現: 1回)

### ビルド / Lint

- TypeScript で `any` 型を使わず、明示的な型定義を行う。ESLint の `no-explicit-any` 違反を避ける (出現: 3回)
- 未使用変数を残さない。`no-unused-vars` 違反は build-fixer の自動修正対象だが、初回実装時に回避すべき (出現: 1回)
- Next.js では `<img>` タグではなく `next/image` の `Image` コンポーネントを使用する (出現: 1回)
