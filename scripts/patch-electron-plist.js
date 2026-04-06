// Patch the dev Electron binary's Info.plist so macOS shows "Nimbus" in the menu bar
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const plist = path.join(
  __dirname, '..', 'node_modules', 'electron', 'dist',
  'Electron.app', 'Contents', 'Info.plist'
)

if (!fs.existsSync(plist)) {
  console.log('[nimbus] Electron plist not found, skipping patch')
  process.exit(0)
}

try {
  execSync(`plutil -replace CFBundleDisplayName -string "Nimbus" "${plist}"`)
  execSync(`plutil -replace CFBundleName -string "Nimbus" "${plist}"`)
  console.log('[nimbus] Patched Electron.app plist → "Nimbus"')
} catch (err) {
  console.warn('[nimbus] Could not patch Electron plist:', err.message)
}
