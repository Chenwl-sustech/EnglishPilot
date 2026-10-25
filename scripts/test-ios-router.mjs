import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Compile the actual Foundation-only router declarations with Capacitor's real
// Router contract, so this regression runs without a simulator or test signing.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scene = await readFile(join(root, "native/ios/App/App/SceneDelegate.swift"), "utf8");
const start = scene.indexOf("private struct BundledResource");
const end = scene.indexOf("class EnglishPilotViewController");
if (start < 0 || end <= start) throw Error("Cannot locate iOS router declarations");
const contract = await readFile(
  join(root, "node_modules/@capacitor/ios/Capacitor/Capacitor/Router.swift"),
  "utf8",
);
const checks = String.raw`
private let router = EnglishPilotRouter()
router.basePath = CommandLine.arguments[1]
let missing = router.basePath + "/__englishpilot_missing_resource__"
let cases: [(String, String, String)] = [
    ("initial host-only URL", URL(string: "capacitor://localhost")!.path, "index.html"),
    ("initial slash URL", URL(string: "capacitor://localhost/")!.path, "index.html"),
    ("root path", "/", "index.html"),
    ("explicit index", "/index.html", "index.html"),
    ("today route", "/today", "today/index.html"),
    ("today trailing slash", "/today/", "today/index.html"),
    ("mini-test route", "/mini-test", "mini-test/index.html"),
    ("settings route", "/settings", "settings/index.html"),
    ("unknown route", "/not-a-bundled-page", ""),
    ("parent traversal", "/../index.html", ""),
    ("nested parent traversal", "/today/../index.html", ""),
    ("relative path", "today", ""),
    ("backslash path", "/today\\index.html", "")
]
var failures = 0
for (name, path, file) in cases {
    let expected = file.isEmpty ? missing : router.basePath + "/" + file
    let actual = router.route(for: path)
    if actual != expected {
        failures += 1
        print("FAIL \(name): path=\(String(reflecting: path)), expected=\(expected), actual=\(actual)")
    } else if !file.isEmpty && !FileManager.default.fileExists(atPath: actual) {
        failures += 1
        print("FAIL \(name): routed file does not exist")
    }
}
print("iOS router: \(cases.count - failures)/\(cases.count) checks passed")
exit(failures == 0 ? 0 : 1)
`;
const scratch = await mkdtemp(join(tmpdir(), "englishpilot-ios-router-"));
try {
  const path = join(scratch, "RouterRegression.swift");
  await writeFile(path, `${contract}\n${scene.slice(start, end)}\n${checks}`);
  const result = spawnSync("xcrun", ["swift", path, join(root, "native/ios/App/App/public")], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
