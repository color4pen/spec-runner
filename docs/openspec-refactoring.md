# OpenSpec リファクタリング状況

OpenSpec の最近の変更と進行中のリファクタリングをまとめる。

## 最新バージョン

**v1.3.0**（2025年4月11日）

- JetBrains Junie、Lingma IDE、ForgeCode、IBM Bob のサポート追加
- PowerShell エンコーディング問題の修正（シェル補完をオプトイン化）
- GitHub Copilot 誤検出の修正

## 大規模リファクタリング: v1.0.0 (OPSX)

2025年1月26日にリリースされた v1.0.0 は、アーキテクチャの根本的な再設計。

### 主な変更点

#### 1. 動的インストラクション

**Before**: 静的プロンプト
**After**: コンテキスト認識型の3層構造（context, rules, templates）

#### 2. アクションベースワークフロー

**Before**: 線形のフェーズロック（proposal → apply → archive）
**After**: 柔軟なアクション

```
/opsx:explore  - 探索
/opsx:new      - 変更作成
/opsx:continue - 段階的進行
/opsx:ff       - 高速進行
/opsx:apply    - 実装
/opsx:verify   - 検証
/opsx:sync     - 仕様同期
/opsx:archive  - アーカイブ
```

#### 3. セマンティック仕様同期

**Before**: テキストベースのマージ（壊れやすい）
**After**: マーカーベースの Delta specs

```markdown
## ADDED Requirements
## MODIFIED Requirements
## REMOVED Requirements
## RENAMED Requirements
```

#### 4. スキル統合

**Before**: 8+ の設定ファイル
**After**: `.claude/skills/` に統合、クロスエディタ互換

### 破壊的変更

- `/openspec:proposal` → `/opsx:propose`
- `/openspec:apply` → `/opsx:apply`
- `/openspec:archive` → `/opsx:archive`
- ツール固有の instruction ファイルを廃止

マイグレーション: `openspec init` で再初期化

## v1.2.0 の変更（2025年2月）

- **プロファイルシステム**: `core`（4コマンド）/ `custom`（任意選択）
- **AI ツール自動検出**: `.claude/`, `.cursor/` などをスキャン
- **Pi, Kiro IDE サポート追加**

## スキル化の動き（Skills-Only Delivery）

OpenSpec は2層アーキテクチャを採用：

| 層 | 形式 | 特徴 |
|----|------|------|
| **スキル** | SKILL.md | ユニバーサル、26+ ツール対応、自然言語でも発火 |
| **コマンド** | ツール固有 | 明示的な `/opsx:*` 呼び出し |

### Delivery モード

`openspec init` または `openspec config delivery` で選択：

```bash
openspec config delivery skills    # スキルのみ
openspec config delivery commands  # コマンドのみ
openspec config delivery both      # 両方（推奨）
```

### スキル vs コマンドの違い

```
スキル:
  - 「新しい変更を始めたい」→ LLM が関連スキルをロード
  - 暗黙的、柔軟

コマンド:
  - 「/opsx:propose」→ 明示的に実行
  - 予測可能、ユーザー主導
```

### SpecRunner への影響（重要）

**Managed Agents はスキルをアップロードできる**。

```bash
# 1. OpenSpec でスキルのみ生成
openspec init --tools claude
openspec config delivery skills

# 2. 生成されたスキル
.claude/skills/
├── openspec-propose/SKILL.md
├── openspec-explore/SKILL.md
├── openspec-apply-change/SKILL.md
└── openspec-archive-change/SKILL.md

# 3. Managed Agents にアップロード
curl -X POST "https://api.anthropic.com/v1/skills" \
  -F "files[]=@.claude/skills/openspec-propose/SKILL.md"
```

これにより、OpenSpec 公式スキルを Managed Agents でそのまま使える可能性がある。

### 関連 PR

- **PR #891**: スキル参照マッピング（skills-only delivery 向け）
- **PR #752**: グローバルディレクトリへのスキル/コマンドインストール
- **PR #757**: ユーザーグローバルカスタムスキル（オーバーライド優先度付き）

## 進行中のリファクタリング（PR ベース）

### マルチエージェント対応（PR #790）

`dispec-driven schema` によるマルチエージェントオーケストレーション。

**影響**: SpecRunner の Phase 3（Agent Teams 対応）に関連

### オンボーディング統一化（PR #961, #962）

`openspec init` と `openspec update` の出力を標準化。共通のオンボーディングヘルパーを実装。

### スキル参照マッピング（PR #891）

`skills-only delivery` 向けのスキル参照機能。

**影響**: Managed Agents でのスキルアップロードに関連する可能性

### 国際化（PR #840, #884）

- 規範的キーワードの i18n 対応
- 中国語ドキュメント翻訳

### インフラ改善

- グローバルインストール対応（PR #866）
- シンボリックリンク対応（PR #861）
- npm git 依存関係の処理改善（PR #792）

## 現状の数字

- **オープン Issue**: 215
- **オープン PR**: 65
- **コミット数**: 562
- **言語**: TypeScript 98.9%
- **Node.js 要件**: 20.19.0 以上

## SpecRunner への影響

### 注意すべき点

1. **コマンド構文の安定性**: v1.0.0 で大規模変更があった。今後も変更の可能性あり

2. **マルチエージェント対応**: PR #790 が進行中。Phase 3（Agent Teams）に影響する可能性

3. **スキル配信方式**: PR #891 の `skills-only delivery` が Managed Agents に関連するかもしれない

4. **CLI の JSON 出力**: `--json` フラグで構造化データを取得できる。Managed Agents での利用に適している

### 安定しているもの

- Core プロファイル（propose, explore, apply, archive）
- CLI の基本コマンド（init, list, status, instructions）
- ディレクトリ構造（openspec/changes/, openspec/specs/）
- Delta specs のフォーマット

## 参考リンク

- [CHANGELOG](https://github.com/Fission-AI/OpenSpec/blob/main/CHANGELOG.md)
- [Releases](https://github.com/Fission-AI/OpenSpec/releases)
- [Pull Requests](https://github.com/Fission-AI/OpenSpec/pulls)
- [Roadmap Discussion #111](https://github.com/Fission-AI/OpenSpec/discussions/111)
