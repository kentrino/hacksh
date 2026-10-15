---
title: MIT と宣言しているのにライセンス本文がない
theme: oss-readiness
---

# Problem

`package.json` には `"license": "MIT"` とあるが、リポジトリに `LICENSE` ファイルがない。`files` は `["dist"]` だけなので、npm パッケージにもライセンス本文と著作権表示が含まれない。GitHub のリポジトリページにもライセンスが表示されない。

MIT License は著作権表示と許諾表示を同梱することを条件にしている。本文がないと、利用者は権利者と許諾の条件を確認できない。

解決後は、リポジトリと npm パッケージの両方で、権利者を含む MIT License の本文を確認できる。

# Open Decisions

- 著作権表示に記載する権利者名と年。

# Related Files

- `package.json` — `license` と `files`
