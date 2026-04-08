import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { feedUrl } = req.body

  try {
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`)
    const data = await response.json()
    res.json(data)
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch RSS feed' })
  }
}
