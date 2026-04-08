import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { newsItems, pastAnalyses } = req.body

  const newsDigest = newsItems
    .slice(0, 50)
    .map((item: any, i: number) => `${i + 1}. [Priority ${item.priority}/10] [Source: ${item.source}] ${item.title}\n   Summary: ${item.summary}`)
    .join('\n\n')

  const memoryContext = pastAnalyses && pastAnalyses.length > 0
    ? pastAnalyses
        .slice(-5)
        .map((a: any) => `[${new Date(a.timestamp).toLocaleDateString()}]\nKey findings: ${a.keyFindings?.join('; ')}\nStocks flagged: ${a.stocks?.join(', ')}\nSentiment: ${a.sentiment}`)
        .join('\n\n')
    : 'No previous analyses yet.'

  const systemPrompt = `You are an elite market intelligence analyst with the instincts of an investigative journalist and the precision of a hedge fund analyst. You think critically, cross-check claims, and distinguish between verified facts and unverified rumours before making any market calls.`

  const userPrompt = `## CURRENT NEWS DIGEST (${newsItems.length} articles from multiple sources)
${newsDigest}

## PAST ANALYSIS MEMORY
${memoryContext}

## YOUR TASK
Produce a comprehensive market intelligence report. Before making ANY recommendation, verify claims by cross-referencing sources.

## SOURCE VERIFICATION
For each major story, check: Is this reported by multiple sources? If only one outlet is running a story, flag it as unverified. Rate confidence:
- 🟢 HIGH CONFIDENCE — 3+ independent sources corroborating
- 🟡 MEDIUM CONFIDENCE — 2 sources, or 1 major outlet
- 🔴 UNVERIFIED — single source, treat as rumour until confirmed

## MACRO OVERVIEW
Current market environment. Key themes with confidence ratings.

## TOP STORIES & REAL IMPLICATIONS
Most important stories with source confidence ratings. What does each really mean? Connect the dots. Flag any stories that seem suspiciously quiet in mainstream media.

## STOCKS TO WATCH
Specific companies with ticker symbols. Confidence rating for each. Only recommend based on HIGH or MEDIUM confidence news.

## UPCOMING OPPORTUNITIES
IPOs, mergers, acquisitions, earnings on radar. Confidence level for each.

## SECTORS IN PLAY
Hot/cold sectors with reasoning.

## RISKS & RED FLAGS
Tail risks. Unverified stories that could move markets if confirmed. Stories that seem to be getting suppressed or underreported.

## TREND COMPARISON
Compare to past analyses. What patterns are emerging over time?

## ACTION ITEMS
3-5 concrete things to research or consider this week. Only based on verified or high-confidence information.

Be direct. Name companies and tickers. Flag uncertainty. This is for someone making real financial decisions.`

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
        {
          role: 'system',
          content: 'Extract key data points from this market analysis report. Return ONLY valid JSON.'
        },
        {
          role: 'user',
          content: `Extract from this report:
${report}

Return this exact JSON structure:
{
  "keyFindings": ["finding1", "finding2", "finding3"],
  "stocks": ["AAPL", "TSLA"],
  "sectors": ["Technology", "Energy"],
  "sentiment": "bullish",
  "riskLevel": "medium",
  "verifiedStories": 0,
  "unverifiedStories": 0
}
sentiment must be one of: bullish, bearish, neutral, mixed
riskLevel must be one of: low, medium, high
verifiedStories: count of 🟢 HIGH CONFIDENCE stories
unverifiedStories: count of 🔴 UNVERIFIED stories`
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
