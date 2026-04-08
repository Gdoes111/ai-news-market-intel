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
    id: 'bloomberg-markets',
    name: 'Bloomberg Markets',
    url: 'https://www.bloomberg.com/markets',
    category: 'market',
    enabled: true
  },
  {
    id: 'financial-times',
    name: 'Financial Times',
    url: 'https://www.ft.com/rss/home',
    category: 'market',
    enabled: true
  },
  {
    id: 'cnbc-world',
    name: 'CNBC World',
    url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
    category: 'geopolitical',
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
    name: 'Wall Street Journal Markets',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',
    category: 'market',
    enabled: true
  },
  {
    id: 'associated-press',
    name: 'Associated Press',
    url: 'https://feeds.apnews.com/rss/apf-topnews',
    category: 'general',
    enabled: true
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
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch RSS feed')
    }

    const data = await response.json()

    if (data.status !== 'ok') {
      throw new Error(data.message || 'RSS parsing failed')
    }

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
  const stripHtml = (html: string): string => {
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent || div.innerText || ''
  }

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
