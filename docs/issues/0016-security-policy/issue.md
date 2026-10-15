---
title: 脆弱性を非公開で報告する窓口がない
theme: oss-readiness
---

# Problem

`SECURITY.md` がなく、脆弱性の報告方法が示されていない。GitHub Issues は公開されているため、脆弱性を見つけた人が通常の issue で報告すると、修正前に内容が公開される。

zitty は CLI 引数を解析するライブラリで、利用者のアプリケーションに組み込まれて任意の入力を受け取る。

解決後は、脆弱性を見つけた人が、内容を公開せずに報告する方法と、対応を期待できる範囲を知ることができる。

# Open Decisions

- 報告経路（GitHub の Private vulnerability reporting、メールなど）。
- サポート対象のバージョンの範囲。
