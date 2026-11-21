# Release checklist

- [ ] Review `git diff` and confirm no credentials or generated archives are included.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Run `npm pack` and inspect the tarball contents.
- [ ] Test ESM, CJS, subpath exports, and declarations from the tarball.
- [ ] Configure npm Trusted Publishing for Node 24 and the workflow file.
- [ ] Confirm no `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is required.
- [ ] Obtain explicit authorization before `git push` or `npm publish`.
