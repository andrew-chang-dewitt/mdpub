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
import { rmSync } from "fs"
import { cp, glob, mkdtemp, rm, stat } from "fs/promises"
import { tmpdir } from "os"
import { join, parse, resolve } from "path"

import { FSWatcher, watch } from "chokidar"
import logger from "loglevel"

import { parseArgs } from "./arg-dedupe.js"
import { dir } from "./utils.js"

const __dirname = import.meta.dirname
const CWD = process.cwd()

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

  return livePreview(path, args._.slice(1))
}

async function livePreview(path: string, args: string[]): Promise<void> {
  logger.info("Starting live preview...")

  let appDir: TmpDir | undefined = undefined
  let watcher: FSWatcher | undefined = undefined
  let server: ChildProcess | undefined = undefined

  async function cleanup(): Promise<void> {
    logger.debug("Cleaning up...")
    if (appDir) await appDir.destroy()
    if (watcher && !watcher.closed) await watcher.close()
    if (server && !server.killed) server.kill("SIGINT")
    logger.debug("...cleanup complete")
  }

  function cleanupSync(): void {
    logger.debug("Cleaning up...")
    if (appDir) appDir.destroySync()
    if (server && !server.killed) server.kill("SIGINT")
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
      child.once("exit", async (code, signal) => {
        logger.debug("server exiting...")
        await cleanup()
        if (code === 0 || signal === "SIGINT") {
          resolve()
        } else {
          reject(
            new Error(
              `Unhandled exit code (${code}) or signal (${signal}) in server. `,
            ),
          )
        }
      })
    })
  }

  // ensure everything's cleaned up parent exit
  process.on("beforeExit", (_) => {
    logger.info("Shutting down...")
  })
  // same for CTRL+C
  process.on("SIGINT", (_) => {
    logger.info("CTRL+C caught")
    cleanupSync()
  })

  try {
    // make tempdir
    appDir = await getTempDir()
    const templateDir = `${__dirname}/../node_modules/create-vite-ssg/template-typescript`

    // copy template to tmpdir & clear out example in src/pages/
    logger.debug(`Loading template from ${templateDir} to ${appDir.path}`)
    logger.debug(dir(appDir))
    await cp(templateDir, appDir.path, { recursive: true })
    logger.debug("app template loaded")
    if (logger.getLevel() === logger.levels.TRACE) {
      for await (const f of glob(`${appDir.path}/**/*`)) {
        logger.trace(`    <TEMPDIR>${f.slice(appDir.path.length)}`)
      }
    }

    // install deps in appDir
    logger.info("Setting up preview server...")
    logger.debug("setup preview server environment")
    const install = spawnSync("npm", ["i"], { cwd: appDir.path })
    logger.debug("install results")
    logger.debug(install.output.toString())

    // replace pages at template w/ page given by path
    const srcPagesPath = join(appDir.path, "src/pages")
    await rm(srcPagesPath, { recursive: true, force: true })
    const isDir = await stat(path).then((s) => s.isDirectory())
    const resolvedSrc = resolve(CWD, path)
    const srcPath = isDir ? resolvedSrc : parse(resolvedSrc).dir
    logger.debug(`setting up preview server w/ content from ${srcPath}`)
    await cp(srcPath, join(srcPagesPath), { recursive: true })
    logger.debug(`${path} copied into temporary app`)
    logger.info("Done.")

    // make chokidar watcher that copies file at `path` to
    watcher = watch(srcPath)
    watcher.on("change", async (f) => {
      logger.debug(`${f} changed, updating...`)
      const source = resolve(srcPath, f)
      // get relative path from appDir root
      const relative = f.slice(srcPath.length + 1)
      const target = resolve(srcPagesPath, relative)
      logger.debug(`copying ${source} to ${target}`)
      await cp(source, target)
      logger.debug("update done")
    })
    logger.info(`Watching ${path} for changes`)

    // start vite dev server in temp dir
    let command_args = ["run", "dev"]
    if (args.length > 0) command_args = [...command_args, "--", ...args]
    server = spawn("npm", command_args, {
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
