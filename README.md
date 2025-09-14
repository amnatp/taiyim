CKD Kids (taiyim) — Deployment & PWA update notes

Overview

This folder contains the static site for the CKD Kids food guidance PWA. Key features and recent fixes:

- Non-blocking toast-based service worker update UI: when a new service worker is installed and waiting, the page shows an interactive toast with "อัปเดต" (Update) and "ปิด" (Dismiss). Clicking Update sends `postMessage({type:'SKIP_WAITING'})` to the waiting worker so it can activate and the page reloads on `controllerchange`.
- Service worker asset paths: `sw.js` uses relative asset paths (no leading slash) to work correctly when the site is hosted under a repository subpath on GitHub Pages (e.g. `https://<user>.github.io/<repo>/`).
- CSV export BOM: CSV exports are prefixed with a UTF-8 BOM to improve Thai character handling on iOS Numbers/Excel.
- Image resizing & cover-crop preview for uploaded food images.

Why these changes?

GitHub Pages serves sites at a repo subpath (e.g. `/taiyim/`). Absolute paths that start with `/` point to the domain root, breaking references to local assets. Using relative paths in `sw.js` and other assets avoids 404s.

The toast-based update UI provides a friendly, non-blocking UX: users can dismiss the prompt or intentionally accept the update.

How to deploy the updated site to GitHub Pages

1) Determine the branch used by GitHub Pages in your repository settings (common choices: `gh-pages`, `main`, or `docs`).

2) If you tested fixes on branch `fix/gh-pages-paths` locally and want to publish that branch directly to `gh-pages`, you can do:

```bash
# from repo root
git checkout fix/gh-pages-paths
git pull origin fix/gh-pages-paths
# create/update gh-pages branch from this branch and push
git checkout -B gh-pages
git push -f origin gh-pages
```

Note: force-pushing `gh-pages` will replace the remote `gh-pages` branch. If you prefer safer workflow, push `fix/gh-pages-paths` to remote and open a PR into the Pages source branch and merge via GitHub UI.

3) Wait ~30–60 seconds for GitHub Pages to publish. Then verify the site at:

https://<your-username>.github.io/<repo>/

Verification steps (browser)

- Open DevTools (F12) → Application (or Storage for Firefox) → Service Workers.
- Check the console for `SW registered` log message (the app logs this on successful registration).
- To force a clean install of the updated service worker: in DevTools → Application → Service Workers → click "Unregister" for the existing worker, then reload the page.
- To test update flow: open the site in two tabs. Deploy a new version to Pages, then in the second tab reload — you should see the interactive update toast. Click "อัปเดต" and watch the page reload when the new worker takes control.

Dev server (local testing)

You can test the site locally with a static server. From the `ysc/` directory:

```bash
# using serve (npm)
npx serve .
# or using python3
python3 -m http.server 8000
# then open http://localhost:5000 or http://localhost:8000
```

Notes & troubleshooting

- If the update toast doesn't appear: ensure the browser has installed the new `sw.js` (DevTools -> Application -> Service Workers -> "Update on reload" then reload). Also ensure `js/app.js` with the toast code is the currently served file.
- If images 404 on GitHub Pages: double-check `sw.js` asset list uses relative paths (no leading `/`) and that those files exist in the published site tree.
- CSV exports are prefixed with a BOM (`\uFEFF`) to improve compatibility with iOS apps when exporting Thai text.

Contact

If you want, I can prepare a PR with these changes or outline exact commands for your chosen Pages branch — tell me which branch you use for Pages and I’ll produce the exact push/PR steps.
