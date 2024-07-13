//@ts-check
import path from "node:path"
import fs from "node:fs"
import { execa } from "execa"

const isArchive = (s) => /\.(zip|rar)$/.test(s)
const isZip = (s) => /\.zip$/.test(s)
const isRar = (s) => /\.rar$/.test(s)
const isDirectory = (s) => new RegExp(`${path.sep}$`).test(s)

/**
 * @param {string} file
 * @returns {Promise<Array<string>>} All the files present within an archive.
 */
async function getArchiveFileNames(file) {
  const executed = isRar(file)
    ? await execa`unrar lb ${file}`
    : await execa`unzip -Z1 ${file}`
  return executed.stdout.split("\n")
}

/**
 *
 * @param {string} directory Directory containing all the samples
 * @returns {Array<string>} A list of archive files
 */
function getArchives(directory) {
  return fs
    .readdirSync(directory, {
      withFileTypes: true,
      recursive: true,
      encoding: "utf8",
    })
    .filter((dirent) => dirent.isFile() && isArchive(dirent.name))
    .map((dirent) => path.join(dirent.parentPath, dirent.name))
}

/**
 * @param {Array<string>} archiveFileNames
 * @returns {{ type: "Deep" | "Flat" } | { type: "Nested", filepath: string }}
 * @description
 * There are 3 considerations which we'll label:
 *
 * - Nested - When an archive contains an archive
 * - Deep - When an archive has a single directory in the lower value.
 *   `__MACOSX/` is ignored when considering "Deep" archives.
 * - Flat - When none of the above preconditions are met.
 */
function getPackageStructure(archiveFileNames) {
  // todo: some files contain archives
  // todo: check if file contains one

  const filtered = archiveFileNames.filter(
    (string) => !string.includes("__MACOSX")
  )

  if (filtered.every((filename) => isArchive(filename))) {
    return { type: "Deep" }
  }

  const topLevelDirectories = filtered
    .filter((filepath) => !isDirectory(filepath))
    .map((filepath) => filepath.split(path.sep))
    // Remove last element `""` for directories
    .map((segments) => segments.slice(0, segments.length - 1))
    // directories at top level only
    .filter((segments) => segments.length == 1)
    .map((segments) => segments[0])

  const unique = new Set(topLevelDirectories)

  if (unique.size === 1) {
    return { type: "Nested", filepath: unique.values().next().value }
  }

  return { type: "Flat" }
}

/**
 *
 * @param {string} filepath
 * @returns {Promise<{structure: { type: "Deep" | "Flat" } | { type: "Nested", filepath: string }, filepath: string}>}
 */
async function getStructures(filepath) {
  const contents = await getArchiveFileNames(filepath)
  const structure = getPackageStructure(contents)
  return { structure, filepath }
}

/**
 *
 * @param {string} archive File of type `.zip`.
 * @param {string} destination
 */
async function unzip(archive, destination) {
  const exec = execa({
    buffer: false,
    stdout: ["inherit", "inherit", "inherit"],
  })
  const excludes = "__MACOSX/*"
  return await exec`unzip -d ${destination} ${archive} -x ${excludes}`
}

/**
 * @param {{structure: { type: "Deep" | "Flat" } | { type: "Nested", filepath: string }, filepath: string}} content
 */
async function unpack(content) {
  const to = path.relative(
    path.dirname(path.dirname(content.filepath)),
    path.join(
      path.dirname(content.filepath),
      path.basename(content.filepath, path.extname(content.filepath))
    )
  )

  switch (content.structure.type) {
    case "Nested": {
      const from = path.join(
        path.dirname(content.filepath),
        content.structure.filepath
      )

      await unzip(content.filepath, path.dirname(content.filepath))

      fs.renameSync(from, to)
      break
    }
    case "Flat": {
      await unzip(content.filepath, to)
      break
    }
    case "Deep": {
      await unzip(content.filepath, to)

      // reapply this script all the packs we unzipped.
      const archives = getArchives(to)
      await unpackArchives(archives)
      break
    }
  }

  fs.unlinkSync(content.filepath)
}

/**
 * @param {Array<string>} archives
 */
async function unpackArchives(archives) {
  const structures = await Promise.all(
    archives.map((filepath) => getStructures(filepath))
  )

  const zips = structures
    // I've only got one rar directory so let's worry about this later.
    .filter((content) => isZip(content.filepath))

  for (const zip of zips) {
    await unpack(zip)
  }
}

async function main() {
  const archives = getArchives(path.resolve())
  await unpackArchives(archives)
}

main()
