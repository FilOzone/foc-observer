import { createRequire } from "node:module"

/** The published package version, read from package.json so a release changes no source. */
export const VERSION: string = createRequire(import.meta.url)("../package.json").version
