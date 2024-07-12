//@ts-check
// Unpack the directory structure.
// We assume it's `?/artist/title.zip`
import path from "node:path"
import fs from "node:fs"
import { exec as exec_ } from "node:child_process"
import utils from "node:util"

const exec = utils.promisify(exec_)

// Strategies
// - Inner: the classic. Contains a folder in a folder.
// - Nested: an archive that contains archives.
// - Flat:

const isArchive = /\.(zip,rar)$/.test
const isZip = /\.zip$/.test
const isRar = /\.rar$/.test
const isDirectory = new RegExp(`${path.sep}$`).test

/**
 * @param {string} file
 * @returns {Promise<Array<string>>} All the files present within an archive.
 */
async function getArchiveFileNames(file) {
  const command = isRar(file) ? `unrar lb "${file}"` : `unzip -Z1 "${file}"`
  const executed = await exec(command, { encoding: "utf8" })
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

  const filtered = archiveFileNames.filter((segments) =>
    segments.includes("__MACOSX/")
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

  if (topLevelDirectories.length === 1) {
    return { type: "Nested", filepath: topLevelDirectories[0] }
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
 * @param {{structure: { type: "Deep" | "Flat" } | { type: "Nested", filepath: string }, filepath: string}} content
 */
// recurse on deep
async function unpack(content) {
  const to = path.join(
    path.dirname(content.filepath),
    path.basename(content.filepath, path.extname(content.filepath))
  )

  switch (content.structure.type) {
    case "Nested": {
      await exec(
        `unzip -qq -d "${path.dirname(content.filepath)}" "${content.filepath}"`
      )

      const from = content.structure.filepath

      fs.renameSync(from, to)
    }
    case "Flat": {
      await exec(`unzip -qq -d "${to}" "${content.filepath}"`)
    }
    case "Deep": {
      await exec(`unzip -qq -d "${to}" "${content.filepath}"`)

      // reapply this script all the packs we unzipped.
      const archives = getArchives(to)
      await unpackArchives(archives)
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

  await Promise.all(
    structures
      // I've only got one rar directory so let's worry about this later.
      .filter((content) => isZip(content.filepath))
      .map(unpack)
  )
}

async function main() {
  const archives = getArchives(path.resolve())
  await unpackArchives(archives)
}

main()
