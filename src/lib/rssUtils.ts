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
    url: 'https://feeds.reuters.com/reuters/businessNews.rss',
    category: 'market',
    enabled: true
  },
  {
    id: 'reuters-markets',
    name: 'Reuters Markets',
    url: 'https://feeds.reuters.com/news/wealth.rss',
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
    url: 'https://apnews.com/rss',
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
    enabled: true
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
    enabled: true
  },
  {
    id: 'the-block',
    name: 'The Block',
    url: 'https://www.theblock.co/rss.xml',
    category: 'market',
    enabled: true
  },
  // === TIER 6: Asia Markets ===
  {
    id: 'nikkei-asia',
    name: 'Nikkei Asia',
    url: 'https://asia.nikkei.com/rss/feed/nar',
    category: 'market',
    enabled: true
  },
  // === TIER 7: Energy & Middle East ===
  {
    id: 'oilprice',
    name: 'OilPrice.com',
    url: 'https://oilprice.com/rss/main',
    category: 'market',
    enabled: true
  },
  {
    id: 'energy-monitor',
    name: 'Energy Monitor',
    url: 'https://www.energymonitor.ai/feed/',
    category: 'market',
    enabled: true
  },
  {
    id: 'middle-east-eye',
    name: 'Middle East Eye',
    url: 'https://www.middleeasteye.net/rss',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'arab-news',
    name: 'Arab News',
    url: 'https://www.arabnews.com/rss.xml',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'upstream-online',
    name: 'Upstream Online',
    url: 'https://www.upstreamonline.com/rss',
    category: 'market',
    enabled: true
  },
  // === TIER 8: Europe ===
  {
    id: 'euronews',
    name: 'Euronews',
    url: 'https://www.euronews.com/rss?format=mrss&level=theme&name=news',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'ft-world',
    name: 'Financial Times World',
    url: 'https://www.ft.com/world?format=rss',
    category: 'market',
    enabled: true
  },
  {
    id: 'dw-news',
    name: 'DW News',
    url: 'https://rss.dw.com/rdf/rss-en-all',
    category: 'geopolitical',
    enabled: true
  },
  // === TIER 9: Asia-Pacific ===
  {
    id: 'scmp',
    name: 'South China Morning Post',
    url: 'https://www.scmp.com/rss/91/feed',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'straits-times',
    name: 'Straits Times',
    url: 'https://www.straitstimes.com/news/world/rss.xml',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'the-hindu-business',
    name: 'The Hindu Business Line',
    url: 'https://www.thehindubusinessline.com/feeder/default.rss',
    category: 'market',
    enabled: true
  },
  {
    id: 'abc-australia',
    name: 'ABC News Australia',
    url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    category: 'general',
    enabled: true
  },
  // === TIER 10: Americas (Latin America) ===
  {
    id: 'mercopress',
    name: 'MercoPress (Latin America)',
    url: 'https://en.mercopress.com/rss',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'rio-times',
    name: 'Rio Times (Brazil)',
    url: 'https://www.riotimesonline.com/feed/',
    category: 'geopolitical',
    enabled: true
  },
  // === TIER 11: Africa ===
  {
    id: 'african-business',
    name: 'African Business Magazine',
    url: 'https://african.business/feed',
    category: 'market',
    enabled: true
  },
  {
    id: 'daily-maverick',
    name: 'Daily Maverick (South Africa)',
    url: 'https://www.dailymaverick.co.za/dmrss/',
    category: 'geopolitical',
    enabled: true
  },
  // === TIER 12: Russia / Eastern Europe / Central Asia ===
  {
    id: 'kyiv-independent',
    name: 'Kyiv Independent',
    url: 'https://kyivindependent.com/feed/',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'intellinews',
    name: 'bne IntelliNews (Emerging Europe/CIS)',
    url: 'https://www.intellinews.com/feed/',
    category: 'geopolitical',
    enabled: true
  },
  // === TIER 13: South Asia ===
  {
    id: 'dawn-pakistan',
    name: 'Dawn (Pakistan)',
    url: 'https://www.dawn.com/feeds/home',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'economic-times-india',
    name: 'Economic Times India',
    url: 'https://economictimes.indiatimes.com/rssfeedsdefault.cms',
    category: 'market',
    enabled: true
  },
  // === TIER 14: Reddit Sentiment ===
  {
    id: 'reddit-wallstreetbets',
    name: 'Reddit WallStreetBets',
    url: 'https://www.reddit.com/r/wallstreetbets/top/.rss?t=day',
    category: 'market',
    enabled: true
  },
  {
    id: 'reddit-investing',
    name: 'Reddit Investing',
    url: 'https://www.reddit.com/r/investing/top/.rss?t=day',
    category: 'market',
    enabled: true
  },
  {
    id: 'reddit-geopolitics',
    name: 'Reddit Geopolitics',
    url: 'https://www.reddit.com/r/geopolitics/top/.rss?t=day',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'reddit-worldnews',
    name: 'Reddit WorldNews',
    url: 'https://www.reddit.com/r/worldnews/top/.rss?t=day',
    category: 'geopolitical',
    enabled: true
  },
  {
    id: 'reddit-economics',
    name: 'Reddit Economics',
    url: 'https://www.reddit.com/r/economics/top/.rss?t=day',
    category: 'market',
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
