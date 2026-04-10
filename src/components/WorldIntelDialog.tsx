import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Globe, ArrowsClockwise, Clock, Rocket, DownloadSimple } from '@phosphor-icons/react'
import { NewsItem } from '@/lib/types'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { toast } from 'sonner'
import { marked } from 'marked'

interface WorldIntelResult {
  report: string
  timestamp: number
  newsCount: number
  themes?: string[]
  breakthroughs?: string[]
  companies?: string[]
  watchList?: string[]
  topStories?: { title: string; confidence: string; summary: string }[]
  newVerifiedFacts?: string[]
}

interface WorldIntelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsItems: NewsItem[]
}

export function WorldIntelDialog({ open, onOpenChange, newsItems }: WorldIntelDialogProps) {
  const [pastAnalyses, setPastAnalyses] = useLocalStorage<WorldIntelResult[]>('worldintel-memory', [])
  const [verifiedFacts, setVerifiedFacts] = useLocalStorage<string[]>('worldintel-verified-facts', [])
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [currentView, setCurrentView] = useState<'latest' | 'history'>('latest')
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const latestAnalysis = pastAnalyses.length > 0 ? pastAnalyses[pastAnalyses.length - 1] : null

  const downloadReport = (analysis: WorldIntelResult) => {
    const date = new Date(analysis.timestamp).toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
    const header = `# World Intelligence Report\n_Generated: ${new Date(analysis.timestamp).toLocaleString()} · ${analysis.newsCount} articles_\n\n---\n\n`
    const blob = new Blob([header + analysis.report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `world-intel-${date}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const runAnalysis = async () => {
    if (newsItems.length === 0) {
      toast.error('No news to analyse. Fetch some RSS feeds first.')
      return
    }

    setIsAnalysing(true)
    const toastId = toast.loading('World Intel is researching... 30-60 seconds')

    try {
      const response = await fetch('/api/worldintel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItems,
          pastAnalyses: pastAnalyses.slice(-3),
          verifiedFacts: verifiedFacts.slice(-40),
          carryForwardStories: pastAnalyses.slice(-3).flatMap(a => a.topStories || []).slice(0, 15)
        })
      })

      if (!response.ok) throw new Error('World Intel API error')
      const result: WorldIntelResult = await response.json()
      setPastAnalyses(prev => [...prev, result])

      if (result.newVerifiedFacts && result.newVerifiedFacts.length > 0) {
        setVerifiedFacts(prev => {
          const combined = [...prev, ...result.newVerifiedFacts!]
          return [...new Set(combined)].slice(-100)
        })
      }

      setCurrentView('latest')
      toast.success('World Intel complete!', { id: toastId })
    } catch (error) {
      console.error('Analysis failed:', error)
      toast.error('Analysis failed. Check your connection.', { id: toastId })
    } finally {
      setIsAnalysing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Globe size={28} weight="duotone" className="text-blue-400" />
            World Intelligence
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex gap-2">
            <Button variant={currentView === 'latest' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentView('latest')}>
              Latest Report
            </Button>
            <Button variant={currentView === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentView('history')}>
              History ({pastAnalyses.length})
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {latestAnalysis && (
              <Button variant="outline" size="sm" onClick={() => downloadReport(latestAnalysis)} className="gap-1.5">
                <DownloadSimple size={14} />
                .md
              </Button>
            )}
            <Button
              onClick={runAnalysis}
              disabled={isAnalysing || newsItems.length === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
            >
              <ArrowsClockwise size={18} weight="bold" className={isAnalysing ? 'animate-spin' : ''} />
              {isAnalysing ? 'Researching World...' : 'World Intel'}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 mt-4 min-h-0 overflow-hidden">
          {currentView === 'latest' && (
            <>
              {!latestAnalysis ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                  <Globe size={64} weight="duotone" className="text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold">No Report Yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">Fetch news first, then click "World Intel" for a full briefing on AI, tech, science, geopolitics and more.</p>
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
                    <div className="text-xs text-muted-foreground font-mono">{latestAnalysis.newsCount} articles</div>
                    {latestAnalysis.breakthroughs && latestAnalysis.breakthroughs.length > 0 && (
                      <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/50">
                        <Rocket size={12} className="mr-1" />
                        {latestAnalysis.breakthroughs.length} breakthrough{latestAnalysis.breakthroughs.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>

                  {/* Themes */}
                  {latestAnalysis.themes && latestAnalysis.themes.length > 0 && (
                    <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                      <div className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wider">Key Themes</div>
                      <div className="flex flex-wrap gap-2">
                        {latestAnalysis.themes.map((theme, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-300">{theme}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Watch list */}
                  {latestAnalysis.watchList && latestAnalysis.watchList.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">🔮 Watch List</div>
                      <ul className="space-y-1">
                        {latestAnalysis.watchList.map((item, i) => (
                          <li key={i} className="text-sm text-foreground flex gap-2">
                            <span className="text-blue-400 font-mono text-xs mt-0.5">→</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Companies */}
                  {latestAnalysis.companies && latestAnalysis.companies.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Companies in Focus</div>
                      <div className="flex flex-wrap gap-2">
                        {latestAnalysis.companies.map((co, i) => (
                          <Badge key={i} variant="outline" className="font-mono text-xs">{co}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full report */}
                  <div className="border border-border rounded-lg p-4 bg-slate-900 w-full overflow-hidden">
                    <div
                      className="prose prose-invert prose-sm max-w-none w-full break-words [&_h2]:text-blue-400 [&_h3]:text-foreground [&_strong]:text-accent-foreground"
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
                <p className="text-center text-muted-foreground py-8">No past reports yet.</p>
              ) : (
                [...pastAnalyses].reverse().map((analysis, i) => (
                  <div key={i} className="bg-card rounded-lg border border-border hover:border-blue-500/30 transition-colors overflow-hidden">
                    <div className="p-4 cursor-pointer" onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-muted-foreground" />
                          <span className="text-sm font-mono text-muted-foreground">{new Date(analysis.timestamp).toLocaleString()}</span>
                        </div>
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                          {analysis.newsCount} articles
                        </Badge>
                      </div>
                      {analysis.themes && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {analysis.themes.slice(0, 4).map((t, j) => (
                            <Badge key={j} variant="outline" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {expandedIndex === i && (
                      <div className="px-4 pb-4 border-t border-border">
                        <div
                          className="prose prose-invert prose-sm max-w-none mt-3 break-words"
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
