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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { newsItems, pastAnalyses } = req.body

  let polymarketEvents: PolymarketEvent[] = []
  try {
    polymarketEvents = await fetchPolymarketEvents()
  } catch (error) {
    console.error('Polymarket fetch failed:', error)
  }

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

  const newsDigest = newsItems
    .slice(0, 40)
    .map((item: any, i: number) => `${i + 1}. [${item.source}] [Priority ${item.priority}/10] ${item.title}\n   ${item.summary}`)
    .join('\n\n')

  const memoryContext = pastAnalyses && pastAnalyses.length > 0
    ? pastAnalyses
        .slice(-3)
        .map((a: any) => `[${new Date(a.timestamp).toLocaleDateString()}]\nTop picks: ${a.topPicks?.map((p: any) => `${p.market} (${p.recommendation})`).join(', ')}\nAccuracy notes: ${a.accuracyNotes || 'Not tracked yet'}`)
        .join('\n\n')
    : 'No previous Polymarket analyses yet.'

  const systemPrompt = `You are a sharp Polymarket trader and investigative analyst. You find mispricings by reading more sources than the average trader. You think probabilistically, verify claims before betting on them, and track your edge over time.

Your job: find markets where the crowd odds are WRONG based on news evidence.`

  const userPrompt = `## LIVE POLYMARKET MARKETS
${marketsDigest || 'Could not fetch live markets — analyse based on news context only.'}

## CURRENT NEWS (${newsItems.length} articles)
${newsDigest}

## PAST ANALYSIS MEMORY
${memoryContext}

## YOUR TASK
Find Polymarket mispricings. For each opportunity:

1. **VERIFY THE NEWS FIRST** — before recommending any trade, cross-check:
   - 🟢 HIGH CONFIDENCE: 3+ sources confirm → strong trade signal
   - 🟡 MEDIUM CONFIDENCE: 1-2 sources → trade with smaller size
   - 🔴 UNVERIFIED: single source or rumour → flag as speculative, don't recommend unless edge is huge

2. **FIND THE MISPRICINGS** — where are crowd odds clearly wrong?
   - What does the news say the probability SHOULD be?
   - What are the current odds?
   - Why is the crowd wrong? (Information lag? Bias? Echo chamber?)

3. **FORMAT EACH OPPORTUNITY AS:**

### [MARKET TITLE]
**Current odds:** Yes X% / No Y%
**What it should be:** ~Z% based on [evidence]
**Edge:** [how many percentage points mispriced]
**Confidence:** 🟢/🟡/🔴 [reasoning]
**Suggested position:** YES or NO, [small/medium/large] size
**Sources supporting:** [which outlets are reporting this]
**Resolve date:** [when does it close]
**Why the crowd is wrong:** [explanation]

## COVER THESE CATEGORIES
- Politics & Elections
- Crypto prices & regulatory decisions
- Geopolitical events (wars, diplomacy, sanctions)
- Sports & Entertainment (Oscar winners, sports championships — useful for volume)
- Economics (Fed decisions, inflation data, GDP)
- Celebrity/Pop culture if relevant (TMZ-type early signals)

## RISK SECTION
What trades to AVOID and why. What information is too uncertain to bet on.

## TREND FROM MEMORY
If past picks are tracked, how have previous calls performed? What patterns in crowd mispricing are you seeing?

Be specific with percentages. Name the exact markets. This is real money on the line.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 4000
    })

    const report = completion.choices[0].message.content || 'Analysis failed'

    const structureCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
      "size": "small" or "medium" or "large"
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
