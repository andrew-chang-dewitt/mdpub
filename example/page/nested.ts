/**
 * example: dom manipulation w/ PageData
 * page data will be made available from frontmatter like so:
 * FIXME: this should probably be on some Provider type that's importable from
 * this plugin & fetches pageData dynamically? For now, this only works in dev,
 * which is frankly useless...
 */

// import { resolve } from "path"
// import { getPageData } from "vite-plugin-static-md"

// const path = resolve(__dirname, "nested/index.html")
// console.info(`will get data from page w/ id ${path}`)
// const data = getPageData(path)
const data = document.pageData
console.info("data fetched:")
console.dir(data)
const keywords = data?.keywords!
const tagsEl = document.querySelector("#tags")!

const ul = document.createElement("ul")
for (const kw of keywords) {
  const li: HTMLLIElement = document.createElement("li")
  li.textContent = kw
  ul.appendChild(li)
}

tagsEl.appendChild(ul)
