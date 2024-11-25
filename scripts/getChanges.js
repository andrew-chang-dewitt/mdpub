import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const __dirname = import.meta.dirname
const CHANGELOG = resolve(__dirname, "../CHANGELOG.md")
const BODYFILE = resolve(__dirname, "../BODY.md")

async function main() {
  const file = await readFile(CHANGELOG, { encoding: "utf8" })
  const lines = file.split(/\r\n|\n/)

  let res = ``
  let take = false
  let keepGoing = true
  let idx = 0

  while (keepGoing) {
    const line = lines[idx]
    console.dir(line)

    if (line.startsWith("## [") && !take) {
      take = true
    } else if (line.startsWith("## [") && take) {
      take = false
      keepGoing = false
    } else if (take) {
      res += line
      res += "\n"
    }

    idx++
  }

  if (res.length == 0) {
    console.error("No changes in version, aborting release...")
    process.exit(1)
  }
  console.log(`writing to ${BODYFILE}`)
  await writeFile(BODYFILE, res.trim(), { encoding: "utf8" })
}

main()
