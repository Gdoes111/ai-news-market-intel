import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChartLine, ArrowsClockwise, Clock, Trophy, Info } from '@phosphor-icons/react'
import { NewsItem } from '@/lib/types'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { toast } from 'sonner'
import { marked } from 'marked'

interface PolymarketPick {
  market: string
  recommendation: 'YES' | 'NO'
  currentOdds: string
  targetOdds: string
  confidence: 'high' | 'medium' | 'speculative'
  size: 'small' | 'medium' | 'large'
  reasoning?: string
}

interface PolymarketResult {
  report: string
  timestamp: number
  newsCount: number
  marketsCount: number
  topPicks?: PolymarketPick[]
  highConfidencePicks?: number
  accuracyNotes?: string
}

interface PolymarketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsItems: NewsItem[]
}

export function PolymarketDialog({ open, onOpenChange, newsItems }: PolymarketDialogProps) {
  const [pastAnalyses, setPastAnalyses] = useLocalStorage<PolymarketResult[]>('polymarket-memory', [])
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [currentView, setCurrentView] = useState<'latest' | 'history'>('latest')

  const latestAnalysis = pastAnalyses.length > 0 ? pastAnalyses[pastAnalyses.length - 1] : null

  const runAnalysis = async () => {
    if (newsItems.length === 0) {
      toast.error('No news to analyse. Fetch some RSS feeds first.')
      return
    }

    setIsAnalysing(true)
    const toastId = toast.loading('Fetching live Polymarket odds + cross-referencing news...')

    try {
      const response = await fetch('/api/polymarket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItems,
          pastAnalyses: pastAnalyses.slice(-3)
        })
      })

      if (!response.ok) throw new Error('Polymarket API error')

      const result: PolymarketResult = await response.json()
      setPastAnalyses(prev => [...prev, result])
      setCurrentView('latest')
      toast.success('Polymarket analysis complete!', { id: toastId })
    } catch (error) {
      console.error('Analysis failed:', error)
      toast.error('Analysis failed. Check your connection.', { id: toastId })
    } finally {
      setIsAnalysing(false)
    }
  }

  const getConfidenceColor = (confidence?: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
      default: return 'bg-red-500/20 text-red-400 border-red-500/50'
    }
  }

  const getSizeColor = (size?: string) => {
    switch (size) {
      case 'large': return 'bg-accent/20 text-accent border-accent/50'
      case 'medium': return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <ChartLine size={28} weight="duotone" className="text-green-400" />
            Polymarket Intelligence
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex gap-2">
            <Button
              variant={currentView === 'latest' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('latest')}
            >
              Latest Picks
            </Button>
            <Button
              variant={currentView === 'history' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('history')}
            >
              History ({pastAnalyses.length})
            </Button>
          </div>
          <Button
            onClick={runAnalysis}
            disabled={isAnalysing || newsItems.length === 0}
            className="gap-2 bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20"
          >
            <ArrowsClockwise size={18} weight="bold" className={isAnalysing ? 'animate-spin' : ''} />
            {isAnalysing ? 'Scanning Markets...' : 'Find Trades'}
          </Button>
        </div>

        <ScrollArea className="flex-1 mt-4 min-h-0 overflow-hidden">
          {currentView === 'latest' && (
            <>
              {!latestAnalysis ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                  <ChartLine size={64} weight="duotone" className="text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">No Analysis Yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Fetch news first, then click "Find Trades" to scan live Polymarket odds for mispricings.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  {/* Meta bar */}
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <Clock size={14} />
                      {new Date(latestAnalysis.timestamp).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">·</div>
                    <div className="text-xs text-muted-foreground font-mono">{latestAnalysis.marketsCount || 0} markets scanned</div>
                    <div className="text-xs text-muted-foreground">·</div>
                    <div className="text-xs text-muted-foreground font-mono">{latestAnalysis.newsCount} news articles</div>
                    {latestAnalysis.highConfidencePicks !== undefined && latestAnalysis.highConfidencePicks > 0 && (
                      <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/50">
                        <Trophy size={12} className="mr-1" />
                        {latestAnalysis.highConfidencePicks} high-confidence picks
                      </Badge>
                    )}
                  </div>

                  {/* Top picks cards */}
                  {latestAnalysis.topPicks && latestAnalysis.topPicks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Top Trade Picks</div>
                      <TooltipProvider delayDuration={200}>
                        {latestAnalysis.topPicks.map((pick, i) => (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <div className="p-3 bg-card rounded-lg border border-border hover:border-green-500/30 transition-colors cursor-default">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <p className="text-sm font-medium text-foreground flex-1">{pick.market}</p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {pick.reasoning && (
                                      <Info size={14} className="text-muted-foreground" />
                                    )}
                                    <Badge className={`text-xs font-bold ${pick.recommendation === 'YES' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                                      {pick.recommendation}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="text-xs text-muted-foreground font-mono">Current: {pick.currentOdds}</span>
                                  <span className="text-xs text-accent font-mono">→ Target: {pick.targetOdds}</span>
                                  <Badge variant="outline" className={`text-xs ${getConfidenceColor(pick.confidence)}`}>
                                    {pick.confidence}
                                  </Badge>
                                  <Badge variant="outline" className={`text-xs ${getSizeColor(pick.size)}`}>
                                    {pick.size} size
                                  </Badge>
                                </div>
                              </div>
                            </TooltipTrigger>
                            {pick.reasoning && (
                              <TooltipContent side="bottom" className="max-w-sm text-xs leading-relaxed p-3 bg-popover border border-border text-popover-foreground shadow-xl">
                                <p className="font-semibold text-green-400 mb-1">Why this trade?</p>
                                <p>{pick.reasoning}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                      </TooltipProvider>
                    </div>
                  )}

                  {/* Full report */}
                  <div className="border border-border rounded-lg p-4 bg-slate-900 w-full overflow-hidden">
                    <div
                      className="prose prose-invert prose-sm max-w-none w-full break-words [&_h2]:text-green-400 [&_h3]:text-foreground [&_strong]:text-accent-foreground [&_ul]:space-y-1"
                      dangerouslySetInnerHTML={{ __html: marked(latestAnalysis.report) as string }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {currentView === 'history' && (
            <div className="space-y-3 pb-4">
              {pastAnalyses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No past analyses yet.</p>
              ) : (
                [...pastAnalyses].reverse().map((analysis, i) => (
                  <div key={i} className="p-4 bg-card rounded-lg border border-border hover:border-green-500/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-muted-foreground" />
                        <span className="text-sm font-mono text-muted-foreground">
                          {new Date(analysis.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                        {analysis.topPicks?.length || 0} picks
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {analysis.marketsCount || 0} markets · {analysis.newsCount} articles · {analysis.highConfidencePicks || 0} high-confidence
                    </div>
                    {analysis.topPicks && analysis.topPicks.slice(0, 2).map((pick, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs mb-1">
                        <Badge className={`text-xs ${pick.recommendation === 'YES' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
                          {pick.recommendation}
                        </Badge>
                        <span className="text-foreground/80 truncate">{pick.market}</span>
                        <span className="text-muted-foreground shrink-0">{pick.currentOdds}</span>
                      </div>
                    ))}
                    {analysis.accuracyNotes && (
                      <p className="text-xs text-yellow-400 mt-2">📊 {analysis.accuracyNotes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
