import { createMutableDatabase } from "./database"

export type PackMetadata = Record<"path" | "artist" | "title", string>

export interface Store {
  packs: Array<PackMetadata>
}

export function createStore() {
  return createMutableDatabase<Store>(".state/db.json", {
    packs: [],
  })
}

export function updateStoreWithLinks(
  store: Store,
  metadatas: Array<PackMetadata>
) {
  metadatas = metadatas.filter(
    (metadata) => !store.packs.some((pack) => pack.path === metadata.path)
  )
  store.packs.push(...metadatas)
}
