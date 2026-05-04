## [1.4.0](https://github.com/Leicas/KataMarrant/compare/v1.3.1...v1.4.0) (2026-05-04)

### Features

* **stats:** add quiz_log diagnostic to settle the "all-time count" mystery ([4808b8b](https://github.com/Leicas/KataMarrant/commit/4808b8b474f0a7f8d85844a1b69bc413d6075005))
* **ui:** desktop UX phase 1 — frameless window, sidebar nav, custom titlebar ([eafab86](https://github.com/Leicas/KataMarrant/commit/eafab86b26f234836f6f6183c857f176acc57721)), closes [#3](https://github.com/Leicas/KataMarrant/issues/3)
* **ui:** desktop UX phase 2 — visual system refresh (tokens, type, components) ([144857d](https://github.com/Leicas/KataMarrant/commit/144857d307aa6e90a05f825d5052ed236066c98a)), closes [#ef4444](https://github.com/Leicas/KataMarrant/issues/ef4444) [#d04545](https://github.com/Leicas/KataMarrant/issues/d04545)
* **updater:** activate signing — pubkey + createUpdaterArtifacts on ([dfb50df](https://github.com/Leicas/KataMarrant/commit/dfb50df54b7b798c8fc9a8d3c33e08c9a0325262))
* **updater:** bundle CHANGELOG.md + show current version notes from it ([2421b19](https://github.com/Leicas/KataMarrant/commit/2421b19182f0a6edd1e6827526daa0c86bf20cd2))
* **updater:** wire Tauri 2 auto-updater on desktop with custom UI ([cd7e011](https://github.com/Leicas/KataMarrant/commit/cd7e01167efbb02d2d0d7b59a5b7d01214f09bd7))

### Bug Fixes

* **android:** cfg-gate Window::minimize/maximize/close — mobile build broken ([498b730](https://github.com/Leicas/KataMarrant/commit/498b7309e86a2c32d4fd15c16fc8d0fa2dbd2530))
* **ci:** drop pre-init key.properties step + sign universal APK explicitly ([7f2d601](https://github.com/Leicas/KataMarrant/commit/7f2d60170c3230f90eb6a4e070ebe6a6958546db))
* **quiz:** missing idempotency guard let fast-double-click double-log answers ([997f7cd](https://github.com/Leicas/KataMarrant/commit/997f7cd1c39366fe486f0850d8bf06db2770191d))
* **ui,mobile:** broken layout — .shell-body needed flex-direction: column ([28b02fc](https://github.com/Leicas/KataMarrant/commit/28b02fc44e6383b18f9f14989db244e99569237d))
* **ui,mobile:** home no-scroll — hide today-strip + home-grid below 600px ([2cac703](https://github.com/Leicas/KataMarrant/commit/2cac7038244e8b2c1f7253caf4d57ea6720502de))
* **ui,mobile:** more breathing room between hero/actions/achievements ([f4336c5](https://github.com/Leicas/KataMarrant/commit/f4336c5f6095bfa9434e3f58de0708efe38f5d8c))
* **ui,mobile:** show achievements again — 3-col compact grid, hide mastery+today ([b91c104](https://github.com/Leicas/KataMarrant/commit/b91c1043250e2181a31385c27838bfe297d4bc58))
* **ui,updater:** window dragging + beta-channel updater endpoint + softer profile-hero ([3f59b69](https://github.com/Leicas/KataMarrant/commit/3f59b69ddeb890963c83725dec5b141248594d28))
* **ui:** quiz card never scrolls + goal pill text squash + tighter reveal ([9d57c91](https://github.com/Leicas/KataMarrant/commit/9d57c915a4eccdc9391fd6cf4e747f54abde29c1))
* **ui:** stop the home scroll, drop the double cog, tighten the hero strip ([411267e](https://github.com/Leicas/KataMarrant/commit/411267ef33e94762424fd93d399cfa5ca4767758))
* **ui:** use Rust commands for window min/max/close (definitive) ([1c5b92e](https://github.com/Leicas/KataMarrant/commit/1c5b92eedb156f71be654e0536a022e564654f3b))
* **ui:** window controls fallback paths + home action buttons above the fold ([d0397ec](https://github.com/Leicas/KataMarrant/commit/d0397ec85e97ab43aa5f294c5ac04db0f85e2b61))
* **updater:** patch latest.json.notes from CHANGELOG.md after build ([ae8d4f3](https://github.com/Leicas/KataMarrant/commit/ae8d4f3a3ba9f810958cdc74da00b352152e29d7))
* **updater:** sync package-lock.json with new updater + process deps ([bcb2f74](https://github.com/Leicas/KataMarrant/commit/bcb2f74e054ff41c4c9bec204d6f5a64bad961fb))

## [1.4.0-beta.16](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.15...v1.4.0-beta.16) (2026-05-04)

### Bug Fixes

* **ui,mobile:** more breathing room between hero/actions/achievements ([f4336c5](https://github.com/Leicas/KataMarrant/commit/f4336c5f6095bfa9434e3f58de0708efe38f5d8c))
* **ui,mobile:** show achievements again — 3-col compact grid, hide mastery+today ([b91c104](https://github.com/Leicas/KataMarrant/commit/b91c1043250e2181a31385c27838bfe297d4bc58))

## [1.4.0-beta.15](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.14...v1.4.0-beta.15) (2026-05-04)

### Bug Fixes

* **ui,mobile:** home no-scroll — hide today-strip + home-grid below 600px ([2cac703](https://github.com/Leicas/KataMarrant/commit/2cac7038244e8b2c1f7253caf4d57ea6720502de))

## [1.4.0-beta.14](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.13...v1.4.0-beta.14) (2026-05-03)

### Bug Fixes

* **ui,mobile:** broken layout — .shell-body needed flex-direction: column ([28b02fc](https://github.com/Leicas/KataMarrant/commit/28b02fc44e6383b18f9f14989db244e99569237d))

## [1.4.0-beta.13](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.12...v1.4.0-beta.13) (2026-05-03)

### Bug Fixes

* **android:** cfg-gate Window::minimize/maximize/close — mobile build broken ([498b730](https://github.com/Leicas/KataMarrant/commit/498b7309e86a2c32d4fd15c16fc8d0fa2dbd2530))

## [1.4.0-beta.12](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.11...v1.4.0-beta.12) (2026-05-03)

### Bug Fixes

* **quiz:** missing idempotency guard let fast-double-click double-log answers ([997f7cd](https://github.com/Leicas/KataMarrant/commit/997f7cd1c39366fe486f0850d8bf06db2770191d))

## [1.4.0-beta.11](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.10...v1.4.0-beta.11) (2026-05-03)

### Features

* **stats:** add quiz_log diagnostic to settle the "all-time count" mystery ([4808b8b](https://github.com/Leicas/KataMarrant/commit/4808b8b474f0a7f8d85844a1b69bc413d6075005))

## [1.4.0-beta.10](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.9...v1.4.0-beta.10) (2026-05-03)

### Bug Fixes

* **ui:** use Rust commands for window min/max/close (definitive) ([1c5b92e](https://github.com/Leicas/KataMarrant/commit/1c5b92eedb156f71be654e0536a022e564654f3b))

## [1.4.0-beta.9](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.8...v1.4.0-beta.9) (2026-05-03)

### Bug Fixes

* **ui:** window controls fallback paths + home action buttons above the fold ([d0397ec](https://github.com/Leicas/KataMarrant/commit/d0397ec85e97ab43aa5f294c5ac04db0f85e2b61))

## [1.4.0-beta.8](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.7...v1.4.0-beta.8) (2026-05-03)

### Bug Fixes

* **ui:** quiz card never scrolls + goal pill text squash + tighter reveal ([9d57c91](https://github.com/Leicas/KataMarrant/commit/9d57c915a4eccdc9391fd6cf4e747f54abde29c1))

## [1.4.0-beta.7](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.6...v1.4.0-beta.7) (2026-05-03)

### Bug Fixes

* **ui:** stop the home scroll, drop the double cog, tighten the hero strip ([411267e](https://github.com/Leicas/KataMarrant/commit/411267ef33e94762424fd93d399cfa5ca4767758))

## [1.4.0-beta.6](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.5...v1.4.0-beta.6) (2026-05-03)

### Bug Fixes

* **ui,updater:** window dragging + beta-channel updater endpoint + softer profile-hero ([3f59b69](https://github.com/Leicas/KataMarrant/commit/3f59b69ddeb890963c83725dec5b141248594d28))

## [1.4.0-beta.5](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.4...v1.4.0-beta.5) (2026-05-03)

### Features

* **ui:** desktop UX phase 1 — frameless window, sidebar nav, custom titlebar ([eafab86](https://github.com/Leicas/KataMarrant/commit/eafab86b26f234836f6f6183c857f176acc57721)), closes [#3](https://github.com/Leicas/KataMarrant/issues/3)
* **ui:** desktop UX phase 2 — visual system refresh (tokens, type, components) ([144857d](https://github.com/Leicas/KataMarrant/commit/144857d307aa6e90a05f825d5052ed236066c98a)), closes [#ef4444](https://github.com/Leicas/KataMarrant/issues/ef4444) [#d04545](https://github.com/Leicas/KataMarrant/issues/d04545)

## [1.4.0-beta.4](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.3...v1.4.0-beta.4) (2026-05-03)

### Bug Fixes

* **updater:** patch latest.json.notes from CHANGELOG.md after build ([ae8d4f3](https://github.com/Leicas/KataMarrant/commit/ae8d4f3a3ba9f810958cdc74da00b352152e29d7))

## [1.4.0-beta.3](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.2...v1.4.0-beta.3) (2026-05-03)

### Features

* **updater:** bundle CHANGELOG.md + show current version notes from it ([2421b19](https://github.com/Leicas/KataMarrant/commit/2421b19182f0a6edd1e6827526daa0c86bf20cd2))

## [1.4.0-beta.2](https://github.com/Leicas/KataMarrant/compare/v1.4.0-beta.1...v1.4.0-beta.2) (2026-05-03)

### Features

* **updater:** activate signing — pubkey + createUpdaterArtifacts on ([dfb50df](https://github.com/Leicas/KataMarrant/commit/dfb50df54b7b798c8fc9a8d3c33e08c9a0325262))

## [1.4.0-beta.1](https://github.com/Leicas/KataMarrant/compare/v1.3.1-beta.1...v1.4.0-beta.1) (2026-05-03)

### Features

* **updater:** wire Tauri 2 auto-updater on desktop with custom UI ([cd7e011](https://github.com/Leicas/KataMarrant/commit/cd7e01167efbb02d2d0d7b59a5b7d01214f09bd7))

### Bug Fixes

* **updater:** sync package-lock.json with new updater + process deps ([bcb2f74](https://github.com/Leicas/KataMarrant/commit/bcb2f74e054ff41c4c9bec204d6f5a64bad961fb))

## [1.3.1-beta.1](https://github.com/Leicas/KataMarrant/compare/v1.3.0...v1.3.1-beta.1) (2026-05-03)

### Bug Fixes

* **ci:** drop pre-init key.properties step + sign universal APK explicitly ([7f2d601](https://github.com/Leicas/KataMarrant/commit/7f2d60170c3230f90eb6a4e070ebe6a6958546db))

## [1.3.1](https://github.com/Leicas/KataMarrant/compare/v1.3.0...v1.3.1) (2026-05-03)

### Bug Fixes

* **ci:** write key.properties BEFORE tauri android init for signed APK ([3c49bff](https://github.com/Leicas/KataMarrant/commit/3c49bffbdd7b1c03bc4696e28652698e34c11e04))

## [1.3.0](https://github.com/Leicas/KataMarrant/compare/v1.2.5...v1.3.0) (2026-05-03)

### Features

* **data:** add youtube_id for yoko-gake (tP1Sj1uDfSo) ([0732fdf](https://github.com/Leicas/KataMarrant/commit/0732fdf0f1f666f1135bac25fa4d34cb8d4f5b88))

### Bug Fixes

* **quiz:** hard-ban recents (factor 0.0), bump deque to 10, fix subset escape ([12de1a8](https://github.com/Leicas/KataMarrant/commit/12de1a883d8413ad4bf0af45a892513b19f6321f))
* **quiz:** suppress repeats within last 6 picks; lower recent_fail_bonus to +2 ([4bfd0c7](https://github.com/Leicas/KataMarrant/commit/4bfd0c738b4843272f13e01219c6b76b48df4688))

## [1.2.5](https://github.com/Leicas/KataMarrant/compare/v1.2.4...v1.2.5) (2026-05-03)

### Bug Fixes

* **android:** bump minSdkVersion to 26 for tauri-plugin-schedule-task ([fb48d38](https://github.com/Leicas/KataMarrant/commit/fb48d3830f364b35a12c6760b4d870741a5ccb88))
* **ci:** tauri ios build --target uses short names, not Rust triples ([b4ac4c7](https://github.com/Leicas/KataMarrant/commit/b4ac4c712c519a609b9748f5cece6831988366d3))

## [1.2.4](https://github.com/Leicas/KataMarrant/compare/v1.2.3...v1.2.4) (2026-05-03)

### Bug Fixes

* **scheduler:** use absolute ::time path in iOS branch to dodge tokio::time shadow ([d545944](https://github.com/Leicas/KataMarrant/commit/d5459443313cffee6cf7872ee8dff6c507b7c56a))

## [1.2.3](https://github.com/Leicas/KataMarrant/compare/v1.2.2...v1.2.3) (2026-05-02)

### Bug Fixes

* **ci:** top-level time dep + tauri android init in release.yml ([c19bdbc](https://github.com/Leicas/KataMarrant/commit/c19bdbc5db6164159dcd1d48579d96f17676b668)), closes [#25264215901](https://github.com/Leicas/KataMarrant/issues/25264215901)

## [1.2.2](https://github.com/Leicas/KataMarrant/compare/v1.2.1...v1.2.2) (2026-05-02)

### Bug Fixes

* **ci:** force time/std feature so iOS picks up OffsetDateTime ([170510b](https://github.com/Leicas/KataMarrant/commit/170510bff70f270db7dd6c6e193253b8f6559a3e))

## [1.2.1](https://github.com/Leicas/KataMarrant/compare/v1.2.0...v1.2.1) (2026-05-02)

### Bug Fixes

* **ci:** wire NDK clang/ar/linker for Android cargo check + add time crate for iOS ([ec7db21](https://github.com/Leicas/KataMarrant/commit/ec7db217ea72f24e8d323c36bda1579690252acc))

## [1.2.0](https://github.com/Leicas/KataMarrant/compare/v1.1.0...v1.2.0) (2026-05-02)

### Features

* **sync:** sync daily_progress per (client, day), display merged total ([b407fa8](https://github.com/Leicas/KataMarrant/commit/b407fa81c89dbbe57bc6e7d7d36680e1f06d1dd2))

## [1.1.0](https://github.com/Leicas/KataMarrant/compare/v1.0.0...v1.1.0) (2026-05-02)

### Features

* **sync:** add force-resync recovery action ([1173ce8](https://github.com/Leicas/KataMarrant/commit/1173ce8dd3cca73fd0e1597020aaf3dd7b81c73a))

## 1.0.0 (2026-05-02)

### Features

* **audio:** regenerate clips with OpenAI gpt-4o-mini-tts + hiragana readings ([9fa708e](https://github.com/Leicas/KataMarrant/commit/9fa708ea7959a3b4dbf984f6640455f375b0c957))
* **auth:** polling magic-link flow with paste-code fallback ([0464596](https://github.com/Leicas/KataMarrant/commit/0464596056e008bf08d3348f9b375905594c157d))
* cron-style schedules + gamification + iOS parity + cross-device sync + CSP hardening ([d147952](https://github.com/Leicas/KataMarrant/commit/d1479520664a43feaa5c56056d0ad70460f00a26))
* tier 1+2 features + Play Store release prep ([b26fd41](https://github.com/Leicas/KataMarrant/commit/b26fd416769969765609b91a047c4e24694d010a))

### Bug Fixes

* **ci:** bump conventional-changelog-conventionalcommits to v8 ([274a021](https://github.com/Leicas/KataMarrant/commit/274a02187c9405010d3711346c53fe6050fd8747))
* **settings:** stop sync-status fetch from re-rendering on every keystroke ([f79dbc4](https://github.com/Leicas/KataMarrant/commit/f79dbc4dcb453cb0f943aa796b43771e0aa83cc7))
* **sync:** stamp updated_at on touch_shown, fix push cursor clock domain, surface real error to UI ([e770b7e](https://github.com/Leicas/KataMarrant/commit/e770b7e8008cc2b23bcd8c77238568fcd26f8bf1))
