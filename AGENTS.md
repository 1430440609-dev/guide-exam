# Guide exam website maintenance

- The user wants GitHub Pages at one permanent public repository URL. Do not publish updates to the earlier ChatGPT Sites host.
- Keep the current visual design and features when adding questions. Answer feedback belongs inline below the choices; never show an answer dialog.
- Maintain a shared published bank for everyone. Personal progress, mistakes and bookmarks stay in each browser. Keep localStorage key `guide-study-v1` stable.
- Preserve all existing question IDs and order during additions. Do not rebuild the original bank with new IDs, renumber it, or replace it with an incoming document.
- `dist/bank.json` is the original 165-question bank. Append new banks to `dist/extra-banks.json`, then rebuild `dist/bank.js` with `tools/build.mjs`. The `GUIDE_BANKS` array is the shared catalog.
- Prefer `tools/add-bank.mjs --file PATH --title TITLE --python BUNDLED_PYTHON` for future additions. It accepts DOCX, JSON, or formatted text; validates answers/options, skips duplicate questions and preserves existing IDs.
- Word extraction must include text from section headers and footers. Several original choices and answers are stored there.
- Validate the original bank with `node tools/check.cjs`. Verify inline answer reveal, multiselect submit, separate visitor progress and record retention after bank append.
- `tools/package-pages.mjs` prepares the public files in `outputs/github-pages/`. Publish only that allowlisted output; never upload reference/, original Word files, local filesystem paths, credentials, or personal browser data.
- The deployed repository root contains the published copies of the app and bank files. To modify from that checkout, maintain the same invariants even if the local dist/tools authoring layout is not present.
