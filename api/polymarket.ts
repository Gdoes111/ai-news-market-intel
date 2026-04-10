import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface PolymarketEvent {
  id: string
  title: string
  markets: {
    id: string
    question: string
    outcomePrices: string
    outcomes: string
    volume: string
    endDate: string
    active: boolean
  }[]
}

async function fetchPolymarketEvents(): Promise<PolymarketEvent[]> {
  try {
    const response = await fetch(
      'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&order=volume&ascending=false',
      { headers: { 'Accept': 'application/json' } }
    )
    if (!response.ok) throw new Error(`Polymarket API error: ${response.status}`)
    const data = await response.json()
    return data || []
  } catch (error) {
    console.error('Failed to fetch Polymarket events:', error)
    return []
  }
}

// Search Google News RSS for a topic
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

// Fetch a single price from stooq.com
async function fetchStooq(symbol: string, label: string): Promise<string | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!resp.ok) return null
    const text = await resp.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const cols = lines[1].split(',')
    const close = parseFloat(cols[6])
    if (isNaN(close)) return null
    const open = parseFloat(cols[3])
    const chg = isNaN(open) || open === 0 ? 0 : ((close - open) / open) * 100
    const arrow = chg >= 0 ? '▲' : '▼'
    return `${label}: $${close.toFixed(2)} (${arrow}${Math.abs(chg).toFixed(2)}%)`
  } catch {
    return null
  }
}

async function fetchMarketSnapshot(): Promise<string> {
  const stooqSymbols: [string, string][] = [
    ['spy.us',   'S&P 500 (SPY)'],
    ['qqq.us',   'Nasdaq 100 (QQQ)'],
    ['cl.f',     'WTI Crude Oil'],
    ['lco.f',    'Brent Crude'],
    ['gc.f',     'Gold'],
    ['btcusd',   'Bitcoin (BTC/USD)'],
  ]
  const ua = 'Mozilla/5.0'
  const [stooqResults, vixResult] = await Promise.all([
    Promise.all(stooqSymbols.map(([sym, label]) => fetchStooq(sym, label))),
    fetch('https://query2.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=2d', {
      headers: { 'User-Agent': ua, 'Accept': 'application/json' }
    }).then(async r => {
      if (!r.ok) return null
      const d = await r.json()
      const meta = d?.chart?.result?.[0]?.meta
      if (!meta) return null
      const price = meta.regularMarketPrice
      const prev = meta.chartPreviousClose || meta.previousClose
      const chg = prev ? ((price - prev) / prev) * 100 : 0
      const arrow = chg >= 0 ? '▲' : '▼'
      return `VIX (Fear Index): ${price?.toFixed(2)} (${arrow}${Math.abs(chg).toFixed(2)}%)`
    }).catch(() => null)
  ])
  const lines = [...stooqResults.filter(Boolean), vixResult].filter(Boolean) as string[]

  if (lines.length >= 3) return lines.join('\n')

  // Yahoo chart fallback
  try {
    const ua = 'Mozilla/5.0'
    const ySymbols = ['SPY', 'CL=F', 'BZ=F', 'GC=F', '^VIX', 'BTC-USD']
    const yLabels: Record<string, string> = {
      'SPY': 'S&P 500', 'CL=F': 'WTI Crude', 'BZ=F': 'Brent Crude',
      'GC=F': 'Gold', '^VIX': 'VIX', 'BTC-USD': 'Bitcoin'
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

  return lines.length > 0 ? lines.join('\n') : 'Live market data unavailable.'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { newsItems, pastAnalyses } = req.body
  const top50 = newsItems.slice(0, 50)

  // --- Step 1: Fetch Polymarket events + live market data in parallel ---
  const [polymarketEvents, marketSnapshot] = await Promise.all([
    fetchPolymarketEvents(),
    fetchMarketSnapshot()
  ])

  // --- Step 2: Cluster articles + identify magnitude-gate stories + gap analysis in parallel ---
  const [clusteringCompletion, magnitudeCompletion, gapCompletion] = await Promise.all([
    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a news editor. Group news articles into topic clusters. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `Group these ${top50.length} articles into topic clusters. Articles covering the same event go in the same cluster. Score each cluster 1-10 for Polymarket relevance (how likely is there a market for this?).

${top50.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "clusters": [
    {
      "topic": "Short topic label",
      "searchQuery": "3-5 word Google News search query",
      "articleIndices": [0, 3, 7],
      "sourceCount": 3,
      "sources": ["Reuters", "CNBC", "Bloomberg"],
      "polymarketRelevance": 8
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    }),

    // PRE-CLUSTERING magnitude scan — reads every article individually before any ranking
    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a senior intelligence analyst. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `Read every headline below individually. Flag any article that describes an event which — if confirmed — would:
- Move a major commodity (oil, gold, crypto) by more than 5%
- Represent a leadership change or death of a significant national leader
- Constitute a major infrastructure attack (pipeline, power grid, port)
- Be a central bank emergency action (unscheduled rate move, QE, currency intervention)
- Represent major war escalation or ceasefire collapse
- Be a sanctions package affecting >$100B in trade

Flag it even if only ONE article mentions it. That is the entire point of this scan.

${top50.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "magnitudeStories": [
    { "index": 0, "topic": "Short label e.g. Saudi pipeline attack", "searchQuery": "3-5 word Google News search" }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    }),

    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a Polymarket trader and news editor. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `You are looking at a digest of ${top50.length} news articles. Here are the topics covered:

${top50.slice(0, 20).map((item: any) => `- ${item.title}`).join('\n')}

Given these topics, what major related stories are MISSING that would affect Polymarket odds? Think: what follow-on events would be happening? What policy responses? What neighbouring markets/countries are affected but not mentioned? What Polymarket-relevant developments (elections, Fed moves, crypto regulation, sports outcomes) might be underrepresented?

Only flag genuinely important gaps. Max 4.

Return JSON:
{
  "gaps": [
    { "topic": "Short label", "searchQuery": "3-5 word Google News search", "reason": "Why this matters for Polymarket" }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    })
  ])

  let clusters: { topic: string; searchQuery: string; articleIndices: number[]; sourceCount: number; sources: string[]; polymarketRelevance: number }[] = []
  let magnitudeStories: { index: number; topic: string; searchQuery: string }[] = []
  let gaps: { topic: string; searchQuery: string; reason: string }[] = []

  try { clusters = JSON.parse(clusteringCompletion.choices[0].message.content || '{}').clusters || [] } catch {}
  try { magnitudeStories = JSON.parse(magnitudeCompletion.choices[0].message.content || '{}').magnitudeStories || [] } catch {}
  try { gaps = JSON.parse(gapCompletion.choices[0].message.content || '{}').gaps || [] } catch {}

  // --- Step 3: Fire all Google News searches in parallel ---
  const topClusters = [...clusters].sort((a, b) => (b.polymarketRelevance || 0) - (a.polymarketRelevance || 0)).slice(0, 8)
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

  const externalVerification = researchResults
    .filter(r => r.hits.length > 0)
    .map(r => {
      const sourceList = [...new Set(r.hits.map(h => h.source))].join(', ')
      const headlines = r.hits.slice(0, 3).map(h => `  • "${h.title}" — ${h.source}`).join('\n')
      const tag = r.tag === 'magnitude' ? ' ⚠️ MAGNITUDE-GATE' : r.tag === 'gap' ? ' 🔍 GAP SEARCH (not in digest)' : ''
      return `**${r.topic}**${tag} (${r.hits.length} results from: ${sourceList})\n${headlines}`
    })
    .join('\n\n')

  // Build cluster map for digest
  const articleClusterMap = new Map<number, { topic: string; sourceCount: number; sources: string[] }>()
  for (const cluster of clusters) {
    for (const idx of cluster.articleIndices) {
      articleClusterMap.set(idx, { topic: cluster.topic, sourceCount: cluster.sourceCount, sources: cluster.sources })
    }
  }

  // Build digests
  const marketsDigest = polymarketEvents.slice(0, 30).map((event, i) => {
    const marketLines = event.markets?.slice(0, 3).map(market => {
      let prices = 'N/A'
      try {
        const priceArr = JSON.parse(market.outcomePrices || '[]')
        const outcomeArr = JSON.parse(market.outcomes || '[]')
        prices = outcomeArr.map((o: string, idx: number) => `${o}: ${Math.round((parseFloat(priceArr[idx] || '0') * 100))}%`).join(' | ')
      } catch {}
      return `  - ${market.question}\n    Odds: ${prices}\n    Volume: $${parseInt(market.volume || '0').toLocaleString()}\n    Ends: ${market.endDate ? new Date(market.endDate).toLocaleDateString() : 'N/A'}`
    }).join('\n') || '  - No market data'
    return `${i + 1}. ${event.title}\n${marketLines}`
  }).join('\n\n')

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
        .slice(-3)
        .map((a: any) => `[${new Date(a.timestamp).toLocaleDateString()}]\nTop picks: ${a.topPicks?.map((p: any) => `${p.market} (${p.recommendation})`).join(', ')}\nAccuracy notes: ${a.accuracyNotes || 'Not tracked yet'}`)
        .join('\n\n')
    : 'No previous Polymarket analyses yet.'

  const systemPrompt = `You are a sharp Polymarket trader and probabilistic analyst. Your job is to find markets where the crowd odds are wrong — not to have a predetermined bias, but to follow the evidence wherever it leads. You think in probabilities, verify claims before sizing up, and track your edge over time.`

  const userPrompt = `## LIVE MARKET SNAPSHOT (fetched now)
${marketSnapshot}

## LIVE POLYMARKET MARKETS (top 30 by volume)
${marketsDigest || 'Could not fetch live markets — analyse based on news context only.'}

## EXTERNAL VERIFICATION (live Google News searches, run just now)
${externalVerification || 'External search unavailable — use digest sources only.'}

## CURRENT NEWS DIGEST (${newsItems.length} articles)
${newsDigest}

## PAST ANALYSIS MEMORY
${memoryContext}

## YOUR TASK
Find Polymarket mispricings where the crowd odds are wrong based on verified evidence. For each market, assess what the probability SHOULD be vs what the crowd is pricing, and explain why the gap exists.

## SOURCE VERIFICATION RULES
Rate confidence using this hierarchy:

**1. External verification (highest weight)**
- Google News returned 4+ results → 🟢 HIGH CONFIDENCE
- Google News returned 2-3 results → 🟡 MEDIUM CONFIDENCE
- 0-1 results or not searched → fall back to digest

**2. Digest cluster count (fallback)**
- 3+ sources in cluster → 🟢 HIGH
- 2 sources → 🟡 MEDIUM
- 1 major wire (Bloomberg/Reuters/AP/WSJ/FT) → 🟡 MEDIUM
- 1 smaller outlet → 🔴 UNVERIFIED

**Gap searches** (🔍 GAP SEARCH) found stories not in the digest. Include these if they affect any Polymarket odds.
**Magnitude-gate stories** (⚠️ MAGNITUDE-GATE) are globally significant — if confirmed, treat as 🟢 HIGH.

## MANDATORY PRE-TRADE CHECKS
Before recommending ANY trade, run all of these checks. Skip the trade if any check fails:

**1. EXPIRY CHECK** — Is the resolve date in the future? If the resolve date has already passed, do NOT recommend the trade. State "EXPIRED — skip." This has caused errors before.

**2. LEGAL ELIGIBILITY CHECK (elections)** — For any election or political appointment market, verify: Is the candidate legally eligible to run or be appointed? Search your knowledge for: "[candidate] legal status ban conviction [year]". If banned (e.g. Le Pen — convicted March 2025, 5-year ban upheld), do NOT recommend YES on their winning. State the ban clearly.

**3. SPORTSBOOK CROSS-REFERENCE (sports)** — For any sports market, estimate what major sportsbooks (BetMGM, ESPN Bet, DraftKings) would price this at. If Polymarket is BELOW sportsbook consensus, the edge (if any) goes the opposite direction to what you might assume. Always note the sportsbook-implied probability.

**4. FED PROXIMITY RULE** — If an FOMC meeting is within 30 days, CME FedWatch Tool pricing is extremely well-calibrated. Do NOT recommend fading the consensus without a specific, concrete catalyst theory (not just "uncertainty exists"). State the current FedWatch probability before any Fed trade recommendation.

**5. CRYPTO ATH CONTEXT** — For any crypto price target, always state: (a) current price, (b) all-time high price, (c) whether target requires a new ATH and by what %, (d) current cycle position (bull/bear/recovery). "2.2x from here" and "27% above previous ATH from a post-cycle drawdown" describe the same trade very differently.

## FORMAT EACH OPPORTUNITY AS:

### [EXACT MARKET TITLE]
**Resolve date:** [when — confirm this is in the future]
**Current odds:** Yes X% / No Y%
**Pre-trade checks passed:** [list which checks you ran and what they found]
**What it should be:** ~Z% based on [evidence]
**Edge:** [percentage points mispriced]
**Confidence:** 🟢/🟡/🔴 [reasoning — cite specific sources from verification above]
**Suggested position:** YES or NO, [small/medium/large] size
**Why the crowd is wrong:** [specific explanation — information lag? bias? missing data?]

## COVER ALL CATEGORIES
- Politics & Elections (run eligibility check first)
- Crypto prices (run ATH context check first)
- Geopolitical events (wars, diplomacy, sanctions)
- Economics (run Fed proximity check for Fed markets)
- Sports (run sportsbook cross-reference first)
- Any others with clear mispricings

## RISK SECTION
What to avoid and why. Flag any market where pre-trade checks reveal the trade is invalid (expired, candidate banned, etc).

## TREND FROM MEMORY
How have past picks performed? What patterns are you seeing in crowd mispricings?

Be specific with percentages. Name exact markets. This is real money.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 5000
    })

    const report = completion.choices[0].message.content || 'Analysis failed'

    const structureCompletion = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'Extract Polymarket trade picks from this analysis. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `Extract from this Polymarket analysis:
${report}

Return this JSON:
{
  "topPicks": [
    {
      "market": "market title",
      "recommendation": "YES" or "NO",
      "currentOdds": "35%",
      "targetOdds": "65%",
      "confidence": "high" or "medium" or "speculative",
      "size": "small" or "medium" or "large",
      "reasoning": "1-2 sentence summary of why the crowd is wrong and what the evidence says"
    }
  ],
  "marketsAnalysed": 0,
  "highConfidencePicks": 0,
  "accuracyNotes": "any notes on past pick performance if mentioned"
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
      marketsCount: polymarketEvents.length,
      ...structured
    })
  } catch (error) {
    console.error('Polymarket analyst error:', error)
    res.status(500).json({ error: 'Analysis failed', message: String(error) })
  }
}
