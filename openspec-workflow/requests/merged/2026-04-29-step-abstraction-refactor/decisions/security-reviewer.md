## 2026-04-29 security-reviewer (iter 1)

- 入力検証を仕様準拠で評価する :: register_branch tool の input_schema 不変は受け入れ基準#22 で要求されており、handler は string + non-empty を validate するため OWASP A03 直接リスクなし
- 認可・トークン経路を中位リスクで扱う :: GitHub アクセストークンは Authorization: token ヘッダで送られ、ログには出力されないが、core 層の二重実装により改修時に漏洩経路が増える可能性がある
- spec-fixer の prompt injection に注意する :: buildSpecFixerInitialMessage は branch / findingsPath / slug を XML タグで囲んでいるが、これらは状態ファイル経由の外部入力。タグエスケープが無いため findingsPath に "</user-request>" 等を含むと境界が崩れる。ただし findingsPath は内部ロジック生成で攻撃面は限定的
- as any キャストはセキュリティではなく correctness 課題と判定する :: SDK 型の弱化はあるが、機密値の取扱いには影響なし。code-reviewer 側で扱うべき
