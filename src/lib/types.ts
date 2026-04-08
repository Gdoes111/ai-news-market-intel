export interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  url?: string
  timestamp: number
  priority: number
  categories: NewsCategory[]
  isMarketRelated: boolean
}

export type NewsCategory = 
  | 'breaking'
  | 'market'
  | 'geopolitical'
  | 'economy'
  | 'politics'
  | 'technology'
  | 'general'

export type NewsPriority = 'critical' | 'high' | 'medium' | 'low'

export interface NewsAnalysis {
  title: string
  summary: string
  priority: number
  categories: NewsCategory[]
  isMarketRelated: boolean
}
