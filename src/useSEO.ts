import { useEffect } from 'react'

interface SEOProps {
  title: string
  description: string
  path?: string
  type?: string
  /** Comma-separated keywords for this page. */
  keywords?: string
  /** Absolute or root-relative social share image. */
  image?: string
  /** When true, emit a noindex robots directive (e.g. private/user pages). */
  noindex?: boolean
}

const BASE_URL = 'https://threatbase.qzz.io'
const SITE_NAME = 'Threatbase'
const DEFAULT_TITLE = `${SITE_NAME}: Real-Time Threat Intelligence & IOC Blocklists`
const DEFAULT_IMAGE = `${BASE_URL}/img/logo.png`

/**
 * Hook to dynamically update document title and meta tags per route.
 * Keeps standard, Open Graph, and Twitter Card tags in sync with the current page,
 * and toggles the robots directive for pages that should not be indexed.
 */
export function useSEO({ title, description, path = '/', type = 'website', keywords, image, noindex }: SEOProps) {
  useEffect(() => {
    document.title = title

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    const fullUrl = `${BASE_URL}${path}`
    const imageUrl = image
      ? (image.startsWith('http') ? image : `${BASE_URL}${image}`)
      : DEFAULT_IMAGE

    // Standard meta
    setMeta('name', 'description', description)
    if (keywords) setMeta('name', 'keywords', keywords)
    setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')

    // Open Graph
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', fullUrl)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:image', imageUrl)
    setMeta('property', 'og:site_name', SITE_NAME)

    // Twitter Card
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:url', fullUrl)
    setMeta('name', 'twitter:image', imageUrl)

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', fullUrl)

    return () => {
      // Reset indexable default on unmount so a transient noindex page never
      // leaves the directive applied to the next route.
      document.title = DEFAULT_TITLE
      setMeta('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
    }
  }, [title, description, path, type, keywords, image, noindex])
}
