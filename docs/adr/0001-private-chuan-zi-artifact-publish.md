# Publish chuan-zi as a build artifact

The public `Crisply2404.github.io` Pages repository publishes only the built `chuan-zi` `dist` directory under `/chuan-zi/`. A GitHub Actions workflow reads the private source repository with `CHUAN_ZI_TOKEN`, builds it during the public site deployment, and never adds the source tree to the public repository. The `CHUAN_ZI_REF` repository variable selects the committed revision; manual runs can select a private branch or commit through `chuan_zi_ref`. Local updates are published after the user pushes them to the private repository. This keeps the source private while preserving the GitHub Pages URL used by the personal site.

The public artifact includes `glyphs-source.zip`, the download linked from the project's data and license page. It contains original glyph data, generated glyph JSON, licenses and the `build-data.ts` and `prepare-glyphs.ts` generator scripts. The user approved publication of this intended download on 2026-10-13.

