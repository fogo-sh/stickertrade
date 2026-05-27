import type { Handle } from 'remix/ui'

import { absoluteUrl } from '../data/public-origin.ts'

export interface OgTagsProps {
  /** Page title used for og:title + twitter:title. */
  title: string
  /** Page description; falls back to a sensible site default. */
  description?: string
  /**
   * Image URL. Relative paths are resolved against the configured
   * `PUBLIC_ORIGIN` since OG scrapers require absolute URLs.
   */
  image?: string
  /** Canonical URL for this page. Required for og:url to be useful. */
  url?: string
  /** Open Graph type; defaults to 'website'. */
  type?: 'website' | 'article' | 'profile'
}

const DEFAULT_DESCRIPTION = 'invite-only sticker trading site'

export function OgTags(handle: Handle<OgTagsProps>) {
  return () => {
    const {
      title,
      description = DEFAULT_DESCRIPTION,
      image = '/images/banner.png',
      url,
      type = 'website',
    } = handle.props
    const absImage = absoluteUrl(image)
    const absUrl = url ? absoluteUrl(url) : undefined
    return (
      <>
        {/* Open Graph */}
        <meta property="og:site_name" content="stickertrade" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={absImage} />
        <meta property="og:type" content={type} />
        {absUrl ? <meta property="og:url" content={absUrl} /> : null}

        {/* Twitter cards */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={absImage} />

        {/* Plain description so search engines and clients without OG still get it */}
        <meta name="description" content={description} />
      </>
    )
  }
}
