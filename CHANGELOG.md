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
