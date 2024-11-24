import minimist, { Opts } from "minimist"
import console from "loglevel"
import { dir } from "./utils.js"

const isShort = /^-[a-zA-Z]+$/

function splitShort(arg: string): string[] | string {
  if (!isShort.test(arg)) {
    return arg
  }

  return arg
    .slice(1)
    .split("")
    .map((f: string) => `-${f}`)
}
function isolateArgs(argv: string[]): string[] {
  return argv.map(splitShort).flat()
}

type Counts = Record<string, number>

function count(counts: Counts, item: string) {
  if (!counts[item]) counts[item] = 1
  else counts[item] += 1

  return counts
}

function arrayIncludes(array: any[], value: any): boolean {
  if (!Array.isArray(value)) return array.includes(value)

  const subarrays = array.filter(Array.isArray)
  if (subarrays.length === 0) return false

  for (const a of subarrays) {
    if (a.length === value.length) {
      const isEqual = a.every((v, i) => v === value[i])
      if (isEqual) return true
    }
  }

  return false
}

function handleDupes(
  args: string[],
  counts: Counts,
  toCheck: string[],
): (string | number)[] {
  const givenCounts: (string | [string, number])[] = args.map((arg) =>
    toCheck.includes(arg.slice(1)) ? [arg, counts[arg]] : arg,
  )
  console.log("--- BEGIN handleDedupes ---")
  console.debug(dir(givenCounts))

  let seen: (string | [string, number])[] = []

  return givenCounts
    .filter((arg) => {
      if (!Array.isArray(arg)) return true

      if (!arrayIncludes(seen, arg)) {
        let keep = true

        if (!toCheck.includes(arg[0].slice(1))) {
          keep = false
        }

        seen.push(arg)

        return keep
      }

      return false
    })
    .flat()
}

export function parseArgs<T>(
  argv: string[],
  canDup: string[] = [],
  opts?: Opts,
): T {
  const isolated = isolateArgs(argv)
  console.debug(dir(isolated))
  const counts = isolated.reduce(count, {})
  console.debug(dir(counts))
  const deduped = handleDupes(isolated, counts, canDup)
  console.debug(dir(deduped))
  const parsed = minimist<T>(deduped as string[], opts)

  return parsed as T
}
