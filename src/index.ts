/**
 * mdpub
 *
 * a cli for authoring documents in markdown w/ live preview & publishing as pdf or html
 *
 * TODO:
 *
 * - [ ] live preview
 * - [ ] output to pdf
 * - [ ] output to html
 * - [ ] dump tmp prj to create-vite-ssg template at target directory
 **/

// import { parse } from "path"

import logger from "loglevel"
import { parseArgs } from "./arg-dedupe.js"
import { dir } from "./utils.js"

// const __dirname = import.meta.dirname
// const CWD = process.cwd()

const HELP_MESSAGE = `\
Usage: mdpub [PATH]

Start a live preview of the markdown file at the given path.

Options:
  -v, --verbosity INT           set log output level as number from 0 to 5
                                (inclusive) where lower is less verbose & higher
                                is more & where 0<=n<=5; default value is 2;
                                can give number as number of flags: \`-vvv\` => 3
  -h, --help                    display this message
`
const { TRACE, DEBUG, INFO, WARN, ERROR } = logger.levels
const levelsArray = [TRACE, DEBUG, INFO, WARN, ERROR]

interface Args {
  help: boolean
  overwrite: boolean
  verbose: number
  _: string[]
}

export function main(argv: string[]) {
  // parse args
  const args = parseArgs<Args>(argv, ["v", "verbose"], {
    default: { help: false, overwrite: false, verbose: 2 },
    alias: { h: "help", o: "overwrite", v: "verbose" },
    string: ["_"],
  })

  // setup logger from verbosity opt
  // values lower than 0 are 0
  if (0 >= args.verbose) {
    args.verbose = 0
  }
  // values higher than 5 are 5
  if (5 <= args.verbose) {
    args.verbose = 5
  }
  logger.setLevel(levelsArray[args.verbose])
  logger.debug(`log level set to: ${logger.getLevel()}`)

  logger.debug("init() called with args:")
  logger.debug(dir(args))

  // if help option, display message & exit immediately
  if (args.help) {
    // skip logger so this always prints
    process.stdout.write(HELP_MESSAGE)
    return
  }
}

// function livePreview() {}
