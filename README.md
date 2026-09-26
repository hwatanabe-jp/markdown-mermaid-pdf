# Markdown Mermaid PDF

Pandoc と XeLaTeX を用いた Markdown→PDF 変換環境を提供する Docker コンテナです。Mermaid 図表に対応しています。

## 機能

- Markdown から PDF への変換（Pandoc + XeLaTeX）
- Mermaid 図表のサポート（mermaid-filter + Puppeteer + Chromium）
- 日本語フォント対応（Noto Sans CJK JP / Noto Serif CJK JP）
- カスタマイズ可能な PDF 設定
- デジタル庁標準ガイドライン風のお硬い文書を生成する formal スタイル（`--style formal`）

## 必要な環境

- Docker 20.10 以上
- Docker Compose v2 以上（オプション）

## クイックスタート

```bash
# イメージをビルド
make build

# サンプル PDF を生成
make example

# 詳細なコマンドを確認
make help
```

## 使用方法

### Makefile を使用（推奨）

すべてのコマンドは下記の「Makefile コマンド一覧」を参照してください。

```bash
make help  # コマンド一覧を表示
```

### Docker を直接使用

```bash
# 公開済みの安定版を取得
docker pull ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest

# PDF を生成
docker run --rm \
  -v $(pwd)/workspace:/workspace \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  document.md output.pdf

# コンテナ内でシェルを起動
docker run --rm -it \
  -v $(pwd)/workspace:/workspace \
  --entrypoint /bin/bash \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest
```

`ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:main` を使うと、`main` ブランチの検証済みビルドも取得できます。

### Docker Compose を使用（ローカルビルド前提）

現在の `docker-compose.yml` は手元用の `markdown-mermaid-pdf:latest` を使う構成です。先に `make build` または `docker compose build` を実行してください。

```bash
# ローカル用イメージをビルド
docker compose build

# Docker Compose を使用
docker compose run --rm markdown-mermaid-pdf document.md output.pdf

# Docker Compose でシェルを起動
docker compose run --rm markdown-mermaid-pdf-shell
```

公開タグの運用方針:

- `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest` は安定版リリース専用です
- `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:main` は `main` ブランチの検証済みビルドです
- 公開リリースは `linux/amd64` と `linux/arm64` の native runner で smoke test 済みのマルチアーキテクチャイメージです
- release / main CI の GitHub Actions は full commit SHA に固定しています
- main・安定版の公開前に Hadolint / Dockle と smoke test を実行します
- 公開イメージには build provenance と SBOM attestation を付与します
- Mermaid 系 npm 依存は CI で high/critical advisory を検査し、安定版 `latest` も定期スキャンします
- ローカルの `make build` / `docker compose build` は手元用の `markdown-mermaid-pdf:latest` を作成します

CI では各アーキテクチャのイメージを1回ずつビルドし、amd64 の候補には Dockle と
smoke test の両方を実行します。ビルドキャッシュはアーキテクチャ別に分け、main と release で共用します。
同じ PR・ブランチへの連続更新では古い CI 実行をキャンセルします。手動実行は push と別枠で扱い、
常に両アーキテクチャを検証します。

`README.md`、`TROUBLESHOOTING.md`、`AGENTS.md`、`CLAUDE.md`、`docs/**` だけの変更では、
PR のイメージ検証を省略し、main への push では CI を起動しません。この場合、公開済みの `:main` は更新されません。
`workspace/` のサンプル Markdown、設定、スクリプト、ワークフローなどの変更は検証対象です。
PR の必須チェック名は維持し、変更判定や Dockerfile lint が失敗した場合は検証チェックも失敗します。

## Makefile コマンド一覧

| コマンド                    | 説明                                  |
| --------------------------- | ------------------------------------- |
| `make build`                | Docker イメージをビルド               |
| `make rebuild`              | キャッシュなしで再ビルド              |
| `make run`                  | Docker Compose 経由でシェルを起動     |
| `make example`              | example.md から PDF を生成            |
| `make example-set`         | マスタ・詳細文書の一式を個別 PDF として生成 |
| `make example-formal`       | formal-example.md からお硬い PDF を生成 |
| `make test`                 | PDF が正常に生成されるかテスト        |
| `make test-unit`            | Docker 不要の軽量テスト（Node.js が必要） |
| `make convert INPUT=<file>` | 指定したファイルを変換                |
| `make shell`                | コンテナ内で bash シェルを起動        |
| `make clean`                | 生成された PDF をクリーンアップ       |
| `make clean-all`            | PDF と Docker イメージを削除          |
| `make info`                 | Docker イメージとツールバージョン表示 |
| `make license-check`        | ライセンスコンプライアンスを検証      |
| `make help`                 | ヘルプメッセージを表示                |

`make test-unit` は参照解決・設定選択・Makefile の回帰テストを実行します。
Pandoc がインストールされていれば formal の検証・番号整合性も検査し、なければその検査だけを
スキップします。`PANDOC_BIN` で Pandoc の実行ファイルを指定できます。PDF 生成は `make test` で検証します。

空白を含むパスは、例えば `make convert INPUT='資料/設計 書.md' OUTPUT='設計 書.pdf'` のように指定できます。
`make clean` は workspace 直下の PDF・ログと、サンプル一式の `workspace/formal-set/dist/` を削除します。

## お硬い文書モード（formal スタイル）

`--style formal` を付けると、デジタル庁の標準ガイドライン群風の体裁を持つ PDF を生成できます。
表紙（文書番号・和暦併記の日付・概要の枠囲み）、改定履歴、点線リーダー付き目次、
水色帯の章見出し、章別の図表番号（図 2-1／表 1-1）などが自動で組み上がります。

```bash
docker run --rm \
  -v $(pwd)/workspace:/workspace \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  document.md output.pdf --style formal
```

文書は formal スキーマ（必須フロントマターと見出し規則）に適合している必要があり、
適合しない場合は違反内容を列挙したエラーとともに変換が中止されます。

- スキーマの正典と記入例: [docs/formal-mode.md](docs/formal-mode.md)
- サンプル文書: `workspace/formal-example.md`（`make example-formal` で変換）

## Mermaid 図表の使用例

`workspace/example.md` に Mermaid 図表を含むサンプルドキュメントがあります。フローチャート、ガントチャート、シーケンス図などに対応しています。

詳細は [Mermaid 公式ドキュメント](https://mermaid.js.org/)を参照してください。

### マスタ文書・詳細文書の一括生成

設定ファイルで対象と出力名を指定すると、formal 文書を個別 PDF の一式として生成できます。
文書一覧、版・状態の表紙表示、文書間・見出し間の参照に対応します。

```bash
docker run --rm -v "$PWD/workspace:/workspace" \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  --set formal-set/documents.json formal-set/dist
```

出力先には未作成のディレクトリを指定してください。全件成功時のみ一式を確定します。
サンプルは `workspace/formal-set/`（`make example-set`）にあります。
設定・参照記法・PDF ビューアの制約は [formal モードの文書一式の生成](docs/formal-mode.md#文書一式の生成) を参照してください。

## カスタマイズ

- **Mermaid/Puppeteer 設定**: `/config/.mermaid-config.json`, `/config/.puppeteer.json`, `/config/.mermaid.css`
- **LaTeX 設定**: `/config/header.tex` でフォント、レイアウト、見出しスタイルを変更可能

Mermaid/Puppeteer の設定は、明示した環境変数（`MERMAID_FILTER_MERMAID_CONFIG`、
`MERMAID_FILTER_PUPPETEER_CONFIG`、`MERMAID_FILTER_MERMAID_CSS`）、作業ディレクトリ内の
同名設定ファイル、イメージ内の既定設定の順に使います。既定設定をワークスペースへコピーしないため、
`default` と `formal` を切り替えると実行ごとに既定テーマを選び直します。
formal の既定 Mermaid 設定は `/config/formal/mermaid-config.json` です。

カスタム設定でイメージを再ビルドする例：

```dockerfile
FROM ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest
COPY my-custom-header.tex /config/header.tex
```

### 改ページを指定するには？

Markdown仕様には改ページの記法がありませんが、本コンテナには Lua フィルタを同梱しており、Markdown中に次のコメントを書くだけで PDF に改ページを挿入できます。

```markdown
ここが1ページ目の末尾です。

<!-- pagebreak -->

ここから2ページ目の本文です。
```

仕組み: `<!-- pagebreak -->` は Lua フィルタ `/config/pagebreak.lua` が検出し、LaTeX では `\newpage`、HTML では改ページ用 div に変換します。

## セキュリティと実行モデル

- Mermaid 描画は Chromium を `--no-sandbox` 付きで起動するため、信頼できる入力だけを処理してください
- 既定ではコンテナは root で動作するため、bind mount した出力ファイルの所有者が期待とずれる場合があります
- 所有権をホスト側に合わせたい場合は `--user $(id -u):$(id -g)` を指定してください

```bash
docker run --rm \
  --user $(id -u):$(id -g) \
  -v $(pwd)/workspace:/workspace \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  document.md output.pdf
```

## トラブルシューティング

問題が発生した場合は [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を参照してください。

## ライセンス

このプロジェクトは **MIT License** でライセンスされています。詳細は [LICENSE](LICENSE) を参照してください。

### サードパーティライセンス

この Docker イメージには以下のオープンソースソフトウェアが含まれています：

- Pandoc (GPL v2+), XeLaTeX/TeX Live (LPPL), Chromium (BSD 3-Clause)
- Node.js (MIT), npm (Artistic License 2.0), mermaid-filter (BSD 2-Clause)
- Noto Sans CJK JP (SIL Open Font License 1.1)

すべてのコンポーネントは商用利用可能です。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

## 参照

- [Pandoc 公式ドキュメント](https://pandoc.org/)
- [Mermaid 公式ドキュメント](https://mermaid.js.org/)
- [mermaid-filter](https://github.com/raghur/mermaid-filter)
