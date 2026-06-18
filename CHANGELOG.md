# Changelog

All notable changes to CmdrZone are documented here. This project adheres to
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The app reads this file at runtime: each `## [version]` section becomes an entry in the
in-app **What's New** dialog, and the section matching the running build is shown automatically
the first time that version launches.

## [0.1.0] - 2026-06-18

### Added

- **In-app updates.** CmdrZone now checks GitHub Releases for newer versions in the background.
  When the app is code-signed it downloads the update and offers **Restart to update**; otherwise
  it shows a notice that opens the release page so you can grab the new build manually.
- **What's New dialog.** Opens automatically the first time a new version runs, and any time from
  the version label in the sidebar footer. Reads its release notes from this changelog.
- **Version label** in the sidebar footer, with a manual *Check for updates* action.

### Notes

- macOS only installs updates in place for apps signed with an Apple Developer ID and notarized.
  Until signing is configured, the updater runs in notify-and-open-release-page mode.
