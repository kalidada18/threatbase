import { useEffect } from 'react'

interface SEOProps {
  title: string
  description: string
  path?: string
  type?: string
}

const BASE_URL = 'https://threatbase.qzz.io'
const SITE_NAME = 'Threatbase'

/**
 * Hook to dynamically update document title and meta tags per route.
 * Keeps Open Graph and Twitter Card tags in sync with the current page.
 */
export function useSEO({ title, description, path = '/', type = 'website' }: SEOProps) {
  useEffect(() => {
    // Update document title
    document.title = title

    // Helper to set/create a meta tag
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

    // Standard meta
    setMeta('name', 'description', description)

    // Open Graph
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', fullUrl)
    setMeta('property', 'og:type', type)

    // Twitter Card
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:url', fullUrl)

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', fullUrl)

    return () => {
      // Reset to defaults on unmount
      document.title = `${SITE_NAME} — Real-Time Threat Intelligence & IOC Blocklists`
    }
  }, [title, description, path, type])
}
