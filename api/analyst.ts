import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { newsItems, pastAnalyses } = req.body

  const newsDigest = newsItems
    .slice(0, 40)
    .map((item: any, i: number) => `${i + 1}. [Priority ${item.priority}/10] ${item.title}\n   Source: ${item.source}\n   Summary: ${item.summary}`)
    .join('\n\n')

  const memoryContext = pastAnalyses && pastAnalyses.length > 0
    ? pastAnalyses
        .slice(-5)
        .map((a: any) => `[${new Date(a.timestamp).toLocaleDateString()}]\nKey findings: ${a.keyFindings?.join('; ')}\nStocks flagged: ${a.stocks?.join(', ')}`)
        .join('\n\n')
    : 'No previous analyses yet.'

  const systemPrompt = `You are an elite market intelligence analyst. You think like a hedge fund analyst — sharp, specific, evidence-based. Produce actionable intelligence, not generic commentary.`

  const userPrompt = `## CURRENT NEWS DIGEST (${newsItems.length} articles)
${newsDigest}

## PAST ANALYSIS MEMORY
${memoryContext}

## YOUR TASK
Produce a comprehensive market intelligence report covering:

## MACRO OVERVIEW
What is the overall market environment? Key themes.

## TOP STORIES & REAL IMPLICATIONS
For the most important news, what does it really mean? Connect the dots.

## STOCKS TO WATCH
Specific companies with ticker symbols. Give reasons: earnings catalysts, news, undervalued, sector rotation, etc.

## UPCOMING OPPORTUNITIES
IPOs, mergers, acquisitions, earnings. What should G have on radar?

## SECTORS IN PLAY
Which sectors are hot/cold and why.

## RISKS
Tail risks building. What could go wrong?

## TREND COMPARISON
Compare to past analyses. What patterns are emerging?

## ACTION ITEMS
3-5 concrete things to research or consider this week.

Be direct and specific. Name companies. Give reasons. This is for someone who wants to make money.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.5', // Latest GPT model as of early 2026
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 3000
    })

    const report = completion.choices[0].message.content || 'Analysis failed'

    const structureCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Extract key data points from this market analysis report. Return ONLY JSON.'
        },
        {
          role: 'user',
          content: `Extract from this report and return JSON:
${report}

{
  "keyFindings": ["finding1", "finding2", "finding3"],
  "stocks": ["AAPL", "TSLA"],
  "sectors": ["Technology", "Energy"],
  "sentiment": "bullish" or "bearish" or "neutral" or "mixed",
  "riskLevel": "low" or "medium" or "high"
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
