---
title: citty を参考にしていることがどこにも書かれていない
theme: oss-readiness
---

# Problem

hacksh は API 設計（`defineCommand`、`runMain`、`runCommand`、`parseArgs`、`renderUsage`、`showUsage`、`subCommands` など）を [citty](https://github.com/unjs/citty) に大きく倣っている。しかし README、`package.json`、ソースコードのいずれにも citty への言及がない。`docs/themes/citty-parity.md` は内部文書で、利用者の目には触れない。

このため、利用者は citty との関係（派生、互換、代替のどれか）や、移行時に何が同じで何が違うかを判断できない。citty の作者への謝辞も示されていない。

解決後は、README を読んだ利用者が、hacksh が citty を参考にしていることと、citty との主な違いを把握できる。

# Rules

- citty は MIT License で配布されている。MIT License では、ソフトウェアの複製または相当部分に著作権表示と許諾表示を含める必要がある。

# Open Decisions

- citty のコードを直接取り込んだ部分があるか。ある場合は、citty の著作権表示を同梱する方法（`LICENSE` への追記、`THIRD-PARTY-NOTICES` など）を決める。
- README で citty との違い（Zod スキーマ、位置引数のタプルなど）をどこまで説明するか。
- citty との互換を保証しないこと（`citty-parity` の Non-goals）を明記するか。

# Related Files

- `README.md` — 冒頭の説明に citty への言及がない
- `docs/themes/citty-parity.md` — citty との関係を扱う内部テーマ
