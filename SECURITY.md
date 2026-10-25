# Security

Keep provider keys and database credentials on the server. The native app uses a separate device credential, a pinned HTTPS origin, and no redirects. Server authentication and durable quota/receipt handling must remain enabled.

Do not post real keys, device profiles, learner backups or recordings in public issues. For suspected vulnerabilities, use GitHub's private vulnerability reporting when it is available on this repository; otherwise open a minimal issue requesting a private reporting channel without exploit secrets or learner data.

The automated release check examines filenames, obvious credential patterns and signing settings. It cannot prove the absence of all secrets or establish content rights; release maintainers must also inspect the actual staged files and decompressed artifacts.
