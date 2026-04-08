import { NewsAnalysis, NewsCategory } from './types'

export async function analyzeNewsContent(content: string): Promise<NewsAnalysis> {
  const prompt = spark.llmPrompt`You are a financial news analyst. Analyze the following news content and extract structured information.

News Content:
${content}

Analyze this content and return a JSON object with the following structure:
{
  "title": "Clear, concise headline (max 100 chars)",
  "summary": "Brief 2-3 sentence summary focusing on key facts and implications",
  "priority": <number 1-10, where 10 is most critical/urgent>,
  "categories": [<array of relevant categories from: "breaking", "market", "geopolitical", "economy", "politics", "technology", "general">],
  "isMarketRelated": <boolean - true if this news could impact financial markets, stocks, economy, or involves geopolitical/political events that affect markets>
}

Priority Scoring Guidelines:
- 9-10: Major market-moving events, significant geopolitical crises, emergency economic announcements
- 7-8: Important market news, notable political developments, significant corporate announcements
- 5-6: Moderate market relevance, regional political news, routine economic data
- 3-4: Minor updates, tangential market news, general interest
- 1-2: Routine news with minimal market impact

Return ONLY the JSON object, no additional text.`

  try {
    const response = await spark.llm(prompt, 'gpt-4o', true)
    const analysis = JSON.parse(response) as NewsAnalysis
    
    analysis.priority = Math.max(1, Math.min(10, analysis.priority || 5))
    
    return analysis
  } catch (error) {
    console.error('AI analysis failed:', error)
    
    const fallbackTitle = content.substring(0, 100).trim()
    return {
      title: fallbackTitle || 'Untitled News',
      summary: content.substring(0, 300).trim() || 'No summary available',
      priority: 5,
      categories: ['general'],
      isMarketRelated: false
    }
  }
}

export function getPriorityLevel(priority: number): 'critical' | 'high' | 'medium' | 'low' {
  if (priority >= 8) return 'critical'
  if (priority >= 6) return 'high'
  if (priority >= 4) return 'medium'
  return 'low'
}

export function getPriorityColor(priority: number): string {
  const level = getPriorityLevel(priority)
  switch (level) {
    case 'critical':
      return 'border-[var(--priority-critical)] bg-[var(--priority-critical)]/10'
    case 'high':
      return 'border-[var(--priority-high)] bg-[var(--priority-high)]/10'
    case 'medium':
      return 'border-[var(--priority-medium)] bg-[var(--priority-medium)]/10'
    case 'low':
      return 'border-[var(--priority-low)] bg-[var(--priority-low)]/10'
  }
}

export function getPriorityBadgeColor(priority: number): string {
  const level = getPriorityLevel(priority)
  switch (level) {
    case 'critical':
      return 'bg-[var(--priority-critical)] text-white'
    case 'high':
      return 'bg-[var(--priority-high)] text-white'
    case 'medium':
      return 'bg-[var(--priority-medium)] text-black'
    case 'low':
      return 'bg-[var(--priority-low)] text-white'
  }
}

export function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return new Date(timestamp).toLocaleDateString()
}

export function getCategoryLabel(category: NewsCategory): string {
  const labels: Record<NewsCategory, string> = {
    breaking: 'Breaking',
    market: 'Market',
    geopolitical: 'Geopolitical',
    economy: 'Economy',
    politics: 'Politics',
    technology: 'Technology',
    general: 'General'
  }
  return labels[category]
}
