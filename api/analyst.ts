import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Extend Vercel function timeout to 300s (requires Pro plan; on hobby it caps at 60s)
export const maxDuration = 300

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
Current market environment. Key themes with confidence ratings. Be specific — what is actually happening right now?

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
      model: 'gpt-5.1',
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
      model: 'gpt-4o-mini',
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
