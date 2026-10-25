import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const xcode =
  process.platform === "darwin"
    ? spawnSync("xcodebuild", ["-version"], { encoding: "utf8" })
    : null;
const hvigor = [
  process.env.ENGLISHPILOT_HVIGOR,
  "C:/Program Files/Huawei/DevEco Studio/tools/hvigor/bin/hvigorw.js",
  "/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js",
].find((path) => path && existsSync(path));
const payload = existsSync(
  resolve(root, ".local/native-web/out/native-resources.json"),
);
console.log(
  JSON.stringify(
    {
      host: process.platform,
      bundledResources: payload,
      ios: {
        compilerAvailable: xcode?.status === 0,
        requirement:
          "Mac, Node 22+, Xcode 26+; Personal Team installation needs your connected device and Apple Account",
      },
      harmony: {
        compilerFound: !!hvigor,
        requirement:
          "DevEco Studio with HarmonyOS 5.0.0(12) SDK; set ENGLISHPILOT_HVIGOR to its hvigorw.js if installed elsewhere",
      },
      signingVerified: false,
    },
    null,
    2,
  ),
);

let command, args;
if (process.argv.includes("--ios-build")) {
  if (xcode?.status !== 0) {
    console.error("未发现可用 Xcode。请在 Mac 上执行此命令；未生成 IPA。");
    process.exitCode = 2;
  } else if (!payload) {
    console.error("请先执行 npm run native:build");
    process.exitCode = 2;
  } else {
    command = "xcodebuild";
    args = [
      "-project",
      "native/ios/App/App.xcodeproj",
      "-scheme",
      "App",
      "-configuration",
      "Debug",
      "-sdk",
      "iphonesimulator",
      "-destination",
      "generic/platform=iOS Simulator",
      "-derivedDataPath",
      ".local/native-ios-build",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ];
  }
}
if (process.argv.includes("--harmony-build")) {
  if (!hvigor) {
    console.error(
      "未发现 Hvigor。请先安装并配置 DevEco Studio / HarmonyOS SDK；未生成 HAP。",
    );
    process.exitCode = 2;
  } else if (!payload) {
    console.error("请先执行 npm run native:build");
    process.exitCode = 2;
  } else {
    command = process.execPath;
    args = [
      hvigor,
      "--mode",
      "module",
      "-p",
      "product=default",
      "-p",
      "module=entry@default",
      "-p",
      "buildMode=debug",
      "assembleHap",
      "--no-daemon",
    ];
  }
}
if (command) {
  const child = spawn(command, args, {
    cwd: process.argv.includes("--harmony-build")
      ? resolve(root, "native/harmony")
      : root,
    stdio: "inherit",
  });
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
