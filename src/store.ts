import { createMutableDatabase } from "./database"

export type PackMetadata = Record<"path" | "artist" | "title", string>

export interface Store {
  packs: Array<PackMetadata>
}

export function createStore(pathlike: string) {
  return createMutableDatabase<Store>(pathlike, {
    packs: [],
  })
}

export function updateStoreWithLinks(
  store: Store,
  metadatas: Array<PackMetadata>
) {
  // filter out any packs that already exist in the store
  metadatas = metadatas.filter(
    (metadata) => !store.packs.some((pack) => pack.path === metadata.path)
  )

  store.packs.push(...metadatas)
}
