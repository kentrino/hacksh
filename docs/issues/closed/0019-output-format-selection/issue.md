---
title: 出力を人間向けと JSON で切り替えられない
theme: terminal-output
---

# Problem

hacksh が書く出力（ヘルプ、バージョン、エラー）は、端末か CI か、呼び出し元が人間か AI エージェントかに関係なく、同じ人間向けの文である。`run` からの出力（0018）にも形式を切り替える仕組みはない。

端末で読む人間には装飾された表示が読みやすいが、CI のログや出力を解析するプログラムには、色の制御文字や罫線が混ざった文は扱いにくい。

解決後は、既定では人間向けの表示になり、CI 上や特定の指定がある場合は、1件の出力が1行の JSON として書かれる。どちらの形式になるかは、実行前に決まり、実行中に変わらない。

# Rules

- `--help`・`-h`・`--version`・`-v` は hacksh が予約しており、同じ名前の別名がない場合に使える。
- hacksh から出る出力は、すべて同じ printer を通る（0022）。形式の切り替えは、ヘルプ・バージョン・エラーを含むすべての出力に効く。

# Open Decisions

- JSON に切り替える条件（`CI` 環境変数、標準出力が端末でない、組み込みのオプション、環境変数、`runMain` の引数など）と、その優先順位。
- 組み込みのオプション（例: `--json`、`--log-format`）を予約するか。予約すると利用者のスキーマのキーと衝突しうる。
- JSON の書き先（標準出力か標準エラーか）と、`run` の戻り値や利用者が直接書いた出力との混在。
- JSON 形式でのヘルプとエラーの形（0008 の定義や 0009 のエラー構造と揃えるか）。
- `NO_COLOR` などの、色だけを止める指定との関係。

# Related Files

- `src/run.ts` — `runMain` とヘルプ・バージョン・エラーの出力
- `src/parser.ts` — `--help`・`--version` の予約
- `docs/issues/open/0008-machine-readable-definition/issue.md` — コマンド定義の機械可読な形
- `docs/issues/open/0009-structured-cli-errors/issue.md` — CLI 実行時のエラーの構造化
- `docs/issues/closed/0022-single-printer/issue.md` — すべての出力が通る printer
