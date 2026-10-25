# iPhone / iPad installation

Requirements: Mac, Node 22+, Xcode 26+ with iOS components and Command Line Tools. The app targets iOS 15+; actual Xcode/device compatibility depends on the Mac and device.

1. Download the Xcode project Release or clone this repository.
2. Run `npm ci`. From a source checkout run `npm run native:build`; the Xcode project archive already contains verified built pages, so `npm run native:sync` is sufficient unless shared pages were changed.
3. Run `npm run native:ios:check` for an unsigned simulator build.
4. Open `native/ios/App/App.xcodeproj` in Xcode. Sign in to your own Apple Account.
5. Choose the App target → Signing & Capabilities → Automatically manage signing, then your Team. Change `com.example.englishpilot` to a unique Bundle Identifier; keep the identifier and signing identity stable for future upgrades.
6. Connect and trust the iPhone/iPad, enable Developer Mode on the device if required, choose the device and Run. Confirm any developer trust prompts on the device itself.
7. Verify first launch, microphone denial/recovery, recording/playback and full backup export/restore.

Personal Team profiles expire after seven days; reinstall using Xcode and the same identity/identifier. Export a complete backup before upgrading, and verify actual data retention with an overlay installation. Do not uninstall an existing learning app to perform an update.

Apple documentation: https://developer.apple.com/help/account/basics/about-your-developer-account

## AI pairing

An installation works offline without pairing. To enable AI, deploy your own backend using `docs/cloud-backend.md`. Set `cloudOrigin` in `native/ios/App/App/SceneDelegate.swift` to that single canonical HTTPS origin, then rebuild. The source's example origin does not provide a shared public AI service.

Create a private JSON file outside the repository, mode 600, containing `origin`, `deviceToken` and `siteToken` (empty string). Only the device token goes here; never put provider or database keys in it. With the app installed and stopped, use Apple's `devicectl device copy to` with `appDataContainer`, your Bundle Identifier and destination `Library/Caches/englishpilot-ai-connection.json`. Launch the app; it validates the pinned origin, stores credentials in this-device-only Keychain and removes the temporary file. Delete the local pairing file afterwards. Do not publish pairing files or screenshots of credentials.

## Package formats

The public ZIP is a source/build project and requires your own signing. A development-signed IPA made for a Personal Team is limited to the profile's registered devices and expiry. The owner's personal IPA is deliberately excluded from the public repository and Release because its embedded profile contains device/account metadata. Arbitrary public distribution uses a suitable Apple distribution method, such as TestFlight or App Store, and the required membership.
