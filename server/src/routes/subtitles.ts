import { Router, Request, Response } from 'express'
import { openSubtitlesService } from '../services/openSubtitlesService.js'

const router = Router()

// Check if subtitle search is available (requires OpenSubtitles API key)
router.get('/status', async (req: Request, res: Response) => {
  const enabled = openSubtitlesService.isEnabled()
  const downloadEnabled = openSubtitlesService.isDownloadEnabled()

  res.json({
    enabled,
    downloadEnabled,
    languages: enabled ? openSubtitlesService.getLanguages() : [],
  })
})

// Search for subtitles
router.get('/search', async (req: Request, res: Response) => {
  if (!openSubtitlesService.isEnabled()) {
    res.status(503).json({ error: 'OpenSubtitles not configured' })
    return
  }

  const { imdbId, tmdbId, query, language, type, season, episode } = req.query

  if (!imdbId && !tmdbId && !query) {
    res.status(400).json({ error: 'imdbId, tmdbId, or query is required' })
    return
  }

  try {
    const results = await openSubtitlesService.searchSubtitles({
      imdbId: imdbId as string,
      tmdbId: tmdbId as string,
      query: query as string,
      language: (language as string) || 'en',
      type: type as 'movie' | 'episode',
      seasonNumber: season ? parseInt(season as string, 10) : undefined,
      episodeNumber: episode ? parseInt(episode as string, 10) : undefined,
    })

    res.json({ results })
  } catch (error: any) {
    console.error('Subtitle search error:', error.message)
    res.status(500).json({ error: 'Failed to search subtitles' })
  }
})

// Get download link for a subtitle
router.post('/download-link', async (req: Request, res: Response) => {
  if (!openSubtitlesService.isEnabled()) {
    res.status(503).json({ error: 'OpenSubtitles not configured' })
    return
  }

  const { fileId } = req.body

  if (!fileId) {
    res.status(400).json({ error: 'fileId is required' })
    return
  }

  try {
    const link = await openSubtitlesService.getDownloadLink(fileId)

    if (link) {
      res.json({ success: true, link })
    } else {
      res.status(500).json({ error: 'Failed to get download link' })
    }
  } catch (error: any) {
    console.error('Subtitle download link error:', error.message)
    res.status(500).json({ error: 'Failed to get download link' })
  }
})

// Download subtitle content
router.post('/download', async (req: Request, res: Response) => {
  if (!openSubtitlesService.isEnabled()) {
    res.status(503).json({ error: 'OpenSubtitles API key not configured' })
    return
  }

  if (!openSubtitlesService.isDownloadEnabled()) {
    res.status(503).json({ error: 'OpenSubtitles username/password not configured - required for downloads' })
    return
  }

  const { fileId } = req.body

  if (!fileId) {
    res.status(400).json({ error: 'fileId is required' })
    return
  }

  try {
    const content = await openSubtitlesService.downloadSubtitle(fileId)

    if (content) {
      res.json({ success: true, content })
    } else {
      res.status(500).json({ error: 'Failed to download subtitle - check server logs' })
    }
  } catch (error: any) {
    console.error('Subtitle download error:', error.message)
    res.status(500).json({ error: 'Failed to download subtitle' })
  }
})

// Get available languages
router.get('/languages', async (req: Request, res: Response) => {
  res.json({ languages: openSubtitlesService.getLanguages() })
})

export default router
