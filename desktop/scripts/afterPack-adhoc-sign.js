// electron-builder afterPack hook.
//
// We have no Apple Developer ID cert (see docs/RELEASE.md § TODO Code
// signing), so electron-builder's own signing step finds no identity and
// skips signing entirely (app.mac.identity is left unset, and CI sets
// CSC_IDENTITY_AUTO_DISCOVERY=false) — the .app ships with *no* signature
// at all. On Apple Silicon, macOS refuses to run an unsigned arm64 binary
// even after `xattr -cr` clears the quarantine flag ("...is damaged and
// can't be opened"). Ad-hoc signing (`codesign --sign -`) satisfies that
// arm64 requirement without needing a real certificate; it still isn't
// notarized, so `xattr -cr` is still required to clear quarantine.
const { execFileSync } = require("child_process");
const path = require("path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
};
