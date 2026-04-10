import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatCircle, X, PaperPlaneTilt, SpinnerGap, Brain } from '@phosphor-icons/react'
import { NewsItem } from '@/lib/types'
import { marked } from 'marked'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatAssistantProps {
  newsItems: NewsItem[]
  analystReports: any[]
  polymarketAnalyses: any[]
  verifiedFacts: string[]
}

export function ChatAssistant({ newsItems, analystReports, polymarketAnalyses, verifiedFacts }: ChatAssistantProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [open, messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10),
          context: {
            newsItems,
            analystReports,
            polymarketAnalyses,
            verifiedFacts
          }
        })
      })

      if (!res.ok) throw new Error('Chat failed')
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200',
          'bg-accent hover:bg-accent/90 text-accent-foreground',
          open && 'rotate-90 opacity-0 pointer-events-none'
        )}
      >
        <ChatCircle size={26} weight="duotone" />
      </button>

      {/* Chat panel */}
      <div className={cn(
        'fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border border-border bg-card flex flex-col transition-all duration-300 origin-bottom-right',
        open ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
      )}
        style={{ height: '520px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border rounded-t-2xl bg-muted/40">
          <div className="flex items-center gap-2">
            <Brain size={18} weight="duotone" className="text-accent" />
            <span className="text-sm font-semibold text-foreground">Research Assistant</span>
            <span className="text-xs text-muted-foreground font-mono">
              {newsItems.length} articles · {analystReports.length} reports
            </span>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-8">
              <Brain size={40} weight="duotone" className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Ask me anything</p>
                <p className="text-xs text-muted-foreground mt-1">I know everything in your reports, news feed, and verified facts</p>
              </div>
              <div className="flex flex-col gap-1.5 w-full mt-2">
                {[
                  'What are the highest priority stories right now?',
                  'What Polymarket trades look best?',
                  'Which stocks are flagged across recent reports?',
                  'Summarise the oil situation'
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus() }}
                    className="text-xs text-left px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {messages.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    m.role === 'user'
                      ? 'bg-accent text-accent-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  )}>
                    {m.role === 'assistant' ? (
                      <div
                        className="prose prose-invert prose-sm max-w-none [&_p]:mb-1 [&_ul]:mb-1 [&_li]:mb-0.5"
                        dangerouslySetInnerHTML={{ __html: marked(m.content) as string }}
                      />
                    ) : (
                      <p>{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                    <SpinnerGap size={16} className="animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-border">
          <div className="flex gap-2 items-end bg-muted/50 rounded-xl border border-border/50 px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about news, stocks, Polymarket..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none max-h-24 leading-relaxed"
              style={{ minHeight: '24px' }}
            />
            <Button
              size="sm"
              onClick={send}
              disabled={!input.trim() || loading}
              className="shrink-0 h-7 w-7 p-0 rounded-lg bg-accent hover:bg-accent/90"
            >
              <PaperPlaneTilt size={14} weight="bold" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  )
}
