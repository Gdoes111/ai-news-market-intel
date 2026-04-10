import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { ArrowsClockwise, Rss, CheckCircle, Timer } from '@phosphor-icons/react'
import { RSSFeed, DEFAULT_RSS_FEEDS, fetchAndConvertFeeds, deduplicateNews } from '@/lib/rssUtils'
import { NewsItem } from '@/lib/types'
import { toast } from 'sonner'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { AutoRefreshSettings } from '@/hooks/use-auto-refresh'

interface RSSFeedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNewsAdded: (news: NewsItem[]) => void
  existingNews: NewsItem[]
}

export function RSSFeedDialog({ open, onOpenChange, onNewsAdded, existingNews }: RSSFeedDialogProps) {
  const [feeds, setFeeds] = useLocalStorage<RSSFeed[]>('rss-feeds', DEFAULT_RSS_FEEDS)
  const [isLoading, setIsLoading] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useLocalStorage<number>('last-fetch-time', 0)
  const [autoRefreshSettings, setAutoRefreshSettings] = useLocalStorage<AutoRefreshSettings>('auto-refresh-settings', {
    enabled: false,
    intervalMinutes: 20
  })

  const toggleFeed = (feedId: string) => {
    setFeeds((current) => 
      (current || DEFAULT_RSS_FEEDS).map(feed =>
        feed.id === feedId ? { ...feed, enabled: !feed.enabled } : feed
      )
    )
  }

  const handleFetchFeeds = async () => {
    setIsLoading(true)
    const toastId = toast.loading('Fetching news from RSS feeds...')
    
    try {
      const enabledFeeds = (feeds || DEFAULT_RSS_FEEDS).filter(f => f.enabled)
      
      if (enabledFeeds.length === 0) {
        toast.error('Please enable at least one feed', { id: toastId })
        return
      }

      const newsItems = await fetchAndConvertFeeds(enabledFeeds, 500)
      
      const uniqueNews = deduplicateNews(existingNews, newsItems)
      
      if (uniqueNews.length === 0) {
        toast.info('No new articles found', { id: toastId })
      } else {
        onNewsAdded(uniqueNews)
        setLastFetchTime(Date.now())
        toast.success(`Added ${uniqueNews.length} new article${uniqueNews.length === 1 ? '' : 's'}`, { id: toastId })
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Failed to fetch RSS feeds:', error)
      toast.error('Failed to fetch feeds. Please try again.', { id: toastId })
    } finally {
      setIsLoading(false)
    }
  }

  const getTimeSinceLastFetch = (): string => {
    if (!lastFetchTime) return 'Never'
    
    const now = Date.now()
    const diff = now - lastFetchTime
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return new Date(lastFetchTime).toLocaleDateString()
  }

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'market':
        return 'bg-accent/20 text-accent-foreground border-accent/50'
      case 'geopolitical':
        return 'bg-[var(--priority-high)]/20 text-foreground border-[var(--priority-high)]/50'
      case 'technology':
        return 'bg-[var(--priority-low)]/20 text-foreground border-[var(--priority-low)]/50'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const currentFeeds = feeds || DEFAULT_RSS_FEEDS
  const enabledCount = currentFeeds.filter(f => f.enabled).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Rss size={24} weight="bold" />
            RSS Feed Sources
          </DialogTitle>
          <DialogDescription>
            Manage and fetch news from trusted RSS feeds automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer size={20} weight="bold" className="text-accent" />
                <Label htmlFor="auto-refresh" className="text-sm font-semibold">
                  Auto-Refresh
                </Label>
              </div>
              <Switch
                id="auto-refresh"
                checked={autoRefreshSettings?.enabled || false}
                onCheckedChange={(enabled) => {
                  setAutoRefreshSettings((current) => ({
                    ...(current || { enabled: false, intervalMinutes: 20 }),
                    enabled
                  }))
                  if (enabled) {
                    toast.success(`Auto-refresh enabled: Every ${autoRefreshSettings?.intervalMinutes || 20} minutes`)
                  } else {
                    toast.info('Auto-refresh disabled')
                  }
                }}
                disabled={isLoading}
              />
            </div>
            
            {autoRefreshSettings?.enabled && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Refresh Interval: {autoRefreshSettings.intervalMinutes} minutes
                  </Label>
                </div>
                <Slider
                  value={[autoRefreshSettings.intervalMinutes]}
                  onValueChange={([value]) => {
                    setAutoRefreshSettings((current) => ({
                      ...(current || { enabled: false, intervalMinutes: 20 }),
                      intervalMinutes: value
                    }))
                  }}
                  min={5}
                  max={30}
                  step={5}
                  disabled={isLoading}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>5 min</span>
                  <span>30 min</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">
                {enabledCount} of {currentFeeds.length} feeds enabled
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Last fetch: {getTimeSinceLastFetch()}
              </div>
            </div>
            <Button
              onClick={handleFetchFeeds}
              disabled={isLoading || enabledCount === 0}
              size="lg"
              className="gap-2"
            >
              <ArrowsClockwise 
                size={18} 
                weight="bold" 
                className={isLoading ? 'animate-spin' : ''}
              />
              {isLoading ? 'Fetching...' : 'Fetch News'}
            </Button>
          </div>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {currentFeeds.map((feed) => (
                <div
                  key={feed.id}
                  className="flex items-start justify-between p-4 bg-card rounded-lg border border-border hover:border-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        {feed.name}
                      </h4>
                      {feed.enabled && (
                        <CheckCircle size={16} weight="fill" className="text-accent" />
                      )}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-xs font-medium ${getCategoryColor(feed.category)}`}
                    >
                      {feed.category}
                    </Badge>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {feed.url}
                    </p>
                  </div>
                  <Switch
                    checked={feed.enabled}
                    onCheckedChange={() => toggleFeed(feed.id)}
                    disabled={isLoading}
                    className="ml-4"
                  />
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Toggle feeds on/off to customize your news sources. Click "Fetch News" to pull the latest articles from enabled feeds.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
