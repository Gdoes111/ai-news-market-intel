import { NewsItem } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Tag, Link as LinkIcon } from '@phosphor-icons/react'
import { 
  getPriorityColor, 
  getPriorityBadgeColor, 
  getPriorityLevel,
  formatTimestamp,
  getCategoryLabel 
} from '@/lib/newsUtils'
import { cn } from '@/lib/utils'

interface NewsCardProps {
  news: NewsItem
  onDelete?: (id: string) => void
}

export function NewsCard({ news, onDelete }: NewsCardProps) {
  const priorityLevel = getPriorityLevel(news.priority)
  const shouldPulse = priorityLevel === 'critical' || priorityLevel === 'high'

  return (
    <Card 
      className={cn(
        'border-l-4 transition-all duration-200 hover:shadow-lg hover:shadow-accent/10',
        getPriorityColor(news.priority),
        shouldPulse && 'animate-pulse-slow'
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-2 leading-tight">
              {news.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono mb-3">
              <span className="flex items-center gap-1">
                <Clock size={14} weight="bold" />
                {formatTimestamp(news.timestamp)}
              </span>
              <span className="text-border">•</span>
              <span className="uppercase tracking-wide">{news.source}</span>
              {news.url && (
                <>
                  <span className="text-border">•</span>
                  <a 
                    href={news.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors"
                  >
                    <LinkIcon size={14} weight="bold" />
                    <span>Source</span>
                  </a>
                </>
              )}
            </div>
          </div>
          <Badge 
            className={cn(
              'shrink-0 font-mono text-xs font-bold',
              getPriorityBadgeColor(news.priority)
            )}
          >
            {news.priority}/10
          </Badge>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed mb-4">
          {news.summary}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Tag size={14} weight="bold" className="text-muted-foreground" />
          {news.categories.map((category) => (
            <Badge 
              key={category}
              variant="outline"
              className="text-xs font-medium"
            >
              {getCategoryLabel(category)}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  )
}
