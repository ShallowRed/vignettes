/** The Umami service of an instance and its two websites, empty while unset. */
export interface UmamiConfig {
  host: string
  studioWebsiteId: string
  decksWebsiteId: string
}

/** Whether the instance sends page views: an Umami address and at least one website. */
export function measuresAudience(config: UmamiConfig): boolean {
  return Boolean(config.host && (config.studioWebsiteId || config.decksWebsiteId))
}
