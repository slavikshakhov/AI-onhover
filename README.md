# Hover · Ask AI

A compact Electron + React + TypeScript assistant. Hover Explain for 350 ms, speak while inside the square, then leave to submit. Hover an explanation row to select it, then hover Code for 600 ms to generate an example without audio. Screenshot capture and screenshot questions have separate controls. Hover New topic for one second to clear the topic and cancel pending work. Native title-bar controls provide dragging, minimizing and closing; Pin toggles always-on-top.

## Start

Use Node.js 22.12+ and npm. From this folder:

```sh
nvm install
nvm use
npm ci
npm run dev:demo
```

If startup reports `ERR_REQUIRE_ESM` from Electron, your terminal is likely using Node 18. Run `nvm use`, verify `node -v` is at least 22.12, then run `npm ci` and retry. `.nvmrc` selects Node 22; `.npmrc` rejects dependency installation on unsupported Node versions. Without nvm, install Node 22.12+ using your preferred installer.

Click **Start demo** once. Demo explicitly simulates recording and answers about JavaScript arrays; it never opens the microphone or calls OpenAI. Explain, select a nested bullet, then Code demonstrates a targeted example. Demo screenshot capture shows a simulated code screen and uses the real drag-selection gesture. It is not speech recognition.

For real AI:

```sh
cp .env.example .env
# Edit .env: set OPENAI_API_KEY to your own key; keep DEMO_MODE=0.
npm run dev
```

On macOS, `npm run dev` compiles Electron, waits for Vite to listen, and launches Electron through macOS LaunchServices. Terminal environment overrides travel through a private local socket (never command-line arguments or an environment file); the app then loads the project’s `.env`. Closing the app or pressing Ctrl+C stops both Electron and Vite and removes temporary diagnostic logs. A second dev command fails on the occupied Vite port, and Electron also enforces a single app instance.

Session context is optional: Apply/Skip it, or hover Explain or Capture to begin directly. Configuration and context-apply replies have a five-second deadline; failed configuration offers **Retry connection** and does not block Capture. Disabled controls use a static cursor rather than a wait spinner.

Click **Enable microphone** and grant OS permission once. Subsequent conversation uses only pointer movement. Tab to Explain and hold Space or Enter for the same dwell delay; release to submit. Code activates once after its 600 ms dwell and never records. Hold the New topic key for one second to reset. Move away and back (or release and press again) before reactivation. The footer and gaps are safe pointer-rest areas.

```sh
npm run typecheck
npm test
npm run build
npm run test:ui     # launches a real desktop demo window
npm run test:startup-ui # startup, hover, cancellation, injected IPC failures; no API calls
npm run test:code-ui # selected Code + synthetic audio
npm run test:screenshot-ui # simulated capture + synthetic audio
npm run test:screenshot-outputs-ui # ordered outputs, exceptions, automatic fitting
npm run test:dev-ui # macOS: real dev capture + duplicate/shutdown/restart checks
npm run start:demo  # built desktop demo
npm start           # built real mode, reads .env
```

Vite hot-reloads renderer changes; restart development after main/preload edits. The production build is runnable through Electron; signed installers are not included.

## Configuration and architecture

Only the Electron main process reads `.env`. Defaults: `OPENAI_TEXT_MODEL=gpt-4.1-mini`, `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`, and `OPENAI_REVIEW_MODEL=gpt-4.1`. Overrides must support the corresponding endpoint and strict structured outputs. `DEMO_MODE=1` forces simulation even if a key exists. Never put credentials in a `VITE_` variable.

The renderer records an in-memory audio clip, checks audio energy to ignore silence, and sends a bounded byte array through a narrow, validated IPC bridge. Electron transcribes via `/v1/audio/transcriptions`, then requests a strict JSON-schema answer through `/v1/responses` with `store:false`. Responses are validated again locally. Each mode has its own schema constraints; a format violation gets at most one corrective request, which consumes the same one-request shortening allowance used by the layout. Code is rendered as text and never executed. The latest six ordinary concept exchanges preserve context across Explain/Code switches; screenshot exchanges remain in a separate in-memory history until removal, replacement or New topic. Transcripts are limited to 4,000 characters and answers are schema-bounded. There are no remote conversation IDs, agent sessions, frameworks, or tools.

Recording is limited to 30 seconds, stops on exit, and is discarded on focus loss. Tracks and AudioContext are released after every clip. Requests have a 45-second total deadline; shortening has 30 seconds. There are no automatic retries; re-enter to retry after an error. Reset aborts requests and invalidates late results in both processes. The panel uses a size-based budget and measures actual overflow before paint; at most one shortening call per answer, then an explicit full-answer fallback. Resize never causes repeated shortening calls. Fonts stay at least 13px for fitted answer content, with smaller control metadata. Code is never cut or reflowed into different syntax.

## Privacy

No application screenshots, audio, transcripts, answers, or conversation context are written to disk, browser storage, logs, or crash reports. The Electron session is nonpersistent; no crash reporter, analytics, database or conversation saving is enabled. Content exists only in process memory and is released/reset on new topic or quit (session defaults survive New topic and clear on quit) (JavaScript garbage collection is not secure memory erasure). OS swap/crash handling is outside the application's control. Audio references are discarded after transcription. `.env` is the sole intentionally local credential file and is gitignored.

Real-mode speech, text, and screenshots are processed by OpenAI. A successful capture automatically sends its cropped image to OpenAI exactly once for initial analysis, without recording audio. Screenshot follow-ups send the current image and its separate exchange history. API usage is billed separately from ChatGPT Plus. Provider retention policies still apply even with response storage disabled. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Integration follows the official [speech-to-text](https://developers.openai.com/api/docs/guides/speech-to-text), [structured output](https://developers.openai.com/api/docs/guides/structured-outputs), and [Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses) documentation. Demo makes no provider requests.

Context isolation, sandboxing and disabled Node integration protect the renderer. Navigation/popups are blocked, microphone-only permissions are restricted to this window, and the CSP blocks external renderer connections. There is no concealment, monitoring evasion, or capture exclusion.

## Platform limitations

macOS may require enabling Electron/your terminal in System Settings → Privacy & Security → Microphone and restarting. Windows requires desktop microphone access; Linux needs a working audio service and desktop session. A distributed macOS bundle would also need a microphone usage description, signing and applicable entitlements. Silence detection is an energy heuristic, not speech recognition; very quiet speech may be ignored and background noise can pass it. Microphone/API operation needs manual verification on your machine. Minimum window is 420 × 600; the initial window is one-third of the work area unless minimum dimensions take precedence.

## Manual acceptance checklist

- Fly across either square in less than 350 ms: no recording, microphone access or submission. Watch dwell progress for deliberate entry.
- In real mode, speak for several seconds; leave: microphone indicator disappears and one answer arrives. Silence produces no API question. Remain for 30 seconds: auto-submit; leave/re-enter before recording again.
- Switch away from the window while recording: discard, release microphone, no answer. Test leaving while permission is still pending.
- Explain “JavaScript arrays”, hover a nested item to select it, then hover Code: its example matches that item without opening the microphone. Return to explanation restores the selection and branches.
- During Processing, dwell over New topic for one second: answer clears, pending work is cancelled, old results never return. Keep hovering: no repeated reset.
- Resize to minimum and request long prose/code: complete readable content, one shortening attempt at most, or explicit “Answer needs more space”; no scrollbars or clipped code. Enlarge again and inspect complete answer.
- Deny microphone access or disconnect it: useful error, no stuck Listening state; restore permission and retry. Test invalid API key, offline network, unavailable model and quota/rate-limit errors; app stays usable.
- Test keyboard Space/Enter, visible focus, native close/minimize, Pin, and neutral pointer rest areas.

## Nested hover concepts

Hover a whole concept row for 600 ms (or focus it with Tab) to reveal a nested bulleted list. Every child has a separate, indented row and visible bullet, and can itself be expanded. Child counts vary with the topic, usually 2–5. Ancestors stay expanded while you move into descendants; leaving a branch for 300 ms collapses it. Only one sibling branch is open at each level.

Real API responses use a strict `{children: string[]}` schema and local validation: 1–5 distinct phrases, up to 10 words / 80 characters each and 35 words total. The paragraph/sentences expansion format is no longer accepted. The main process resolves child paths from previously generated, cached parents and sends the topic, original question, summary, ancestors and selected concept. Demo includes multi-level arrays concepts with variable child counts.

Nested lists appear inline when measured space permits. Otherwise the same panel focuses on the selected parent and its nested children. **Hover to return** goes back one level with a 600 ms dwell. All child rows remain together; the window grows when needed, within the current display’s work area. There are no continuation controls. Ancestor state is preserved when focusing a deeper node. Nothing is silently truncated; if a complete row cannot fit, enlarge the window. No scrolling or font shrinking.

Successful, pending and failed expansions are cached in memory by answer version and full node path. Re-hovering does not retry failures. A new/shortened answer or New topic clears the cache and invalidates pending results. Requests time out after 20 seconds, with no retries. Resource bounds: 128 expanded nodes per answer and paths up to 32 levels. Expansions do not record audio or add conversation exchanges.

Manual checks: expand a parent, verify multiple markers and indented rows, then expand a child and confirm its parent stays open. Move into grandchildren, exit briefly and return, leave for 300 ms, revisit cached nodes, resize to minimum, use hover return, and reset or ask a follow-up while loading. Check that a stationary pointer never activates a row moved by layout.


## Selected-item Code

Dwell over a main or nested concept row for 600 ms to select it. The selected row has a distinct highlight, and **Code for: …** shows its target even after leaving the list. Hover Code for 600 ms to generate one minimal example; it never records or transcribes audio. The original question, bounded topic history, summary, selected concept and ancestors determine the language/framework and scope. Non-programmable concepts receive a short explanation instead of irrelevant code. When no row is selected, Code uses the current explanation’s main topic. It is unavailable without a concept explanation, requires exit/re-entry, and caches successful/pending/failed results by answer version and path. **Return to explanation** restores the saved branches and selection without another request. A new main answer or New topic clears the selection and code cache.

## Screenshot workflow

1. Hover **Capture screenshot** for 700 ms. The assistant hides before taking a still frame of its current display. Press, drag a rectangle, and release in the temporary region selector. Hover Cancel to abandon selection (Escape also works).
2. The attached screenshot is analyzed automatically once. Coding challenges are implemented, complete code/output questions are evaluated, explicit debugging requests get corrected code, and an unclear task gets one short clarification. Capture never starts the microphone.
3. Hover **Ask about screenshot** for 350 ms to record a correction or follow-up, then leave to submit. It refers to the current challenge and its previous exchanges; switching views does not clear that history. Silence is ignored and the same recording limit and focus-loss discard apply.
4. Automatic results replace the visible panel without changing the concept selection. After capture, move to a neutral area before another control can activate. Initial failures remain visible without automatic retries. New topic cancels pending analysis and clears both conversations, selections, caches, expansions and the image.
5. While viewing a screenshot answer, the first deliberate hover over blue **Explain** only restores the saved explanation (or empty view). Staying there cannot record. Leave and re-enter before Explain resumes recording. Any saved selected-item Code view and the explanation tree remain in memory. **View screenshot answer** returns to the saved screenshot answer without recording or requesting it again.
6. **Remove** is a hover target. Removing or replacing the image clears its screenshot history and saved answer. New topic clears both topics, all caches, the screenshot and selection.

Screenshot code-output answers use one ordered bullet per requested result: `label: exact value` (reasons only when requested). Original labels are retained, or outputs are numbered. Exceptions and later outputs prevented by uncaught exceptions are explicit. Outputs stay complete without scrolling; if the panel is too small, it asks the user to enlarge the window instead of removing outputs. The current spoken request selects implementation, output analysis, explanation, or debugging. A vague request on a clear coding challenge defaults to solving it. TODOs and placeholders are replaced for implementation requests, while current-output requests analyze the unchanged code. Completed implementations and fixes display only the complete solution code, without headings, explanations or example calls. The answer uses compact padding and fixed 13 px code and bullet text. The window never resizes automatically. Controls reserve their own space before actual wrapped code is measured. Full code is displayed unchanged whenever it fits. Code uses one page first, then at most two lossless pages split at source-line boundaries (logical boundaries preferred). A reserved bottom row shows “1 of 2” / “2 of 2” with Next / Back, activated by a 500 ms hover with visible progress. Navigation requires exit and re-entry and never records audio or calls the provider. Only after exceeding two pages, at most one compact request is made per answer: concept examples may omit surrounding setup with brief dependency comments, while screenshot solutions must preserve every required behavior. Full and compact versions remain in memory; manual enlargement restores full code without another request. If neither fits in two readable pages, an explicit limitation replaces the code. There is no scrolling or partial code presented as complete. `npm run test:fit-ui` checks default 480×700, smaller 420×600, and manually enlarged 900×950 windows with synthetic responses. Missing requirements are stated explicitly. Contract/service/renderer tests use fixture responses; the output UI test uses simulated capture and answers without provider calls. `npm run build && node scripts/screenshot-intent-live.mjs` is an opt-in live Responses regression using the configured API key (billable): synthetic challenge images and fixture transcripts only, with no microphone recording or code execution.

The full still frame exists only during selection; only the cropped image remains attached, with the longest side capped at 2048 pixels. Nothing is placed on the clipboard or saved to disk. The region selector is the only additional window; answers stay in the assistant. No screen-capture exclusion or concealment features are used.

Real screen capture requires OS permission. On macOS, enable Electron (or its launching app) in System Settings → Privacy & Security → Screen Recording and restart when requested. Denial produces an actionable error without asking for microphone access. Windows/macOS/Linux display behavior can differ; capture targets the display containing the assistant. Wayland/PipeWire may require a portal picker and may not expose a matching display ID; the app reports this instead of silently capturing a different display. Screen selection expires after two minutes. Signed distribution and macOS permission entitlements remain packaging work.

Additional acceptance checks: capture while an explanation/code view is open and verify one initial analysis and no microphone indicator; drag in either direction; cancel selection; deny screen permission; verify controls cannot activate under a stationary pointer after restoration. Ask about the image, return through Explain and remain hovered (no recording), then exit/re-enter (recording resumes). Revisit the saved screenshot answer, replace/remove the image, reset while processing, and inspect the minimum-size layout. The demo desktop tests use simulated screenshot pixels and synthetic audio. Run `npm run test:dev-ui` for the full macOS dev launch/capture/lifecycle check (with other instances closed). To attach the capture check to a running dev app, start `HOVER_DEV_DEBUG_PORT=9333 npm run dev`, then run `node scripts/dev-capture-flow.mjs` in another terminal. It drives the actual Capture hover and rectangle selector, checks the decoded attachment, and asserts zero microphone/recorder calls. It does not save the image; in real mode the new automatic analysis sends that region to the configured provider. Use the synthetic screenshot tests when no real desktop content should be sent. The debug port is opt-in and should be omitted for normal use.

The direct-launch diagnostic reproduced `"Failed to get sources."` (a string rejection) with screen status `denied`; the same Electron binary launched through LaunchServices returned `granted` and a real desktop frame without any permission change. The capture logger now preserves that exact allowlisted error message. These observations establish a launch-context difference; the generic Electron rejection does not identify macOS’s internal TCC decision in more detail.

### Screenshot solution reliability

Screenshot requests now extract a private structured requirements record from comments, surrounding prose, examples and signatures before generating an answer. It records behavior, signature, input/output assumptions, ordering/ties, mutation restrictions, explicit efficiency requirements, examples and missing text. Essential unreadable text produces a request for a clearer screenshot instead of guessed requirements.

Implementations and fixes receive an independent image-plus-requirements-plus-candidate review. A failed review allows one correction and one verification-only review. A second failure is an error, not a displayed solution. Screenshot compaction makes just one bounded generation request with the original image, extracted requirements and complete candidate; it asks for equivalent logic without a second review/correction cycle. Neither screenshot source nor generated code is executed. Reset/replacement cancels work and clears in-memory context. No real screenshots, prompts, requirements or reviews are logged or written to disk; API requests use store:false.

Latency/cost: output/explanation requests normally make two model calls (extraction + answer); implementations normally make three (extraction + candidate + review), rising to five with correction and final verification. A compact implementation adds two calls, or four if correction is needed, without repeating extraction. Each review includes the image and consumes billable input/output tokens. Extraction and generation use the configured OPENAI_TEXT_MODEL. Reviews default to gpt-4.1 (override with OPENAI_REVIEW_MODEL); this separates the reviewer from the default gpt-4.1-mini generator, which rubber-stamped errors in live tests. Requests have 6,000-token extraction/review and 12,000-token candidate limits. Screenshot work has a bounded 180-second timeout per initial or compact workflow, no automatic retry loops. Actual latency and billing vary with the model, image and response length.

Capture keeps the full selected region as a lossless PNG at the source capture resolution; preview thumbnails alone are reduced. Fractional crop boundaries round outward. High-detail image input is retained. The provider may still resize images and small text remains a vision limitation: see [official image-input documentation](https://developers.openai.com/api/docs/guides/images-vision). There is no guarantee that unreadability will always be detected.

Deterministic tests check transport, contracts, ordering of stages, bounded correction, failure handling, replacement/reset isolation and compact-candidate review. They do not establish model quality. Run the opt-in, billable `node scripts/screenshot-reliability-live.mjs` after building for six synthetic image cases, including immutable interval merging, tied timestamps with repeated references, changed ordering rules, output analysis and unfinished implementation. Only synthetic results are saved to /tmp; generated code is not executed. Implementation results require manual semantic review against each fixture's listed cases; a pipeline success is not a quality pass.


Review pricing at verification time: GPT-4.1 is $2/M input and $8/M output tokens; GPT-4.1 mini is $0.40/M input and $1.60/M output (uncached standard rates). Thus review tokens cost five times as much as mini tokens, in addition to the extra calls. See the official [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1) and [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) pages. The live report separates observed token use from estimated cost; neither is a billing receipt.


### Session preparation and practical examples

At startup, enter technical defaults in Session context or hover Skip. Enable the microphone to optionally dictate context, review the editable transcript, then hover Apply. A compact persistent summary provides Edit context; Clear context is a separate explicit action in that view. Context lives in memory only. Changing it invalidates pending responses, topics, screenshots and dependent caches; ordinary New topic preserves the defaults. Explicit questions and visible screenshot requirements take precedence, and materially ambiguous questions should receive a short clarification.

Code means “show how this is used”: markup, CSS, commands, configuration, templates and functions are all valid examples. Accessibility examples should show real semantic elements and appropriate attributes, without unnecessary ARIA. Concepts without meaningful technical snippets receive concise practical usage examples. The exact nested selection and expanded branch survive Code/Return navigation.

`npm run test:session-ui` verifies setup, simulated dictation, applying and clearing context, New topic preservation, and stale renderer response rejection. Service tests inspect provider payloads with mocked responses; they do not establish live model quality.
