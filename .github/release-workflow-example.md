# Example release workflow for the Jablu desktop app

This file is **not** a real workflow on purpose — it lives outside
`.github/workflows/` so GitHub Actions does not try to run it.

Each deployment signs releases with its own keypair, so there is no single
repo-wide release workflow that makes sense to ship enabled. To use this in
your fork:

1. Copy the YAML block below into `.github/workflows/release.yml` in your fork.
2. Add the required secrets (see below).
3. Push a tag like `v1.2.3` to cut a release.

## Required secrets

- `UPDATE_SIGNING_KEY` — full contents of the Ed25519 private PEM.
- `UPDATE_PUBLIC_KEY` — full contents of the Ed25519 public PEM.

## Optional secrets (for rsync-to-server deploy)

- `DEPLOY_HOST` — e.g. `user@example.com`
- `DEPLOY_SSH_KEY` — private SSH key
- `DEPLOY_UPDATES_PATH` — e.g. `/var/lib/jablu/updates`
- `DEPLOY_DOWNLOADS_PATH` — e.g. `/var/lib/jablu/downloads`

## Workflow

```yaml
name: release-desktop

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Write private signing key
        shell: bash
        run: |
          echo "${{ secrets.UPDATE_SIGNING_KEY }}" > "${RUNNER_TEMP}/updater-private.pem"
          chmod 600 "${RUNNER_TEMP}/updater-private.pem"
          echo "UPDATE_SIGNING_KEY_PATH=${RUNNER_TEMP}/updater-private.pem" >> "$GITHUB_ENV"

      - name: Export public key to env
        shell: bash
        run: |
          {
            echo 'UPDATE_PUBLIC_KEY_PEM<<EOF'
            echo "${{ secrets.UPDATE_PUBLIC_KEY }}"
            echo 'EOF'
          } >> "$GITHUB_ENV"

      - name: Build + sign + package
        env:
          UPDATE_SIGNING_STRICT: '1'
        run: pnpm --filter @chat/desktop release

      - name: Upload artifacts to GitHub Release
        uses: softprops/action-gh-release@v2
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: |
            apps/desktop/release/*.exe
            apps/desktop/release/*.AppImage
            apps/desktop/release/latest*.yml
            apps/desktop/release/latest*.yml.sig
            apps/desktop/release/*.blockmap
          draft: true
          fail_on_unmatched_files: false

      # Optional: sync to your server via rsync. Requires the DEPLOY_* secrets.
      - name: Deploy to server
        if: ${{ secrets.DEPLOY_HOST != '' }}
        shell: bash
        env:
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_UPDATES_PATH: ${{ secrets.DEPLOY_UPDATES_PATH }}
          DEPLOY_DOWNLOADS_PATH: ${{ secrets.DEPLOY_DOWNLOADS_PATH }}
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          export DEPLOY_SSH_KEY=~/.ssh/deploy_key
          # The release script already ran in the previous step; re-run only the
          # rsync portion by letting it skip the rebuild (artifacts still in place).
          # Since release.mjs always rebuilds, we instead use direct rsync here:
          SSH_OPTS="-i ${DEPLOY_SSH_KEY} -o StrictHostKeyChecking=accept-new"
          cd apps/desktop/release
          rsync -av -e "ssh ${SSH_OPTS}" *.exe *.AppImage "${DEPLOY_HOST}:${DEPLOY_DOWNLOADS_PATH}/" || true
          rsync -av -e "ssh ${SSH_OPTS}" latest*.yml latest*.yml.sig "${DEPLOY_HOST}:${DEPLOY_UPDATES_PATH}/" || true
```
