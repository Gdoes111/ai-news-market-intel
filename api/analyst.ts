import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Extend Vercel function timeout to 300s (requires Pro plan; on hobby it caps at 60s)
export const maxDuration = 300

// Fetch a single price from stooq.com CSV (no auth needed)
async function fetchStooq(symbol: string, label: string): Promise<string | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!resp.ok) return null
    const text = await resp.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const cols = lines[1].split(',')
    const close = parseFloat(cols[6]) // close price
    if (isNaN(close)) return null
    const open = parseFloat(cols[3])
    const chg = isNaN(open) || open === 0 ? 0 : ((close - open) / open) * 100
    const arrow = chg >= 0 ? '▲' : '▼'
    return `${label}: $${close.toFixed(2)} (${arrow}${Math.abs(chg).toFixed(2)}%)`
  } catch {
    return null
  }
}

// Fetch live market snapshot — stooq primary, Yahoo fallback
async function fetchMarketSnapshot(): Promise<string> {
  // stooq symbols: ETFs use name.us, futures use symbol.f, indices use ^symbol
  const stooqSymbols: [string, string][] = [
    ['spy.us',   'S&P 500 (SPY)'],
    ['qqq.us',   'Nasdaq 100 (QQQ)'],
    ['dia.us',   'Dow Jones (DIA)'],
    ['cl.f',     'WTI Crude Oil'],
    ['lco.f',    'Brent Crude'],
    ['tnx.cboe', '10Y Treasury Yield'],
    ['gc.f',     'Gold'],
    ['^vix',     'VIX (Fear Index)'],
    ['dxy.icap', 'US Dollar Index'],
  ]

  const results = await Promise.all(
    stooqSymbols.map(([sym, label]) => fetchStooq(sym, label))
  )

  const lines = results.filter(Boolean) as string[]

  if (lines.length >= 4) return lines.join('\n')

  // Fallback: Yahoo Finance v8 chart endpoint (no crumb needed for chart)
  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
    const ySymbols = ['SPY', 'QQQ', 'CL=F', 'BZ=F', 'GC=F', '^VIX']
    const yLabels: Record<string, string> = {
      'SPY': 'S&P 500 (SPY)', 'QQQ': 'Nasdaq 100 (QQQ)',
      'CL=F': 'WTI Crude Oil', 'BZ=F': 'Brent Crude',
      'GC=F': 'Gold', '^VIX': 'VIX'
    }
    const yLines: string[] = []
    await Promise.all(ySymbols.map(async sym => {
      try {
        const r = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`, {
          headers: { 'User-Agent': ua, 'Accept': 'application/json' }
        })
        if (!r.ok) return
        const d = await r.json()
        const meta = d?.chart?.result?.[0]?.meta
        if (!meta) return
        const price = meta.regularMarketPrice
        const prev = meta.chartPreviousClose || meta.previousClose
        const chg = prev ? ((price - prev) / prev) * 100 : 0
        const arrow = chg >= 0 ? '▲' : '▼'
        yLines.push(`${yLabels[sym]}: $${price?.toFixed(2)} (${arrow}${Math.abs(chg).toFixed(2)}%)`)
      } catch {}
    }))
    if (yLines.length >= 3) return (lines.length > 0 ? lines.join('\n') + '\n' : '') + yLines.join('\n')
  } catch {}

  if (lines.length > 0) return lines.join('\n') + '\n(some symbols unavailable)'
  return 'Live market data unavailable — rely on prices cited in news articles.'
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

  // --- Step 1: Fetch live market data + pre-clustering magnitude scan in parallel ---
  // Magnitude scan runs on ALL articles individually BEFORE clustering — catches single-mention big stories
  const [marketSnapshot, clusteringCompletion, preMagnitudeCompletion] = await Promise.all([
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
    }),
    // PRE-CLUSTERING magnitude scan — reads every article individually before any ranking/clustering
    // This is the key fix: catches single-mention globally-significant stories before they get buried
    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a senior intelligence analyst. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `Read every headline below individually. Flag any article that describes an event which — if confirmed — would:
- Move a major commodity (oil, gold) by more than 5%
- Represent a leadership change or death of a significant national leader
- Constitute a major infrastructure attack (pipeline, power grid, port, data center)
- Be a central bank emergency action (unscheduled rate move, QE activation, currency intervention)
- Represent major war escalation or ceasefire collapse
- Be a sanctions package affecting >$100B in trade

Flag it even if only ONE article mentions it. That is the entire point of this scan.

${top50.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "magnitudeStories": [
    { "index": 0, "topic": "Short label e.g. Saudi pipeline attack", "searchQuery": "3-5 word Google News search e.g. Saudi Aramco pipeline attack" }
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

  try {
    const parsed = JSON.parse(preMagnitudeCompletion.choices[0].message.content || '{}')
    magnitudeStories = parsed.magnitudeStories || []
  } catch {}

  // --- Step 3: Gap analysis — what's missing from the digest given the macro context? ---
  const gapCompletion = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: 'You are a senior news editor. Return ONLY valid JSON.' },
      {
        role: 'user',
        content: `You are looking at a digest of ${top50.length} news articles. Here are the topics currently covered:

${clusters.slice(0, 15).map(c => `- ${c.topic}`).join('\n')}

Given these topics, what major related stories or angles are MISSING that a well-informed analyst would expect to find? Think about: what follow-on events would naturally be happening? What neighbouring countries/markets/sectors would be affected that aren't mentioned? What policy responses would logically follow?

Only flag genuinely important gaps — stories that if confirmed would materially change the market picture. Max 4 gaps.

Return JSON:
{
  "gaps": [
    { "topic": "Short label", "searchQuery": "3-5 word Google News search", "reason": "Why this matters" }
  ]
}`
      }
    ],
    response_format: { type: 'json_object' }
  })

  let gaps: { topic: string; searchQuery: string; reason: string }[] = []
  try {
    const parsed = JSON.parse(gapCompletion.choices[0].message.content || '{}')
    gaps = parsed.gaps || []
  } catch {}

  // --- Step 4: Research the top 8 clusters + magnitude-gate stories + gap searches via Google News ---
  const topClusters = [...clusters]
    .sort((a, b) => (b.significance || 0) - (a.significance || 0))
    .slice(0, 8)

  // Merge cluster searches + magnitude searches + gap searches (deduplicate by topic)
  const coveredTopics = topClusters.map(c => c.topic.toLowerCase())
  const allSearches: { topic: string; searchQuery: string; tag: 'cluster' | 'magnitude' | 'gap' }[] = [
    ...topClusters.map(c => ({ topic: c.topic, searchQuery: c.searchQuery || c.topic, tag: 'cluster' as const })),
    ...magnitudeStories
      .filter(m => !coveredTopics.some(t => t.includes(m.topic.toLowerCase())))
      .map(m => ({ topic: m.topic, searchQuery: m.searchQuery, tag: 'magnitude' as const })),
    ...gaps
      .filter(g => !coveredTopics.some(t => t.includes(g.topic.toLowerCase())))
      .map(g => ({ topic: g.topic, searchQuery: g.searchQuery, tag: 'gap' as const }))
  ]

  const researchResults = await Promise.all(
    allSearches.map(async (s) => {
      const hits = await searchGoogleNews(s.searchQuery)
      return { topic: s.topic, hits, tag: s.tag }
    })
  )

  // Build external verification summary
  const externalVerification = researchResults
    .filter(r => r.hits.length > 0)
    .map(r => {
      const sourceList = [...new Set(r.hits.map(h => h.source))].join(', ')
      const headlines = r.hits.slice(0, 3).map(h => `  • "${h.title}" — ${h.source}`).join('\n')
      const tag = r.tag === 'magnitude' ? ' ⚠️ MAGNITUDE-GATE' : r.tag === 'gap' ? ' 🔍 GAP SEARCH (not in digest)' : ''
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

**Magnitude-gate stories** are marked ⚠️ MAGNITUDE-GATE in the verification section. These are globally significant events specifically searched regardless of digest coverage. If confirmed, treat as 🟢 HIGH and include in top stories.

**Gap searches** are marked 🔍 GAP SEARCH (not in digest). These are topics that were identified as potentially missing from the digest based on the macro context — the model asked "what should be happening that I'm not seeing?" If a gap search returned results, include those findings in your report as additional context the digest missed.

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
