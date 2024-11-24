import { inspect } from "util"

export function dir(obj: any): string {
  return inspect(obj, { colors: true })
}
