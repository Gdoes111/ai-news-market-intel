import { useState, useMemo, useCallback } from 'react'
import { useKV } from '@github/spark/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Newspaper, TrendUp, Lightning, Plus, Rss, Timer } from '@phosphor-icons/react'
import { NewsItem } from '@/lib/types'
import { NewsCard } from '@/components/NewsCard'
import { AddNewsDialog } from '@/components/AddNewsDialog'
import { RSSFeedDialog } from '@/components/RSSFeedDialog'
import { EmptyState } from '@/components/EmptyState'
import { Toaster } from '@/components/ui/sonner'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { toast } from 'sonner'

function App() {
  const [news, setNews] = useKV<NewsItem[]>('news-items', [])
  const [feeds] = useKV<any[]>('rss-feeds', [])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rssDialogOpen, setRssDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('priority')
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)

  const handleAddNews = (newsItem: NewsItem) => {
    setNews((current) => [newsItem, ...(current || [])])
  }

  const handleBulkAddNews = (newsItems: NewsItem[]) => {
    setNews((current) => [...newsItems, ...(current || [])])
  }

  const performAutoRefresh = useCallback(async () => {
    if (isAutoRefreshing) return
    
    setIsAutoRefreshing(true)
    const toastId = toast.loading('Auto-refreshing RSS feeds...')
    
    try {
      const { fetchAndConvertFeeds, deduplicateNews, DEFAULT_RSS_FEEDS } = await import('@/lib/rssUtils')
      const enabledFeeds = (feeds || DEFAULT_RSS_FEEDS).filter((f: any) => f.enabled)
      
      if (enabledFeeds.length === 0) {
        toast.dismiss(toastId)
        return
      }

      const newsItems = await fetchAndConvertFeeds(enabledFeeds, 30)
      const uniqueNews = deduplicateNews(news || [], newsItems)
      
      if (uniqueNews.length > 0) {
        handleBulkAddNews(uniqueNews)
        toast.success(`Auto-refresh: Added ${uniqueNews.length} new article${uniqueNews.length === 1 ? '' : 's'}`, { id: toastId })
      } else {
        toast.info('Auto-refresh: No new articles', { id: toastId })
      }
    } catch (error) {
      console.error('Auto-refresh failed:', error)
      toast.error('Auto-refresh failed', { id: toastId })
    } finally {
      setIsAutoRefreshing(false)
    }
  }, [feeds, news, handleBulkAddNews, isAutoRefreshing])

  const { 
    settings, 
    getTimeUntilNextRefresh, 
    toggleAutoRefresh 
  } = useAutoRefresh(performAutoRefresh)

  const allNews = useMemo(() => {
    if (!news) return []
    return [...news].sort((a, b) => b.timestamp - a.timestamp)
  }, [news])

  const marketNews = useMemo(() => {
    if (!news) return []
    return news
      .filter((item) => item.isMarketRelated)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [news])

  const priorityNews = useMemo(() => {
    if (!news) return []
    return news
      .filter((item) => item.priority >= 7)
      .sort((a, b) => b.priority - a.priority || b.timestamp - a.timestamp)
  }, [news])

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                News Intelligence
              </h1>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                AI-Powered Market Analysis
              </p>
            </div>
            <div className="flex items-center gap-2">
              {settings.enabled && (
                <Badge 
                  variant="outline" 
                  className="gap-2 px-3 py-1.5 bg-accent/10 border-accent/50 animate-pulse-slow hidden sm:flex"
                >
                  <Timer size={16} weight="bold" className="text-accent" />
                  <span className="text-xs font-mono text-accent-foreground">
                    Next: {getTimeUntilNextRefresh()}
                  </span>
                </Badge>
              )}
              <Button 
                onClick={() => setRssDialogOpen(true)}
                size="lg"
                variant="outline"
                className="gap-2"
              >
                <Rss size={20} weight="bold" />
                <span className="hidden sm:inline">RSS Feeds</span>
              </Button>
              <Button 
                onClick={() => setDialogOpen(true)}
                size="lg"
                className="gap-2 shadow-lg shadow-accent/20"
              >
                <Plus size={20} weight="bold" />
                <span className="hidden sm:inline">Add News</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 h-auto p-1">
            <TabsTrigger 
              value="priority" 
              className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3"
            >
              <Lightning size={20} weight="bold" />
              <span className="text-xs sm:text-sm font-semibold">Priority</span>
            </TabsTrigger>
            <TabsTrigger 
              value="market" 
              className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3"
            >
              <TrendUp size={20} weight="bold" />
              <span className="text-xs sm:text-sm font-semibold">Market</span>
            </TabsTrigger>
            <TabsTrigger 
              value="all" 
              className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-3"
            >
              <Newspaper size={20} weight="bold" />
              <span className="text-xs sm:text-sm font-semibold">All News</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="priority" className="mt-0">
            <ScrollArea className="h-[calc(100vh-240px)]">
              {priorityNews.length === 0 ? (
                <EmptyState
                  icon={<Lightning size={64} weight="duotone" />}
                  title="No Priority News"
                  description="Priority news items (score 7+) will appear here. Click 'RSS Feeds' to fetch from trusted sources or 'Add News' manually."
                />
              ) : (
                <div className="space-y-4 pb-4">
                  {priorityNews.map((item) => (
                    <NewsCard key={item.id} news={item} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="market" className="mt-0">
            <ScrollArea className="h-[calc(100vh-240px)]">
              {marketNews.length === 0 ? (
                <EmptyState
                  icon={<TrendUp size={64} weight="duotone" />}
                  title="No Market News"
                  description="Market-related news including stocks, economy, and geopolitics will appear here. Try fetching from RSS feeds."
                />
              ) : (
                <div className="space-y-4 pb-4">
                  {marketNews.map((item) => (
                    <NewsCard key={item.id} news={item} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="all" className="mt-0">
            <ScrollArea className="h-[calc(100vh-240px)]">
              {allNews.length === 0 ? (
                <EmptyState
                  icon={<Newspaper size={64} weight="duotone" />}
                  title="No News Yet"
                  description="Click 'RSS Feeds' to automatically fetch from trusted sources, or 'Add News' to enter articles manually."
                />
              ) : (
                <div className="space-y-4 pb-4">
                  {allNews.map((item) => (
                    <NewsCard key={item.id} news={item} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      <AddNewsDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAddNews={handleAddNews}
      />

      <RSSFeedDialog
        open={rssDialogOpen}
        onOpenChange={setRssDialogOpen}
        onNewsAdded={handleBulkAddNews}
        existingNews={news || []}
      />

      <Toaster position="top-right" />
    </div>
  )
}

export default App