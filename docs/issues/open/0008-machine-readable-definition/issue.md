---
title: 機械可読なコマンド定義の範囲と契約が定まっていない
theme: ai-native
---

# Current State

terminal-output の実装により、`summarizeUsage` と JSON の usage イベントから、名前・説明・引数・オプション・選択肢・可視の子コマンドなどを取得できる。機械可読な情報を取得する手段自体は既にある。

# Problem

現在の情報はヘルプの要約であり、コマンドツリー全体を取得する範囲、CLI上の入力形式を表す契約、表現できない Zod の検証・変換の扱いが定まっていない。外部ツールやシェル補完が安定して利用するための仕様を固める必要がある。

# Rules

- 現在の UsageSummary を出発点とし、同じスキーマを別々に解析する仕組みを作らない。
- 任意の Zod refine/transform を機械可読なスキーマへ完全変換できるとは約束しない。入力形式と実行後の型を区別する。
- 取得時に run や副作用のある setup を実行しない。
- MCP サーバー自動生成はこの issue に含めない。

# Acceptance Criteria

- 既存情報で満たせる要件と不足項目を確認し、必要な拡張だけを行う。
- 名前付き・位置引数・passthrough・選択肢・必須性・子コマンドを、ヘルプ文の解析なしで参照できる。
- 非表示コマンド、lazy定義、表現できない検証規則の扱いを文書化する。
- 0031の補完とヘルプが同じ情報源を使える。補完では、入力途中の引数列から対象のコマンドと候補を、runや副作用のあるsetupなしで解決できる。

# Open Decisions

- ツリー全体の取得方法と、現在の usage イベントとは別の公開形式が必要か。
- 表現できない規則をどう示すか。JSON Schemaを提供する場合の変換可能範囲。

# Related Files

- `src/usage.ts` — summarizeUsage と UsageSummary
- `src/schema.ts` — 引数情報の取得
- `docs/issues/closed/0030-argument-environment/issue.md`
- `docs/issues/parked/0031-shell-completion/issue.md`
- `docs/issues/parked/0033-public-compatibility/issue.md`
