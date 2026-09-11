const CRITICAL_ASSET_CACHE = 'maneuver-critical-assets-v1'

const normalizeAssetUrl = (assetUrl: string): string => {
  try {
    return new URL(assetUrl, window.location.origin).toString()
  } catch {
    return assetUrl
  }
}

export const warmCriticalAssets = async (assetUrls: string[]): Promise<void> => {
  if (!('caches' in window) || assetUrls.length === 0) {
    return
  }

  try {
    const cache = await caches.open(CRITICAL_ASSET_CACHE)

    await Promise.all(
      assetUrls.map(async (assetUrl) => {
        const normalizedUrl = normalizeAssetUrl(assetUrl)
        const existing = await cache.match(normalizedUrl)
        if (existing) {
          return
        }

        const response = await fetch(normalizedUrl, { cache: 'reload' })
        if (response.ok) {
          await cache.put(normalizedUrl, response)
        }
      })
    )
  } catch (error) {
    console.warn('Failed to warm critical assets for offline use:', error)
  }
}
