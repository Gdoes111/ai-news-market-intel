import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Link as LinkIcon, TextT, Plus } from '@phosphor-icons/react'
import { analyzeNewsContent } from '@/lib/newsUtils'
import { NewsItem } from '@/lib/types'
import { toast } from 'sonner'

interface AddNewsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddNews: (news: NewsItem) => void
}

export function AddNewsDialog({ open, onOpenChange, onAddNews }: AddNewsDialogProps) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleAddFromUrl = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL')
      return
    }

    setIsLoading(true)
    try {
      const urlSource = source.trim() || new URL(url).hostname

      const content = `URL: ${url}\n\nNote: This is a URL submission. Please analyze the URL and provide a relevant news summary based on the domain and any context available.`
      
      const analysis = await analyzeNewsContent(content)
      
      const newsItem: NewsItem = {
        id: `news-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: analysis.title,
        summary: analysis.summary,
        source: urlSource,
        url: url,
        timestamp: Date.now(),
        priority: analysis.priority,
        categories: analysis.categories,
        isMarketRelated: analysis.isMarketRelated
      }

      onAddNews(newsItem)
      toast.success('News added successfully!')
      
      setUrl('')
      setSource('')
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to add news from URL:', error)
      toast.error('Failed to analyze URL. Please try manual text entry.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddFromText = async () => {
    if (!text.trim()) {
      toast.error('Please enter news content')
      return
    }

    if (!source.trim()) {
      toast.error('Please enter a source name')
      return
    }

    setIsLoading(true)
    try {
      const analysis = await analyzeNewsContent(text)
      
      const newsItem: NewsItem = {
        id: `news-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: analysis.title,
        summary: analysis.summary,
        source: source.trim(),
        timestamp: Date.now(),
        priority: analysis.priority,
        categories: analysis.categories,
        isMarketRelated: analysis.isMarketRelated
      }

      onAddNews(newsItem)
      toast.success('News added successfully!')
      
      setText('')
      setSource('')
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to add news from text:', error)
      toast.error('Failed to analyze content. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Add News</DialogTitle>
          <DialogDescription>
            Add news by entering a URL or pasting the content directly. AI will analyze and categorize it.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="url" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url" className="flex items-center gap-2">
              <LinkIcon size={16} weight="bold" />
              URL
            </TabsTrigger>
            <TabsTrigger value="text" className="flex items-center gap-2">
              <TextT size={16} weight="bold" />
              Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="url">News URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/news-article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url-source">Source Name (Optional)</Label>
              <Input
                id="url-source"
                type="text"
                placeholder="e.g., Reuters, Bloomberg"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to auto-detect from URL
              </p>
            </div>
            <Button 
              onClick={handleAddFromUrl} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>Processing...</>
              ) : (
                <>
                  <Plus size={16} weight="bold" className="mr-2" />
                  Add News
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="text" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="source">Source Name</Label>
              <Input
                id="source"
                type="text"
                placeholder="e.g., Reuters, Bloomberg, CNN"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="text">News Content</Label>
              <Textarea
                id="text"
                placeholder="Paste news article content here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isLoading}
                rows={8}
                className="resize-none"
              />
            </div>
            <Button 
              onClick={handleAddFromText} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>Processing...</>
              ) : (
                <>
                  <Plus size={16} weight="bold" className="mr-2" />
                  Add News
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
