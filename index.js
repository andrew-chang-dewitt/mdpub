#!/usr/bin/env node

import logger from "loglevel"

import { main } from "./dist/index.js"

main(process.argv.slice(2))
  .then((_) => {
    logger.info("Done.")
    return 0
  })
  .catch((e) => {
    logger.error(e)
    return 1
  })
