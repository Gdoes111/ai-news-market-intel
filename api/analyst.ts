import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Extend Vercel function timeout to 300s (requires Pro plan; on hobby it caps at 60s)
export const maxDuration = 300

// Fetch live market snapshot from Yahoo Finance with cookie/crumb auth
async function fetchMarketSnapshot(): Promise<string> {
  const symbols = ['SPY', 'QQQ', 'DIA', 'CL=F', 'BZ=F', '^TNX', 'GC=F', '^VIX', 'DX-Y.NYB']
  const labels: Record<string, string> = {
    'SPY': 'S&P 500 ETF', 'QQQ': 'Nasdaq 100 ETF', 'DIA': 'Dow Jones ETF',
    'CL=F': 'WTI Crude Oil', 'BZ=F': 'Brent Crude', '^TNX': '10Y Treasury Yield',
    'GC=F': 'Gold', '^VIX': 'VIX (Fear Index)', 'DX-Y.NYB': 'US Dollar Index'
  }
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'

  // Try method 1: cookie + crumb handshake
  try {
    const cookieResp = await fetch('https://finance.yahoo.com/', { headers: { 'User-Agent': ua } })
    const rawCookies = cookieResp.headers.getSetCookie?.() || []
    const cookieStr = rawCookies.map((c: string) => c.split(';')[0]).join('; ')

    const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': ua, 'Cookie': cookieStr }
    })
    const crumb = await crumbResp.text()
    if (!crumb || crumb.includes('<')) throw new Error('Bad crumb')

    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&crumb=${encodeURIComponent(crumb)}`
    const resp = await fetch(url, { headers: { 'User-Agent': ua, 'Cookie': cookieStr } })
    if (!resp.ok) throw new Error(`Yahoo v7+crumb: ${resp.status}`)
    const data = await resp.json()
    const quotes = data?.quoteResponse?.result || []
    if (quotes.length === 0) throw new Error('Empty quotes')
    return quotes.map((q: any) => {
      const chg = parseFloat(q.regularMarketChangePercent?.toFixed(2))
      const arrow = chg > 0 ? '▲' : '▼'
      return `${labels[q.symbol] || q.symbol}: $${q.regularMarketPrice?.toFixed(2)} (${arrow}${Math.abs(chg)}%)`
    }).join('\n')
  } catch {}

  // Try method 2: query1 v8 endpoint (sometimes bypasses auth)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${symbols.join(',')}`
    const resp = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'application/json' } })
    if (!resp.ok) throw new Error(`Yahoo v8: ${resp.status}`)
    const data = await resp.json()
    const quotes = data?.quoteResponse?.result || []
    if (quotes.length === 0) throw new Error('Empty quotes')
    return quotes.map((q: any) => {
      const chg = parseFloat(q.regularMarketChangePercent?.toFixed(2))
      const arrow = chg > 0 ? '▲' : '▼'
      return `${labels[q.symbol] || q.symbol}: $${q.regularMarketPrice?.toFixed(2)} (${arrow}${Math.abs(chg)}%)`
    }).join('\n')
  } catch {}

  // Try method 3: Fallback to individual Google Finance scrape via search RSS
  try {
    const fallbackSymbols = [['SPY', 'S&P 500'], ['CL=F', 'WTI Crude'], ['^VIX', 'VIX']]
    const lines: string[] = []
    for (const [sym, label] of fallbackSymbols) {
      const hits = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(sym + ' stock price today')}&hl=en-US&gl=US&ceid=US:en`, {
        headers: { 'User-Agent': ua }
      })
      if (hits.ok) {
        const xml = await hits.text()
        const titleMatch = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
        if (titleMatch) lines.push(`${label}: see news — "${titleMatch[1].substring(0, 80)}"`)
      }
    }
    if (lines.length > 0) return `[Yahoo Finance unavailable — partial data from news]\n${lines.join('\n')}`
  } catch {}

  return 'Live market data unavailable — all sources failed. Rely on prices mentioned in news articles.'
}

// Search Google News RSS for a topic — returns real headlines + sources
async function searchGoogleNews(query: string): Promise<{ title: string; source: string }[]> {
  try {
    const encoded = encodeURIComponent(query)
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml' }
    })
    if (!resp.ok) return []
    const xml = await resp.text()
    const results: { title: string; source: string }[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && results.length < 6) {
      const item = match[1]
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/)
      const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/)
      if (titleMatch) {
        // Google News titles often end with " - Source Name"
        const rawTitle = titleMatch[1]
        const sourceName = sourceMatch?.[1] || rawTitle.split(' - ').pop() || 'Unknown'
        const cleanTitle = rawTitle.includes(' - ') ? rawTitle.split(' - ').slice(0, -1).join(' - ') : rawTitle
        results.push({ title: cleanTitle.trim(), source: sourceName.trim() })
      }
    }
    return results
  } catch {
    return []
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { newsItems, pastAnalyses } = req.body

  const top50 = newsItems.slice(0, 50)

  // --- Step 1: Fetch live market data + cluster articles in parallel ---
  const [marketSnapshot, clusteringCompletion] = await Promise.all([
    fetchMarketSnapshot(),
    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a news editor. Group news articles that cover the same story or event into clusters. Return ONLY valid JSON.'
        },
        {
          role: 'user',
          content: `Group these ${top50.length} articles into topic clusters. Articles covering the same event (even from different sources) go in the same cluster. Also score each cluster 1-10 for market significance.

${top50.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "clusters": [
    {
      "topic": "Short topic label",
      "searchQuery": "3-5 word Google News search query to verify this story",
      "articleIndices": [0, 3, 7],
      "sourceCount": 3,
      "sources": ["Reuters", "CNBC", "Bloomberg"],
      "significance": 8
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    })
  ])

  let clusters: { topic: string; searchQuery: string; articleIndices: number[]; sourceCount: number; sources: string[]; significance: number }[] = []
  try {
    const parsed = JSON.parse(clusteringCompletion.choices[0].message.content || '{}')
    clusters = parsed.clusters || []
  } catch {}

  // --- Step 2: Identify magnitude-gate stories (globally significant regardless of cluster rank) ---
  // Ask mini to flag any story that would be a top-5 global macro event if true
  const magnitudeCompletion = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: 'You are a news editor. Return ONLY valid JSON.' },
      {
        role: 'user',
        content: `From this list of news headlines, identify any stories that — if confirmed — would be a top-5 global macro or geopolitical event (e.g. world leader death, major oil infrastructure attack, central bank emergency action, war escalation, major sanctions).

${top50.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "magnitudeStories": [
    { "index": 0, "topic": "Short label", "searchQuery": "3-5 word Google News search" }
  ]
}`
      }
    ],
    response_format: { type: 'json_object' }
  })

  let magnitudeStories: { index: number; topic: string; searchQuery: string }[] = []
  try {
    const parsed = JSON.parse(magnitudeCompletion.choices[0].message.content || '{}')
    magnitudeStories = parsed.magnitudeStories || []
  } catch {}

  // --- Step 3: Research the top 8 clusters + all magnitude-gate stories via Google News ---
  const topClusters = [...clusters]
    .sort((a, b) => (b.significance || 0) - (a.significance || 0))
    .slice(0, 8)

  // Merge cluster searches + magnitude searches (deduplicate by topic)
  const allSearches: { topic: string; searchQuery: string; isMagnitude: boolean }[] = [
    ...topClusters.map(c => ({ topic: c.topic, searchQuery: c.searchQuery || c.topic, isMagnitude: false })),
    ...magnitudeStories
      .filter(m => !topClusters.some(c => c.topic.toLowerCase().includes(m.topic.toLowerCase())))
      .map(m => ({ topic: m.topic, searchQuery: m.searchQuery, isMagnitude: true }))
  ]

  const researchResults = await Promise.all(
    allSearches.map(async (s) => {
      const hits = await searchGoogleNews(s.searchQuery)
      return { topic: s.topic, hits, isMagnitude: s.isMagnitude }
    })
  )

  // Build external verification summary
  const externalVerification = researchResults
    .filter(r => r.hits.length > 0)
    .map(r => {
      const sourceList = [...new Set(r.hits.map(h => h.source))].join(', ')
      const headlines = r.hits.slice(0, 3).map(h => `  • "${h.title}" — ${h.source}`).join('\n')
      const tag = r.isMagnitude ? ' ⚠️ MAGNITUDE-GATE STORY' : ''
      return `**${r.topic}**${tag} (${r.hits.length} results from: ${sourceList})\n${headlines}`
    })
    .join('\n\n')

  // Build cluster index map for the digest
  const articleClusterMap = new Map<number, { topic: string; sourceCount: number; sources: string[] }>()
  for (const cluster of clusters) {
    for (const idx of cluster.articleIndices) {
      articleClusterMap.set(idx, { topic: cluster.topic, sourceCount: cluster.sourceCount, sources: cluster.sources })
    }
  }

  const newsDigest = top50
    .map((item: any, i: number) => {
      const cluster = articleClusterMap.get(i)
      const clusterLine = cluster
        ? `\n   [STORY CLUSTER: "${cluster.topic}" — ${cluster.sourceCount} source(s) in digest: ${cluster.sources.join(', ')}]`
        : ''
      return `${i + 1}. [Priority ${item.priority}/10] [Source: ${item.source}] ${item.title}\n   Summary: ${item.summary}${clusterLine}`
    })
    .join('\n\n')

  const memoryContext = pastAnalyses && pastAnalyses.length > 0
    ? pastAnalyses
        .slice(-5)
        .map((a: any) => `[${new Date(a.timestamp).toLocaleDateString()}]\nKey findings: ${a.keyFindings?.join('; ')}\nStocks flagged: ${a.stocks?.join(', ')}\nSentiment: ${a.sentiment}`)
        .join('\n\n')
    : 'No previous analyses yet.'

  const systemPrompt = `You are an elite market intelligence analyst with the instincts of an investigative journalist and the precision of a hedge fund analyst. Your job is to follow the evidence wherever it leads — not to have a predetermined view, not to be contrarian for its own sake, and not to just summarise what everyone already knows.

Read the data carefully. If something correlates, say so. If something looks suspicious or inconsistent, flag it. If the evidence clearly points in a direction most people aren't looking, say that too. But only when the evidence actually supports it — not as a default posture. Let the facts drive the analysis, not the other way around.`

  const userPrompt = `## LIVE MARKET SNAPSHOT (fetched now)
${marketSnapshot}

## EXTERNAL VERIFICATION (live Google News searches, run just now)
The following topics were independently searched on Google News to verify coverage beyond this digest:

${externalVerification || 'External search unavailable — use digest sources only.'}

## CURRENT NEWS DIGEST (${newsItems.length} articles from multiple sources)
${newsDigest}

## PAST ANALYSIS MEMORY
${memoryContext}

## YOUR TASK
Produce a comprehensive market intelligence report grounded in the verified data above. Summarise what is happening, what it means for markets, and where the evidence points. If you notice something unusual, a correlation worth flagging, or a story that seems underreported relative to its significance — include it. But don't force it. Let the data speak.

## SOURCE VERIFICATION RULES
Rate confidence using this hierarchy:

**1. External verification (highest weight)**
- Google News search returned 4+ results from independent outlets → 🟢 HIGH CONFIDENCE
- Google News search returned 2-3 results → 🟡 MEDIUM CONFIDENCE
- Google News search returned 0-1 results OR topic wasn't searched → fall back to digest signals

**2. Digest cluster count (fallback)**
- 3+ sources in digest cluster → 🟢 HIGH CONFIDENCE
- 2 sources in cluster → 🟡 MEDIUM CONFIDENCE
- 1 source, major wire (Bloomberg/Reuters/AP/WSJ/FT) → 🟡 MEDIUM CONFIDENCE
- 1 source, smaller outlet → 🔴 UNVERIFIED

**Critical rule:** Never rate a story 🔴 UNVERIFIED if the external Google News search confirmed it. The search results are real — trust them.

**Magnitude-gate stories** are marked ⚠️ MAGNITUDE-GATE STORY in the verification section. These are globally significant events that were specifically searched regardless of digest coverage. If Google News confirmed them, treat as 🟢 HIGH and ensure they appear in your top stories — do not bury them.

## MACRO OVERVIEW
Lead with the live market numbers (exact figures for S&P, Nasdaq, Dow, WTI oil, VIX). Explain what is driving each number based on the verified news. Use specific percentages and prices, not vague directional language.

## TOP STORIES & REAL IMPLICATIONS
The 5 most important stories with confidence ratings based on external verification. What does each mean for markets? Name specific companies, tickers, sectors affected.

## STOCKS TO WATCH
Specific companies with tickers, confidence rating, and 2-3 sentences on exactly why. Only HIGH or MEDIUM confidence stories.

## UPCOMING OPPORTUNITIES
IPOs, mergers, earnings on radar. Confidence level, specific timing.

## SECTORS IN PLAY
Hot/cold sectors with detailed reasoning tied to verified news.

## RISKS & RED FLAGS
Specific tail risks. What's genuinely unverified. What's underreported even after external search.

## TREND COMPARISON
Compare to past analyses. What patterns are emerging?

## ACTION ITEMS
5 concrete, specific things to act on this week. Only from verified/high-confidence information.

Be extremely detailed and direct. Name specific companies, tickers, people, events. This is for someone making real financial decisions.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 8000
    })

    const rawContent = completion.choices[0].message.content
    console.log('gpt-5.4 finish_reason:', completion.choices[0].finish_reason)
    console.log('gpt-5.4 content length:', rawContent?.length ?? 0)

    if (!rawContent || rawContent.trim().length < 100) {
      console.error('gpt-5.4 returned empty or too-short content:', rawContent)
      return res.status(500).json({ error: 'Analysis failed', message: 'Model returned empty response. Try again.' })
    }

    const report = rawContent

    const structureCompletion = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: 'Extract key data points from this market analysis report. Return ONLY valid JSON with no explanation.'
        },
        {
          role: 'user',
          content: `Extract from this report and return valid JSON:

${report}

Return this exact JSON structure with real values from the report (not placeholders):
{
  "keyFindings": [/* 4-6 specific key findings from the report as short strings */],
  "stocks": [/* ticker symbols mentioned, e.g. "AAPL", "TSLA" */],
  "sectors": [/* sector names mentioned */],
  "sentiment": /* one of: "bullish", "bearish", "neutral", "mixed" */,
  "riskLevel": /* one of: "low", "medium", "high" */,
  "verifiedStories": /* integer count of stories marked HIGH CONFIDENCE */,
  "unverifiedStories": /* integer count of stories marked UNVERIFIED */
}`
        }
      ],
      response_format: { type: 'json_object' }
    })

    const structured = JSON.parse(structureCompletion.choices[0].message.content || '{}')

    res.json({
      report,
      timestamp: Date.now(),
      newsCount: newsItems.length,
      ...structured
    })
  } catch (error) {
    console.error('Analyst error:', error)
    res.status(500).json({ error: 'Analysis failed', message: String(error) })
  }
}
