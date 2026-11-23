export type ProviderPageResult = Record<string, unknown> & {
  providers: Array<Record<string, unknown>>
  nextId?: string | null
}

type FetchProviderPage = (startId?: string) => Promise<ProviderPageResult>

export const MAX_PROVIDER_PAGES = 100

/** Fetch sequential provider pages while preserving the server cursor. */
export async function listProviderPages(
  fetchPage: FetchProviderPage,
  startId?: string,
): Promise<ProviderPageResult> {
  let cursor = startId
  const providers: Array<Record<string, unknown>> = []
  const unavailableProviderIds: unknown[] = []
  let lastPage: ProviderPageResult | undefined
  let providerStatusAvailable = true
  let capabilitiesAvailable = true

  for (let pageNumber = 0; pageNumber < MAX_PROVIDER_PAGES; pageNumber++) {
    const page = await fetchPage(cursor)
    if (!Array.isArray(page.providers)) throw new Error("Provider response has no providers array.")

    providers.push(...page.providers)
    if (Array.isArray(page.unavailableProviderIds)) unavailableProviderIds.push(...page.unavailableProviderIds)
    providerStatusAvailable &&= page.providerStatusAvailable === true
    capabilitiesAvailable &&= page.capabilitiesAvailable === true
    lastPage = page

    if (page.nextId === null || page.nextId === undefined) {
      return {
        ...page,
        providers,
        complete: page.complete !== false
          && providerStatusAvailable
          && capabilitiesAvailable
          && unavailableProviderIds.length === 0,
        truncated: false,
        nextId: null,
        providerStatusAvailable,
        capabilitiesAvailable,
        unavailableProviderIds,
      }
    }
    if (typeof page.nextId !== "string" || !/^\d+$/.test(page.nextId)) {
      throw new Error("Provider response has an invalid nextId cursor.")
    }
    const nextCursor = BigInt(page.nextId)
    if (nextCursor <= BigInt(cursor ?? "0")) throw new Error("Provider response cursor did not advance.")
    cursor = page.nextId
  }

  if (!lastPage) throw new Error("Provider response was empty.")
  return {
    ...lastPage,
    providers,
    complete: false,
    truncated: true,
    nextId: cursor,
    providerStatusAvailable,
    capabilitiesAvailable,
    unavailableProviderIds,
  }
}
