# Markdown Mermaid PDF

Pandoc と XeLaTeX を用いた Markdown→PDF 変換環境を提供する Docker コンテナです。Mermaid 図表に対応しています。

## 機能

- Markdown から PDF への変換（Pandoc + XeLaTeX）
- Mermaid 図表のサポート（mermaid-filter + Puppeteer + Chromium）
- 日本語フォント対応（Noto Sans CJK JP）
- カスタマイズ可能な PDF 設定

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
- 公開イメージには build provenance と SBOM attestation を付与します
- Mermaid 系 npm 依存は CI で high/critical advisory を検査し、安定版 `latest` も定期スキャンします
- ローカルの `make build` / `docker compose build` は手元用の `markdown-mermaid-pdf:latest` を作成します

## Makefile コマンド一覧

| コマンド                    | 説明                                  |
| --------------------------- | ------------------------------------- |
| `make build`                | Docker イメージをビルド               |
| `make rebuild`              | キャッシュなしで再ビルド              |
| `make run`                  | Docker Compose 経由でシェルを起動     |
| `make example`              | example.md から PDF を生成            |
| `make test`                 | PDF が正常に生成されるかテスト        |
| `make convert INPUT=<file>` | 指定したファイルを変換                |
| `make shell`                | コンテナ内で bash シェルを起動        |
| `make clean`                | 生成された PDF をクリーンアップ       |
| `make clean-all`            | PDF と Docker イメージを削除          |
| `make info`                 | Docker イメージとツールバージョン表示 |
| `make license-check`        | ライセンスコンプライアンスを検証      |
| `make help`                 | ヘルプメッセージを表示                |

## Mermaid 図表の使用例

`workspace/example.md` に Mermaid 図表を含むサンプルドキュメントがあります。フローチャート、ガントチャート、シーケンス図などに対応しています。

詳細は [Mermaid 公式ドキュメント](https://mermaid.js.org/)を参照してください。

## カスタマイズ

- **Mermaid/Puppeteer 設定**: `/config/.mermaid-config.json`, `/config/.puppeteer.json`, `/config/.mermaid.css`
- **LaTeX 設定**: `/config/header.tex` でフォント、レイアウト、見出しスタイルを変更可能

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
