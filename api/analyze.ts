import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { content } = req.body

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a financial news analyst. Analyze news content and return ONLY a JSON object with:
{
  "title": "Clear headline max 100 chars",
  "summary": "4-6 sentence summary. Include: (1) exactly what happened with specific facts, numbers, dates, and named entities (people, companies, countries, locations), (2) which specific outlets/sources are reporting it, (3) what is confirmed vs disputed or unverified, (4) direct market and financial implications with specific sectors or tickers if relevant.",
  "priority": <1-10 number>,
  "categories": ["breaking"|"market"|"geopolitical"|"economy"|"politics"|"technology"|"general"],
  "isMarketRelated": <boolean>
}
Priority: 9-10=major market-moving, 7-8=important market/political, 5-6=moderate, 3-4=minor, 1-2=routine`
        },
        { role: 'user', content: `Analyze this news:\n\n${content}` }
      ],
      response_format: { type: 'json_object' }
    })

    const result = JSON.parse(completion.choices[0].message.content || '{}')
    result.priority = Math.max(1, Math.min(10, result.priority || 5))
    res.json(result)
  } catch (error) {
    console.error('Analysis error:', error)
    res.status(500).json({
      title: content.substring(0, 100),
      summary: content.substring(0, 300),
      priority: 5,
      categories: ['general'],
      isMarketRelated: false
    })
  }
}
