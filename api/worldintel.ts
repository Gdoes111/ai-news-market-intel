import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 300

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { newsItems, pastAnalyses, verifiedFacts, carryForwardStories } = req.body
  const top60 = newsItems.slice(0, 60)

  // --- Step 1: Cluster + pre-magnitude scan + gap analysis in parallel ---
  const [clusteringCompletion, preMagnitudeCompletion, gapCompletion] = await Promise.all([
    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a technology and world news editor. Group articles into topic clusters. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `Group these ${top60.length} articles into topic clusters. Score each 1-10 for how significant/interesting it is for someone who wants to understand the future of technology, AI, science, geopolitics, and world events.

${top60.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "clusters": [
    {
      "topic": "Short topic label",
      "searchQuery": "3-5 word Google News search",
      "articleIndices": [0, 3, 7],
      "sourceCount": 3,
      "sources": ["MIT Tech Review", "The Verge", "Wired"],
      "significance": 9
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    }),

    // Pre-clustering magnitude scan — reads every article individually
    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a senior technology and world events analyst. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `Read every headline individually. Flag any that describes a genuinely breakthrough or world-changing event:
- A major AI model release or capability leap (GPT-level, AGI-adjacent)
- A quantum computing milestone (error correction breakthrough, qubit record)
- A major scientific discovery (drug, physics, biology)
- A large tech company acquisition, merger, or collapse
- A regulatory action that could reshape an industry (antitrust, AI regulation, chip export controls)
- A geopolitical event that reshapes global tech/science competition
- A major space milestone (Moon landing, Mars, orbital station)

Flag even if only ONE article mentions it.

${top60.map((item: any, i: number) => `${i}: [${item.source}] ${item.title}`).join('\n')}

Return JSON:
{
  "magnitudeStories": [
    { "index": 0, "topic": "Short label", "searchQuery": "3-5 word Google News search" }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    }),

    // Gap analysis — what important world/tech stories are missing?
    openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a technology and world news editor. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `You are looking at a digest of ${top60.length} tech and world news articles. Here are the topics covered:

${top60.slice(0, 25).map((item: any) => `- ${item.title}`).join('\n')}

What major related technology, science, AI, or world events are MISSING? Think: what follow-on developments would be happening? What companies/research labs/countries would be responding? What adjacent fields are affected?

Max 4 gaps. Focus on things that matter for understanding the future.

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
  ])

  let clusters: { topic: string; searchQuery: string; articleIndices: number[]; sourceCount: number; sources: string[]; significance: number }[] = []
  let magnitudeStories: { index: number; topic: string; searchQuery: string }[] = []
  let gaps: { topic: string; searchQuery: string; reason: string }[] = []

  try { clusters = JSON.parse(clusteringCompletion.choices[0].message.content || '{}').clusters || [] } catch {}
  try { magnitudeStories = JSON.parse(preMagnitudeCompletion.choices[0].message.content || '{}').magnitudeStories || [] } catch {}
  try { gaps = JSON.parse(gapCompletion.choices[0].message.content || '{}').gaps || [] } catch {}

  // --- Step 2: Fire all Google News searches in parallel ---
  const topClusters = [...clusters].sort((a, b) => (b.significance || 0) - (a.significance || 0)).slice(0, 8)
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
      const tag = r.tag === 'magnitude' ? ' ⚠️ BREAKTHROUGH' : r.tag === 'gap' ? ' 🔍 GAP SEARCH' : ''
      return `**${r.topic}**${tag} (${r.hits.length} results from: ${sourceList})\n${headlines}`
    })
    .join('\n\n')

  // Build cluster map
  const articleClusterMap = new Map<number, { topic: string; sourceCount: number; sources: string[] }>()
  for (const cluster of clusters) {
    for (const idx of cluster.articleIndices) {
      articleClusterMap.set(idx, { topic: cluster.topic, sourceCount: cluster.sourceCount, sources: cluster.sources })
    }
  }

  const newsDigest = top60
    .map((item: any, i: number) => {
      const cluster = articleClusterMap.get(i)
      const clusterLine = cluster
        ? `\n   [CLUSTER: "${cluster.topic}" — ${cluster.sourceCount} source(s): ${cluster.sources.join(', ')}]`
        : ''
      return `${i + 1}. [Priority ${item.priority}/10] [Source: ${item.source}] ${item.title}\n   ${item.summary}${clusterLine}`
    })
    .join('\n\n')

  const memoryContext = pastAnalyses && pastAnalyses.length > 0
    ? pastAnalyses.slice(-3).map((a: any) =>
        `[${new Date(a.timestamp).toLocaleDateString()}] Themes: ${a.themes?.join(', ')} | Breakthroughs: ${a.breakthroughs?.join(', ')}`
      ).join('\n')
    : 'No previous world intel reports yet.'

  const verifiedFactsContext = verifiedFacts && verifiedFacts.length > 0
    ? `Previously confirmed facts — treat as ground truth:\n${verifiedFacts.slice(-40).map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}`
    : 'No accumulated verified facts yet.'

  const carryForwardContext = carryForwardStories && carryForwardStories.length > 0
    ? `Important stories from recent reports — include if still relevant:\n${carryForwardStories.map((s: any) => `- [${s.confidence}] ${s.title}: ${s.summary}`).join('\n')}`
    : ''

  const systemPrompt = `You are a world intelligence analyst — your job is to understand what is actually happening in technology, science, AI, geopolitics, and the broader world, and explain what it means. You follow the evidence wherever it leads.

Your lens is not "what moves the stock price tomorrow" but "what is genuinely important, what is changing, what should an informed person know about?" If something is a real breakthrough, say so clearly. If something is hype, say that too.`

  const userPrompt = `## EXTERNAL VERIFICATION (live Google News searches, run just now)
${externalVerification || 'External search unavailable.'}

## CURRENT NEWS DIGEST (${newsItems.length} articles)
${newsDigest}

## VERIFIED FACTS (confirmed in previous reports — never re-hedge these)
${verifiedFactsContext}

${carryForwardContext ? `## CARRY-FORWARD STORIES\n${carryForwardContext}\n` : ''}
## PAST REPORTS MEMORY
${memoryContext}

## YOUR TASK
Produce a comprehensive world intelligence briefing. Cover what is genuinely happening and why it matters — across AI, technology, science, geopolitics, and world events.

## SOURCE VERIFICATION
- 4+ Google News results → 🟢 CONFIRMED
- 2-3 results → 🟡 LIKELY
- 0-1 results → 🔴 UNVERIFIED
- ⚠️ BREAKTHROUGH stories: confirmed breakthroughs deserve emphasis regardless of source count

## SECTIONS TO COVER

### 🤖 AI & Machine Learning
What's happening in AI right now? Model releases, capability jumps, research breakthroughs, company moves (OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, xAI, Chinese labs). What's real vs hype?

### 💻 Technology & Semiconductors
Nvidia, TSMC, AMD, Intel, ASML — chip supply chain, GPU launches, data center build-out. What are the big tech companies doing?

### ⚛️ Quantum Computing & Deep Science
Any quantum milestones? Error correction, qubit records, practical applications getting closer? Other deep science (physics, biology, materials)?

### 🚀 Space & Future Tech
SpaceX, Blue Origin, NASA, ESA — launches, missions, milestones. Robotics, biotech, energy tech.

### 🌍 Geopolitics & Tech Competition
US-China tech war, chip export controls, AI regulation globally, who is winning the AI arms race and why?

### 💡 What's Being Missed
Stories that are underreported relative to their long-term significance. Things that look small now but could be big.

### 🔮 What To Watch
3-5 specific things to track over the next week/month. Not vague — specific companies, research labs, policy decisions, upcoming announcements.

Be specific. Name companies, people, research papers, policy decisions. This is for someone who wants to genuinely understand what's happening in the world.`

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
    if (!rawContent || rawContent.trim().length < 100) {
      return res.status(500).json({ error: 'Analysis failed', message: 'Empty response from model' })
    }

    const report = rawContent

    const structureCompletion = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'Extract key data from this world intelligence report. Return ONLY valid JSON.' },
        {
          role: 'user',
          content: `Extract from this report:
${report}

Return JSON:
{
  "themes": [/* 4-6 major themes as short strings */],
  "breakthroughs": [/* any confirmed breakthroughs or major events */],
  "companies": [/* key companies mentioned */],
  "watchList": [/* 3-5 things to watch */],
  "topStories": [{ "title": "short title", "confidence": "high/medium/low", "summary": "1 sentence" }],
  "newVerifiedFacts": [/* 3-8 specific newly confirmed facts with names/numbers/dates */]
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
      ...structured,
      topStories: structured.topStories || [],
      newVerifiedFacts: structured.newVerifiedFacts || []
    })
  } catch (error) {
    console.error('World Intel error:', error)
    res.status(500).json({ error: 'Analysis failed', message: String(error) })
  }
}
