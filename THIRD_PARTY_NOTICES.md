# Third-Party Notices

This Docker image incorporates the following third-party software and resources. Each component is subject to its respective license terms.

---

## Base System

### Debian 12 (Bookworm)

- **License**: Various Open Source licenses (GPL, LGPL, Apache, MIT, etc.)
- **Copyright**: Debian Project and various contributors
- **Source**: https://www.debian.org/
- **License Details**: Individual package copyrights are available in `/usr/share/doc/*/copyright` within the container

---

## Programming Languages & Runtimes

### Node.js 24.x (LTS)

- **License**: MIT License
- **Copyright**: Node.js contributors
- **Source**: https://nodejs.org/
- **License Text**: https://github.com/nodejs/node/blob/main/LICENSE

### npm

- **License**: Artistic License 2.0
- **Copyright**: npm, Inc. and contributors
- **Source**: https://www.npmjs.com/
- **License Text**: https://github.com/npm/cli/blob/latest/LICENSE

---

## Document Processing Tools

### Pandoc

- **License**: GPL v2 or later
- **Copyright**: John MacFarlane and contributors
- **Source**: https://pandoc.org/
- **License Text**: https://github.com/jgm/pandoc/blob/main/COPYRIGHT

### XeLaTeX (TeX Live)

- **License**: Various (primarily LaTeX Project Public License - LPPL)
- **Copyright**: TeX Live contributors
- **Source**: https://www.tug.org/texlive/
- **License Details**: https://www.tug.org/texlive/LICENSE.TL

### TeXLive Components

- **texlive-xetex**: LPPL 1.3
- **texlive-lang-cjk**: LPPL 1.3
- **texlive-fonts-recommended**: LPPL 1.3
- **texlive-plain-generic**: LPPL 1.3
- **texlive-lang-chinese**: LPPL 1.3
- **lmodern**: GUST Font License
- **latex-cjk-all**: LPPL 1.3
- **Source**: https://ctan.org/

---

## Fonts

### Noto Sans CJK JP

- **License**: SIL Open Font License 1.1 (OFL-1.1)
- **Copyright**: Google Inc.
- **Source**: https://github.com/notofonts/noto-cjk
- **License Text**: https://github.com/notofonts/noto-cjk/blob/main/LICENSE

The SIL OFL allows fonts to be freely used, studied, modified, and redistributed as long as they are not sold by themselves and the copyright and license notices are maintained.

---

## Browser & Rendering

### Chromium

- **License**: Primarily BSD 3-Clause License (with additional open-source components)
- **Copyright**: The Chromium Authors
- **Source**: https://chromium.googlesource.com/chromium/src/
- **License Text**: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/LICENSE

**Important Notes**:

- Chromium is an open-source browser project; downstream distributions may include additional codecs or proprietary components
- Redistribution is permitted under the BSD and other included OSS licenses as long as notices are preserved
- Puppeteer (used by mermaid-filter) is fully compatible with Chromium

### Puppeteer (as dependency of mermaid-filter)

- **License**: Apache License 2.0
- **Copyright**: Google Inc.
- **Source**: https://github.com/puppeteer/puppeteer
- **License Text**: https://github.com/puppeteer/puppeteer/blob/main/LICENSE

---

## NPM Packages

### mermaid-filter

- **License**: BSD 2-Clause License
- **Copyright**: Raghu Rajagopalan
- **Source**: https://github.com/raghur/mermaid-filter
- **License Text**: https://github.com/raghur/mermaid-filter/blob/master/LICENSE

### Mermaid (as dependency of mermaid-filter)

- **License**: MIT License
- **Copyright**: Knut Sveidqvist
- **Source**: https://github.com/mermaid-js/mermaid
- **License Text**: https://github.com/mermaid-js/mermaid/blob/develop/LICENSE

---

## Utilities

### yq (mikefarah/yq)

- **License**: MIT License
- **Copyright**: Mike Farah
- **Source**: https://github.com/mikefarah/yq
- **License Text**: https://github.com/mikefarah/yq/blob/master/LICENSE

### git

- **License**: GPL v2
- **Copyright**: Linus Torvalds and contributors
- **Source**: https://git-scm.com/
- **License Text**: https://git-scm.com/about/free-and-open-source

---

## License Compatibility Summary

This Docker image combines software under various licenses:

| Component      | License          | Commercial Use | Distribution | Modification | Notice Required |
| -------------- | ---------------- | -------------- | ------------ | ------------ | --------------- |
| Debian         | Various OSS      | ✅             | ✅           | ✅           | ✅              |
| Node.js        | MIT              | ✅             | ✅           | ✅           | ✅              |
| Pandoc         | GPL v2+          | ✅             | ✅           | ✅           | ✅              |
| TeX Live       | LPPL             | ✅             | ✅           | ✅           | ✅              |
| Noto Fonts     | SIL OFL 1.1      | ✅             | ✅           | ✅           | ✅              |
| Chromium       | BSD / OSS bundle | ✅             | ✅           | ✅           | ✅              |
| mermaid-filter | BSD-2-Clause     | ✅             | ✅           | ✅           | ✅              |
| yq             | MIT              | ✅             | ✅           | ✅           | ✅              |

---

## Compliance Notes

### For Users

When using this Docker image:

1. The Dockerfile and scripts in this repository are licensed under MIT
2. Third-party components retain their original licenses
3. You must comply with all applicable licenses when redistributing or modifying

### For Distributors

If you plan to:

- **Redistribute this image**: Include this THIRD_PARTY_NOTICES.md file
- **Redistribute GPL components** (e.g., Pandoc, Git): Provide the GPL v2-or-later license text and the corresponding source code or a written offer for source when distributing binaries
- **Modify and redistribute**: Maintain all license notices and comply with terms
- **Commercial use**: All included components permit commercial use, but review individual licenses
- **Public container registry**: Link to this file in your image description

### License Auditing

To verify licenses of installed packages within the container:

```bash
# Check Debian package licenses
docker run --rm markdown-mermaid-pdf:latest dpkg -L <package-name> | grep copyright

# Check npm package licenses
docker run --rm markdown-mermaid-pdf:latest npm list -g --depth=0 --json | jq '.dependencies[] | .license // "unknown"'

# Check font licenses
docker run --rm markdown-mermaid-pdf:latest cat /usr/share/doc/fonts-noto-cjk/copyright
```

---

## Updating This Notice

When updating dependencies:

1. Check new package licenses: `apt-cache show <pkg> | grep License`
2. For npm: `npm view <package> license`
3. Update this file with new components
4. Consider automated license scanning in CI/CD

---

## Questions or Concerns

If you have questions about licensing or notice an inaccuracy in this document:

- Open an issue in the repository
- Consult the original license texts linked above
- Seek legal advice for specific compliance questions

---

**Last Updated**: 2025-10-28

**Note**: This notice is provided for informational purposes and does not constitute legal advice. Users are responsible for ensuring their use complies with all applicable licenses and terms of service.
