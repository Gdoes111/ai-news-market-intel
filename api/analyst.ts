import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Extend Vercel function timeout to 300s (requires Pro plan; on hobby it caps at 60s)
export const maxDuration = 300

// Fetch live market snapshot from Yahoo Finance (no API key needed)
async function fetchMarketSnapshot(): Promise<string> {
  try {
    const symbols = ['SPY', 'QQQ', 'DIA', 'CL=F', 'BZ=F', '^TNX', 'GC=F', '^VIX', 'DX-Y.NYB']
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketTime`
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!resp.ok) throw new Error(`Yahoo Finance error: ${resp.status}`)
    const data = await resp.json()
    const quotes = data?.quoteResponse?.result || []
    const labels: Record<string, string> = {
      'SPY': 'S&P 500 ETF', 'QQQ': 'Nasdaq 100 ETF', 'DIA': 'Dow Jones ETF',
      'CL=F': 'WTI Crude Oil', 'BZ=F': 'Brent Crude', '^TNX': '10Y Treasury Yield',
      'GC=F': 'Gold', '^VIX': 'VIX (Fear Index)', 'DX-Y.NYB': 'US Dollar Index'
    }
    const lines = quotes.map((q: any) => {
      const chg = q.regularMarketChangePercent?.toFixed(2)
      const arrow = chg > 0 ? '▲' : '▼'
      return `${labels[q.symbol] || q.symbol}: $${q.regularMarketPrice?.toFixed(2)} (${arrow}${Math.abs(chg)}%)`
    })
    return lines.join('\n')
  } catch (e) {
    return `Live market data unavailable: ${e}`
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { newsItems, pastAnalyses } = req.body

  const top50 = newsItems.slice(0, 50)

  // --- Fetch live market data + clustering in parallel ---
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
        content: `Group these ${top50.length} articles into topic clusters. Articles covering the same event (even from different sources) go in the same cluster.

${top50.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "clusters": [
    {
      "topic": "Short topic label",
      "articleIndices": [0, 3, 7],
      "sourceCount": 3,
      "sources": ["Reuters", "CNBC", "Bloomberg"]
    }
  ]
}`
      }
    ],
      response_format: { type: 'json_object' }
    })
  ])

  let clusters: { topic: string; articleIndices: number[]; sourceCount: number; sources: string[] }[] = []
  try {
    const parsed = JSON.parse(clusteringCompletion.choices[0].message.content || '{}')
    clusters = parsed.clusters || []
  } catch {}

  // Build cluster index map: article index -> cluster info
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
        ? `\n   [STORY CLUSTER: "${cluster.topic}" — ${cluster.sourceCount} source(s): ${cluster.sources.join(', ')}]`
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

  const systemPrompt = `You are an elite market intelligence analyst with the instincts of an investigative journalist and the precision of a hedge fund analyst. You think critically, cross-check claims, and distinguish between verified facts and unverified rumours before making any market calls.`

  const userPrompt = `## LIVE MARKET SNAPSHOT (fetched now)
${marketSnapshot}

## CURRENT NEWS DIGEST (${newsItems.length} articles from multiple sources)
${newsDigest}

## PAST ANALYSIS MEMORY
${memoryContext}

## YOUR TASK
Produce a comprehensive market intelligence report. Anchor every macro claim to the live market numbers above. Before making ANY recommendation, verify claims by cross-referencing sources.

## SOURCE VERIFICATION RULES
Your digest is a SAMPLE of the news environment, not the full picture. Many stories that appear single-source in this digest are actually massively confirmed across the broader media. Apply confidence ratings using ALL of these signals together:

**Signal 1 — Cluster count (primary)**
Each article has a [STORY CLUSTER] tag. Use it:
- 🟢 HIGH CONFIDENCE — 3+ sources in cluster
- 🟡 MEDIUM CONFIDENCE — 2 sources in cluster
- 🔴 UNVERIFIED — 1 source in cluster

**Signal 2 — Source weight (override)**
A single Bloomberg, Reuters, AP, WSJ, or FT report on a major macro event = 🟡 MEDIUM minimum.
A single CNBC, BBC, Al Jazeera, or major national wire on a clearly significant story = still 🟡 MEDIUM.

**Signal 3 — Story significance (critical override)**
If a story, IF TRUE, would be a top-5 global macro event (e.g. major oil field attacked, world leader killed, central bank emergency move), do NOT rate it 🔴 UNVERIFIED just because your digest only has one article. Escalate to 🟡 MEDIUM and flag: "likely broader coverage outside this digest."

**Signal 4 — Digest tunnel vision warning**
Your digest contains ~50–90 articles. The real news environment has thousands. When a story looks single-source in your digest BUT is of major geopolitical or macro significance, note: "Single source in digest — likely confirmed elsewhere."

NEVER rate a story 🔴 UNVERIFIED solely because details in the summary are thin. Source count and story significance are the real signals.`

## MACRO OVERVIEW
Lead with the live market numbers (S&P, Nasdaq, Dow % moves, oil price, VIX level). Then explain what is driving those numbers based on the news. Be specific — exact figures, not vague directional language. "S&P +2.5% on ceasefire relief, WTI at $99 despite Hormuz still 90% closed" is the standard, not "equities are rallying."

## TOP STORIES & REAL IMPLICATIONS
The 5 most important stories with source confidence ratings. What does each really mean for markets? Connect the dots. Name the companies and sectors affected. Flag any stories that seem suspiciously quiet in mainstream media.

## STOCKS TO WATCH
List specific companies with ticker symbols, a confidence rating, and 2-3 sentences explaining exactly WHY you're flagging each one. Only recommend based on HIGH or MEDIUM confidence news.

## UPCOMING OPPORTUNITIES
IPOs, mergers, acquisitions, earnings on radar. Confidence level for each. Be specific about timing.

## SECTORS IN PLAY
Hot/cold sectors with detailed reasoning. What is driving each sector right now?

## RISKS & RED FLAGS
Specific tail risks. Unverified stories that could move markets if confirmed. Stories getting underreported.

## TREND COMPARISON
Compare to past analyses. What patterns are emerging? What has changed since last time?

## ACTION ITEMS
5 concrete, specific things to research or consider this week with reasoning. Only based on verified or high-confidence information.

Be extremely detailed and direct. Name specific companies, tickers, people, events. Explain your reasoning fully. This is for someone making real financial decisions who needs to understand the WHY behind every call. Do not be vague or generic.`

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
    console.log('gpt-5.1 finish_reason:', completion.choices[0].finish_reason)
    console.log('gpt-5.1 content length:', rawContent?.length ?? 0)

    if (!rawContent || rawContent.trim().length < 100) {
      console.error('gpt-5.1 returned empty or too-short content:', rawContent)
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
