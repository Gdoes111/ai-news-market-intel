import { NewsItem } from './types'
import { analyzeNewsContent } from './newsUtils'

export interface RSSFeed {
  id: string
  name: string
  url: string
  category: 'market' | 'general' | 'technology' | 'geopolitical'
  enabled: boolean
}

export const DEFAULT_RSS_FEEDS: RSSFeed[] = [
  // === TIER 1: Major Financial/Market ===
  {
    id: 'reuters-business',
    name: 'Reuters Business',
    url: 'https://feeds.reuters.com/reuters/businessNews',
    category: 'market',
    enabled: true
  },
  {
    id: 'reuters-markets',
    name: 'Reuters Markets',
    url: 'https://feeds.reuters.com/news/wealth',
    category: 'market',
    enabled: true
  },
  {
    id: 'bbc-business',
    name: 'BBC Business',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    category: 'market',
    enabled: true
  },
  {
    id: 'wsj-markets',
    name: 'Wall Street Journal',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',
    category: 'market',
    enabled: true
  },
  {
    id: 'cnbc-world',
    name: 'CNBC World',
    url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
    category: 'market',
    enabled: true
  },
  {
    id: 'associated-press',
    name: 'Associated Press',
    url: 'https://feeds.apnews.com/rss/apf-topnews',
    category: 'general',
    enabled: true
  },
  // === TIER 2: Fast/Political Intel ===
  {
    id: 'axios',
    name: 'Axios',
    url: 'https://api.axios.com/feed/',
    category: 'general',
    enabled: true
  },
  {
    id: 'politico',
    name: 'Politico',
    url: 'https://www.politico.com/rss/politicopicks.xml',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'al-jazeera',
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    category: 'geopolitical',
    enabled: true
  },
  // === TIER 3: Investigative/Independent ===
  {
    id: 'the-intercept',
    name: 'The Intercept',
    url: 'https://theintercept.com/feed/?lang=en',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'propublica',
    name: 'ProPublica',
    url: 'https://feeds.propublica.org/propublica/main',
    category: 'general',
    enabled: true
  },
  {
    id: 'zero-hedge',
    name: 'Zero Hedge',
    url: 'https://feeds.feedburner.com/zerohedge/feed',
    category: 'market',
    enabled: false
  },
  // === TIER 4: Entertainment/Pop Culture (TMZ etc for Polymarket) ===
  {
    id: 'tmz',
    name: 'TMZ',
    url: 'https://www.tmz.com/rss.xml',
    category: 'general',
    enabled: false
  },
  {
    id: 'deadline',
    name: 'Deadline Hollywood',
    url: 'https://deadline.com/feed/',
    category: 'general',
    enabled: false
  },
  // === TIER 5: Crypto/Web3 ===
  {
    id: 'coindesk',
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'market',
    enabled: false
  },
  {
    id: 'the-block',
    name: 'The Block',
    url: 'https://www.theblock.co/rss.xml',
    category: 'market',
    enabled: false
  },
  // === TIER 6: Asia Markets ===
  {
    id: 'nikkei-asia',
    name: 'Nikkei Asia',
    url: 'https://asia.nikkei.com/rss/feed/nar',
    category: 'market',
    enabled: false
  }
]

export interface RSSItem {
  title: string
  description: string
  link: string
  pubDate: string
  source: string
}

async function parseRSSFeed(feedUrl: string, sourceName: string): Promise<RSSItem[]> {
  try {
    const response = await fetch('/api/fetch-rss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedUrl })
    })
    if (!response.ok) throw new Error('Failed to fetch RSS feed')
    const data = await response.json()
    if (data.status !== 'ok') throw new Error(data.message || 'RSS parsing failed')
    return data.items.slice(0, 10).map((item: any) => ({
      title: item.title || 'Untitled',
      description: item.description || item.content || '',
      link: item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      source: sourceName
    }))
  } catch (error) {
    console.error(`Failed to parse RSS feed ${feedUrl}:`, error)
    return []
  }
}

export async function fetchRSSFeed(feed: RSSFeed): Promise<RSSItem[]> {
  return parseRSSFeed(feed.url, feed.name)
}

export async function fetchMultipleFeeds(feeds: RSSFeed[]): Promise<RSSItem[]> {
  const enabledFeeds = feeds.filter(f => f.enabled)
  
  const results = await Promise.allSettled(
    enabledFeeds.map(feed => fetchRSSFeed(feed))
  )

  const allItems: RSSItem[] = []
  
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value)
    }
  })

  const sortedItems = allItems.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime()
    const dateB = new Date(b.pubDate).getTime()
    return dateB - dateA
  })

  return sortedItems
}

export async function convertRSSItemToNews(rssItem: RSSItem): Promise<NewsItem> {
  const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  const cleanDescription = stripHtml(rssItem.description)
  const content = `Title: ${rssItem.title}\n\nContent: ${cleanDescription}`
  
  try {
    const analysis = await analyzeNewsContent(content)
    
    return {
      id: `rss-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: analysis.title || rssItem.title,
      summary: analysis.summary,
      source: rssItem.source,
      url: rssItem.link,
      timestamp: new Date(rssItem.pubDate).getTime(),
      priority: analysis.priority,
      categories: analysis.categories,
      isMarketRelated: analysis.isMarketRelated
    }
  } catch (error) {
    console.error('Failed to analyze RSS item:', error)
    
    return {
      id: `rss-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: rssItem.title,
      summary: cleanDescription.substring(0, 300) || 'No summary available',
      source: rssItem.source,
      url: rssItem.link,
      timestamp: new Date(rssItem.pubDate).getTime(),
      priority: 5,
      categories: ['general'],
      isMarketRelated: false
    }
  }
}

export async function fetchAndConvertFeeds(feeds: RSSFeed[], limit: number = 20): Promise<NewsItem[]> {
  const rssItems = await fetchMultipleFeeds(feeds)
  const limitedItems = rssItems.slice(0, limit)
  
  const newsItems = await Promise.all(
    limitedItems.map(item => convertRSSItemToNews(item))
  )
  
  return newsItems.filter(item => item !== null)
}

export function deduplicateNews(existingNews: NewsItem[], newNews: NewsItem[]): NewsItem[] {
  const existingTitles = new Set(
    existingNews.map(item => item.title.toLowerCase().trim())
  )
  
  return newNews.filter(item => {
    const titleLower = item.title.toLowerCase().trim()
    return !existingTitles.has(titleLower)
  })
}
