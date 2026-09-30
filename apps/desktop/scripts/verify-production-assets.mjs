import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.resolve(scriptDir, "../dist/index.html")
const html = fs.readFileSync(indexPath, "utf8")

const assetReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(([, reference]) => reference)
  .filter((reference) => reference.startsWith("./assets/"))

if (assetReferences.length === 0) {
  throw new Error(`No relative production assets found in ${indexPath}`)
}

for (const reference of assetReferences) {
  const assetPath = path.resolve(path.dirname(indexPath), reference)
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Missing production asset: ${assetPath}`)
  }
}

if (html.includes('src="/assets/') || html.includes('href="/assets/')) {
  throw new Error(`Production assets must be relative in ${indexPath}`)
}

console.log(`Verified ${assetReferences.length} production assets in ${indexPath}`)
