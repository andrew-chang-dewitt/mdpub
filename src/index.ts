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

import { ChildProcess, spawn, spawnSync } from "child_process"
import { cp, glob, mkdtemp, rm, stat } from "fs/promises"
import { tmpdir } from "os"
import { join, parse } from "path"

import { FSWatcher, watch } from "chokidar"
import logger from "loglevel"

import { parseArgs } from "./arg-dedupe.js"
import { dir } from "./utils.js"
import { rmSync } from "fs"

const __dirname = import.meta.dirname
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
  verbose: number
  _: string[]
}

export async function main(argv: string[]): Promise<void> {
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

  // get path
  const path = args._[0]

  // if help option, display message & exit immediately
  // also, if no PATH, show help
  if (args.help || path === undefined) {
    // skip logger so this always prints
    process.stdout.write(HELP_MESSAGE)
    return
  }

  return livePreview(path)
}

async function livePreview(path: string): Promise<void> {
  logger.debug("Starting live preview...")

  let appDir: TmpDir | undefined = undefined
  let watcher: FSWatcher | undefined = undefined
  let server: ChildProcess | undefined = undefined

  async function cleanup(): Promise<void> {
    logger.debug("Cleaning up...")
    if (appDir) await appDir.destroy()
    if (watcher && !watcher.closed) await watcher.close()
    if (server && !server.killed) server.kill("SIGTERM")
    logger.debug("...cleanup complete")
  }

  function cleanupSync(): void {
    logger.debug("Cleaning up...")
    if (appDir) appDir.destroySync()
    if (server && !server.killed) server.kill("SIGTERM")
    logger.debug("...cleanup complete")
  }

  async function serverExit(child: ChildProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      child.on("error", (err) => {
        reject(
          new Error("Error raised in preview server process.", {
            cause: err,
          }),
        )
      })
      child.once("exit", (code) => {
        logger.info("server exiting...")
        cleanup()
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Unhandled exit code in server: ${code}`))
        }
      })
    })
  }

  // ensure everything's cleaned up parent exit
  process.on("beforeExit", (_) => {
    logger.info("Shutting down...")
    cleanupSync()
  })
  // same for CTRL+C
  process.on("SIGINT", (_) => {
    logger.info("CTRL+C caught, shutting down...")
    cleanupSync()
  })

  try {
    // make tempdir
    appDir = await getTempDir()
    const templateDir = `${__dirname}/../node_modules/create-vite-ssg/template-typescript`

    // copy template to tmpdir & clear out example in src/pages/
    await cp(templateDir, appDir.path, { recursive: true })
    logger.debug("app template loaded")
    if (logger.getLevel() === logger.levels.TRACE) {
      for await (const f of glob(`${appDir.path}/**/*`)) {
        logger.trace(`    <TEMPDIR>${f.slice(appDir.path.length)}`)
      }
    }

    // install deps in appDir
    logger.debug("setup preview server environment")
    const install = spawnSync("npm", ["i"], { cwd: appDir.path })
    logger.debug("install results")
    logger.debug(install.output.toString())

    // replace pages at template w/ page given by path
    logger.debug(`setting up preview server w/ content at ${path}`)
    const srcPagesPath = join(appDir.path, "src/pages")
    await rm(srcPagesPath, { recursive: true, force: true })
    const isDir = await stat(path).then((s) => s.isDirectory())
    const srcPath = isDir ? path : parse(path).dir
    await cp(srcPath, join(srcPagesPath), { recursive: true })
    logger.debug(`${path} copied into temporary app`)

    // make chokidar watcher that copies file at `path` to
    watcher = watch(srcPath)
    watcher.on("change", async (f) => {
      await cp(join(srcPath, f), join(srcPagesPath, f))
      logger.debug(`${f} updated in preview server`)
    })
    logger.info(`Watching ${path} for changes`)

    // start vite dev server in temp dir
    server = spawn("npm", ["run", "dev"], {
      cwd: appDir.path,
      stdio: [process.stdin, process.stdout, process.stderr],
    })

    return await serverExit(server)
  } catch (err) {
    logger.error(
      "Unhandled error caught in LivePreview, propagating upwards...",
    )
    cleanup()
    throw new Error("Unhandled error in livePreview:", { cause: err })
  }
}

interface TmpDir {
  path: string
  destroy: () => Promise<void>
  destroySync: () => void
}

async function getTempDir(): Promise<TmpDir> {
  const prefix = "mdpub-"
  const tempPath = join(tmpdir(), prefix)
  const path = await mkdtemp(tempPath)
  logger.debug(`...temp dir created: ${path}`)

  const destroy = async () => await rm(path, { recursive: true, force: true })
  const destroySync = () => rmSync(path, { recursive: true, force: true })

  return { path, destroy, destroySync }
}
