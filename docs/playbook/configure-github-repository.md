# GitHub リポジトリの設定

`kentrino/hacksh` の設定を、await-ready と takibi に揃える。

| 設定                               | await-ready・takibi | `kentrino/hacksh`（作成時点） |
| ---------------------------------- | ------------------- | ----------------------------- |
| Allow auto-merge                   | 有効                | 無効                          |
| Automatically delete head branches | 有効                | 無効                          |
| `main` のルールセット              | await-ready にある  | ない                          |
| タグのルールセット                 | takibi にある       | ない                          |

# 1. （人）マージの設定を変える

**Settings** → **General** → **Pull Requests** で、次を有効にする。

- **Allow auto-merge**：Release ワークフローがリリース PR に auto-merge を設定するために必要。
- **Automatically delete head branches**

GitHub CLI で変える場合は、次を実行する。

```sh
gh api -X PATCH repos/kentrino/hacksh -F allow_auto_merge=true -F delete_branch_on_merge=true
```

# 2. （人）`main` を保護する

**Settings** → **Rules** → **Rulesets** → **New branch ruleset** で、次のルールセットを作る。

- Ruleset name: `main`
- Enforcement status: **Active**
- Target branches: **Include default branch**
- 有効にするルール:
  - **Restrict deletions**
  - **Block force pushes**
  - **Require a pull request before merging**（必要な承認数は `0`）
  - **Require status checks to pass**：`Ready`（`.github/workflows/ci.yml` のジョブ名）を追加し、**Require branches to be up to date before merging** を有効にする

必須チェックがないと、auto-merge はチェックの結果を待たずにマージする。

await-ready では、**Automatically request Copilot code review** も有効になっている。

# 3. （人）バージョンタグを保護する

release-please が作るタグ（`v0.1.0` など）を、書き換えや削除から守る。**New tag ruleset** で、次のルールセットを作る。

- Ruleset name: `Protect version tags`
- Enforcement status: **Active**
- Target tags: **Include all tags**
- 有効にするルール: **Restrict updates**、**Restrict deletions**、**Block force pushes**

# 4. （人）Renovate を有効にする

1. [Renovate の GitHub App](https://github.com/apps/renovate) の設定を開く。
2. インストール先のリポジトリに `kentrino/hacksh` を加える。
3. `.github/renovate.json` が `main` にあることを確かめる。ない状態で有効にすると、Renovate は設定を追加するオンボーディング PR を作る。

# 5. 確かめる

```sh
gh api repos/kentrino/hacksh --jq '{allow_auto_merge, delete_branch_on_merge}'
gh api repos/kentrino/hacksh/rulesets --jq '.[].name'
```

`allow_auto_merge` と `delete_branch_on_merge` が `true` で、ルールセットに `main` と `Protect version tags` があればよい。
