import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { message, history, context } = req.body

  const {
    newsItems = [],
    analystReports = [],
    polymarketAnalyses = [],
    verifiedFacts = []
  } = context || {}

  // Build compact context summary
  const newsContext = newsItems.slice(0, 30)
    .map((n: any) => `[${n.source}] [P${n.priority}] ${n.title}: ${n.summary}`)
    .join('\n')

  const analystContext = analystReports.slice(-3).map((r: any) => `
[${new Date(r.timestamp).toLocaleDateString()}] Sentiment: ${r.sentiment} | Risk: ${r.riskLevel}
Key findings: ${r.keyFindings?.join('; ')}
Stocks flagged: ${r.stocks?.join(', ')}
Top stories: ${r.topStories?.slice(0, 5).map((s: any) => `${s.title} (${s.confidence})`).join(', ')}
`.trim()).join('\n\n')

  const polyContext = polymarketAnalyses.slice(-2).map((p: any) => `
[${new Date(p.timestamp).toLocaleDateString()}] ${p.marketsCount} markets scanned
Top picks: ${p.topPicks?.slice(0, 5).map((pick: any) => `${pick.recommendation} ${pick.market} @ ${pick.currentOdds} → ${pick.targetOdds} (${pick.confidence})`).join(', ')}
`.trim()).join('\n\n')

  const factsContext = verifiedFacts.slice(-40).join('\n')

  const systemPrompt = `You are an intelligent research assistant embedded in a market intelligence app. You have access to the user's current news feed, analyst reports, Polymarket analyses, and a growing list of verified facts.

Your job: answer questions about the current market situation, specific stories, stocks, Polymarket trades, or anything else the user asks — drawing on the context below. Be concise and direct. If you're unsure, say so. If the answer is in the context, cite where it came from (which report, which source).

## VERIFIED FACTS (confirmed across reports)
${factsContext || 'None yet.'}

## RECENT ANALYST REPORTS
${analystContext || 'No reports yet.'}

## RECENT POLYMARKET ANALYSES
${polyContext || 'No Polymarket analyses yet.'}

## CURRENT NEWS FEED (${newsItems.length} articles)
${newsContext || 'No news loaded.'}

Keep replies concise — 2-4 sentences for simple questions, longer only if needed. Use bullet points for lists. Don't repeat the question back.`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...(history || []).slice(-10).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user' as const, content: message }
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages,
      max_completion_tokens: 1000
    })

    res.json({ reply: completion.choices[0].message.content })
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Chat failed', message: String(error) })
  }
}
