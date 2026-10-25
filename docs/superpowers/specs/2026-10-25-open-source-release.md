# EnglishPilot public release

The owner requested an installation package and publication as open source on their GitHub account. The owner selected MIT and the repository name EnglishPilot.

Publish a clean, independent source tree containing the learning application, iOS/Harmony hosts and deployable AI backend. Keep the existing installed application and production service unchanged. Include attribution and separate CC BY-SA-4.0 licensing for NGSL, NAWL and BNC/COCA vocabulary adaptations. Official exam content remains publisher links; private imported materials, recordings and backups never enter the repository.

Replace personal signing identities and production endpoint addresses with documented example values in the public copy. Publish build instructions and a reproducible Xcode project archive. A correctly structured, verified development-signed IPA may be produced locally for the owner's already provisioned devices, but its embedded profile and personal device metadata must not be published. Do not present an unsigned directory as an installable IPA or claim the Personal Team package installs on arbitrary devices.

Create the public repository under the authenticated owner's account only after verification, create a versioned Release, and upload only explicitly selected public artifacts with checksums. Do not publish secrets or personal account metadata in source, Git history, screenshots, CI logs or archives. Existing GitHub connector access is insufficient to create a repository or upload Release files; official gh CLI authentication is a user handoff.
