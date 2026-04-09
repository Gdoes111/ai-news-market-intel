import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Brain, ArrowsClockwise, Clock, TrendUp, Warning } from '@phosphor-icons/react'
import { NewsItem } from '@/lib/types'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { toast } from 'sonner'
import { marked } from 'marked'

interface AnalystResult {
  report: string
  timestamp: number
  newsCount: number
  keyFindings?: string[]
  stocks?: string[]
  sectors?: string[]
  sentiment?: string
  riskLevel?: string
}

interface AnalystDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsItems: NewsItem[]
}

export function AnalystDialog({ open, onOpenChange, newsItems }: AnalystDialogProps) {
  const [pastAnalyses, setPastAnalyses] = useLocalStorage<AnalystResult[]>('analyst-memory', [])
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [currentView, setCurrentView] = useState<'latest' | 'history'>('latest')
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const latestAnalysis = pastAnalyses.length > 0 ? pastAnalyses[pastAnalyses.length - 1] : null

  const runAnalysis = async () => {
    if (newsItems.length === 0) {
      toast.error('No news to analyse. Fetch some RSS feeds first.')
      return
    }

    setIsAnalysing(true)
    const toastId = toast.loading('AI Analyst is researching... this may take 30-60 seconds')

    try {
      const response = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItems,
          pastAnalyses: pastAnalyses.slice(-5)
        })
      })

      if (!response.ok) throw new Error('Analyst API error')

      const result: AnalystResult = await response.json()
      setPastAnalyses(prev => [...prev, result])
      setCurrentView('latest')
      toast.success('Analysis complete!', { id: toastId })
    } catch (error) {
      console.error('Analysis failed:', error)
      toast.error('Analysis failed. Check your connection.', { id: toastId })
    } finally {
      setIsAnalysing(false)
    }
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'bullish': return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'bearish': return 'bg-red-500/20 text-red-400 border-red-500/50'
      case 'neutral': return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
    }
  }

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/50'
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Brain size={28} weight="duotone" className="text-accent" />
            AI Market Analyst
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex gap-2">
            <Button
              variant={currentView === 'latest' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('latest')}
            >
              Latest Report
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
            className="gap-2 shadow-lg shadow-accent/20"
          >
            <ArrowsClockwise size={18} weight="bold" className={isAnalysing ? 'animate-spin' : ''} />
            {isAnalysing ? 'Analysing...' : `Analyse ${newsItems.length} Articles`}
          </Button>
        </div>

        <ScrollArea className="flex-1 mt-4 min-h-0 overflow-hidden">
          {currentView === 'latest' && (
            <>
              {!latestAnalysis ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                  <Brain size={64} weight="duotone" className="text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">No Analysis Yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Fetch some news first, then click "Analyse" to get your market intelligence report.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <Clock size={14} />
                      {new Date(latestAnalysis.timestamp).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">·</div>
                    <div className="text-xs text-muted-foreground font-mono">{latestAnalysis.newsCount} articles analysed</div>
                    {latestAnalysis.sentiment && (
                      <Badge variant="outline" className={`text-xs ${getSentimentColor(latestAnalysis.sentiment)}`}>
                        <TrendUp size={12} className="mr-1" />
                        {latestAnalysis.sentiment}
                      </Badge>
                    )}
                    {latestAnalysis.riskLevel && (
                      <Badge variant="outline" className={`text-xs ${getRiskColor(latestAnalysis.riskLevel)}`}>
                        <Warning size={12} className="mr-1" />
                        {latestAnalysis.riskLevel} risk
                      </Badge>
                    )}
                  </div>

                  {latestAnalysis.stocks && latestAnalysis.stocks.length > 0 && (
                    <div className="p-3 bg-accent/5 rounded-lg border border-accent/20">
                      <div className="text-xs font-semibold text-accent mb-2 uppercase tracking-wider">Stocks to Watch</div>
                      <div className="flex flex-wrap gap-2">
                        {latestAnalysis.stocks.map(ticker => (
                          <Badge key={ticker} variant="outline" className="font-mono text-xs bg-accent/10 border-accent/40 text-accent-foreground">
                            {ticker}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {latestAnalysis.keyFindings && latestAnalysis.keyFindings.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Key Findings</div>
                      <ul className="space-y-1">
                        {latestAnalysis.keyFindings.map((finding, i) => (
                          <li key={i} className="text-sm text-foreground flex gap-2">
                            <span className="text-accent font-mono text-xs mt-0.5">→</span>
                            {finding}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="border border-border rounded-lg p-4 bg-slate-900 w-full">
                    <div
                      className="prose prose-sm max-w-none w-full break-words"
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
                  <div key={i} className="bg-card rounded-lg border border-border hover:border-accent/50 transition-colors overflow-hidden">
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-muted-foreground" />
                          <span className="text-sm font-mono text-muted-foreground">
                            {new Date(analysis.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex gap-2 items-center">
                          {analysis.sentiment && (
                            <Badge variant="outline" className={`text-xs ${getSentimentColor(analysis.sentiment)}`}>
                              {analysis.sentiment}
                            </Badge>
                          )}
                          {analysis.riskLevel && (
                            <Badge variant="outline" className={`text-xs ${getRiskColor(analysis.riskLevel)}`}>
                              {analysis.riskLevel} risk
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{expandedIndex === i ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">{analysis.newsCount} articles · {analysis.stocks?.length || 0} stocks flagged</div>
                      {analysis.keyFindings && (
                        <ul className="space-y-0.5">
                          {analysis.keyFindings.slice(0, 2).map((f, j) => (
                            <li key={j} className="text-xs text-foreground/80 flex gap-1.5">
                              <span className="text-accent">→</span>{f}
                            </li>
                          ))}
                          {analysis.keyFindings.length > 2 && expandedIndex !== i && (
                            <li className="text-xs text-muted-foreground">+{analysis.keyFindings.length - 2} more... (tap to expand)</li>
                          )}
                        </ul>
                      )}
                    </div>
                    {expandedIndex === i && (
                      <div className="px-4 pb-4 border-t border-border pt-4">
                        {analysis.stocks && analysis.stocks.length > 0 && (
                          <div className="mb-3">
                            <div className="text-xs font-semibold text-accent mb-1 uppercase tracking-wider">Stocks</div>
                            <div className="flex flex-wrap gap-1">
                              {analysis.stocks.map(ticker => (
                                <Badge key={ticker} variant="outline" className="font-mono text-xs bg-accent/10 border-accent/40">
                                  {ticker}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div
                          className="prose prose-invert prose-sm max-w-none text-foreground [&_h2]:text-accent [&_h3]:text-foreground text-xs"
                          dangerouslySetInnerHTML={{ __html: marked(analysis.report) as string }}
                        />
                      </div>
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
