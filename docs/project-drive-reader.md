# Android Drive project reader — 2026-09-24

User reports opening BLOCASA.ccmgis directly from the Google Drive document
provider fails on a tablet, with an incomplete transcription of a “could /
requested” error. Downloaded a read-only copy via the Drive connector: valid
8,601,222-byte ALAGIS JSON, two ANM layers containing 507 and 5,000 features.
The unmodified app opened this copy in desktop and Android-UA browser tests.
No physical tablet/provider reproduction was available; do not claim a proven
root cause or that the specific device failure has been eliminated.

Hardened the provider-facing read path in a dedicated persistence module:

- Sequential 1 MiB byte reads and streaming UTF-8 decoding, with exact length
  checks. Retry failed ranges up to three times without duplicate content.
- Forward stream and whole-text fallbacks retain provider compatibility;
  each fallback restarts with a new decoder and independent byte accounting.
- Per-operation idle timeout and overall two-minute deadline; actual progress
  alone extends idle waiting. Abort cancels the reader; obsolete results are
  not consumed. SecurityError does not cause retries or permission escalation.
- Both desktop handle and Android file-input paths use the same reader.
  File input begins reading immediately, without the old artificial delay.
- Progress/retry status, concise diagnostic error names, and instruction to
  reselect from Drive when a provider refuses all APIs. No requirement to copy
  the file to Downloads. Failed read leaves the existing project/destination
  unchanged and no longer reports successful completion in the command log.
- No Drive API scopes, network requests, credentials, saving, or mutation of
  the original file. This cannot bypass Android/Drive access denial.

Validation: 11 reader unit scenarios; 56 manual-saving regressions; five
snapshot isolation scenarios; canonical layout/map serialization; BLOCASA in
Chrome desktop and Android-UA via the actual ribbon Abrir button. Injected
two NotReadableError failures then recovered all 5,507 features. Injected
permanent failure preserved the previous project and filename, with zero
loadProject calls and no success message.

Private input and screenshots remain in staging only, outside Hosting and
official-source promotion. Publication target remains geomine-3 Hosting;
authentication and Firestore/Storage settings are unchanged.
