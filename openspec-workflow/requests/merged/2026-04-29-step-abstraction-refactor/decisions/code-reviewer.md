## 2026-04-29 code-reviewer (iter 1)

- correctness を重視する :: 振る舞い不変が emphasis の中心であり、テスト + 状態ファイルの後方互換が ABI 相当の契約だから
- architecture を HIGH 優先で見る :: pipeline.ts と pipeline/pipeline.ts の二重存在、StepExecutor 892 行、StepResult|StepRun union schema の中途半端さは ADR の意図 (D8a/D8b/D9) と背反するから
- security を MEDIUM 級で扱う :: GitHub アクセストークン経路は executor + legacy pipeline.ts に二重に存在するが、トークンログ出力は無く、URL 構築は encodeURIComponent 通過済みなので OWASP A03/A05 への直接リスクは低い
- maintainability を厳しく見る :: refactoring request である以上、LOC 削減・責務集約・重複排除が「成功条件」であり、増えていれば retrograde
- testing は Scenario Coverage で評価する :: test-cases.md の must=33 ケース中、エラーコード preservation が「文字列値の確認」止まりで「同じ trigger で発火」を verify していないため部分達成扱い
- module-boundary を仕様準拠で評価する :: 受け入れ基準#9 (core から SDK 直接 import 禁止) は「@anthropic-ai/sdk 直接 import なし」だが、src/sdk/ 経由の indirect SDK 依存は core 内に残存。仕様準拠は半分のみと判定する

## 2026-04-29 code-reviewer (iter 3)

- iter 2 の HIGH 2 件 (#1 JobStateStore canonical, #2 runSpecReviewStep delete) を最優先で検証する :: 同じ「新しい構造作って旧構造残す」debt が2 iter 連続で出ている、構造変化が本物か確認する必要がある
- iter 2 で unchanged だった MEDIUM × 4 (lifecycle discriminator / verifyPath? / agent dir form / executor LOC duplication) と LOC × 3 (XML escape / @deprecated date / sentinel agentId) は据え置き判定でいい :: 全て "extension/eventual cleanup" 相当で、振る舞い不変ベースで blocker ではない
- approved にできる条件を明確化する :: HIGH = 0 かつ Total >= 7.0、新規 HIGH/CRITICAL なし、test 全 PASS。Total が 0.3 以上下がる退行 (regressing) があれば即 escalation 検討
- src/state/store.ts の persistJobState/updateJobState はデッドコードに近い :: createJobState 内部で persistJobState を 1 箇所だけ参照しているが、production caller 経由ではなく helper 関数として残存。完全削除は別 request の追加スコープなので LOW 留め

