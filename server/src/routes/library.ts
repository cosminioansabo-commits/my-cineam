import { Router, Request, Response } from 'express'
import { radarrService } from '../services/radarrService.js'
import { sonarrService } from '../services/sonarrService.js'
import { downloadManager } from '../services/downloadManager.js'

const router = Router()

// Test connections to all services
router.get('/status', async (req: Request, res: Response) => {
  const [radarr, sonarr, qbittorrent] = await Promise.all([
    radarrService.isEnabled() ? radarrService.testConnection() : Promise.resolve(false),
    sonarrService.isEnabled() ? sonarrService.testConnection() : Promise.resolve(false),
    downloadManager.testQBittorrentConnection()
  ])

  res.json({
    radarr: { enabled: radarrService.isEnabled(), connected: radarr },
    sonarr: { enabled: sonarrService.isEnabled(), connected: sonarr },
    qbittorrent: { connected: qbittorrent }
  })
})

// ============ RADARR ROUTES ============

// Get all movies in library
router.get('/movies', async (req: Request, res: Response) => {
  if (!radarrService.isEnabled()) {
    res.status(503).json({ error: 'Radarr is not configured' })
    return
  }

  const movies = await radarrService.getMovies()
  res.json({ movies })
})

// Check if movie is in library by TMDB ID
router.get('/movies/check/:tmdbId', async (req: Request, res: Response) => {
  if (!radarrService.isEnabled()) {
    res.json({ inLibrary: false, enabled: false })
    return
  }

  const tmdbId = parseInt(req.params.tmdbId, 10)
  const movie = await radarrService.getMovieByTmdbId(tmdbId)

  res.json({
    inLibrary: !!movie,
    enabled: true,
    movie: movie || undefined
  })
})

// Add movie to library
router.post('/movies', async (req: Request, res: Response) => {
  if (!radarrService.isEnabled()) {
    res.status(503).json({ error: 'Radarr is not configured' })
    return
  }

  const { tmdbId, title, year, searchForMovie } = req.body

  if (!tmdbId || !title) {
    res.status(400).json({ error: 'tmdbId and title are required' })
    return
  }

  const movie = await radarrService.addMovie({
    tmdbId,
    title,
    year,
    searchForMovie: searchForMovie ?? false
  })

  if (movie) {
    res.json({ success: true, movie })
  } else {
    res.status(500).json({ error: 'Failed to add movie to library' })
  }
})

// Delete movie from library
router.delete('/movies/:id', async (req: Request, res: Response) => {
  if (!radarrService.isEnabled()) {
    res.status(503).json({ error: 'Radarr is not configured' })
    return
  }

  const id = parseInt(req.params.id, 10)
  const deleteFiles = req.query.deleteFiles === 'true'

  const success = await radarrService.deleteMovie(id, deleteFiles)
  res.json({ success })
})

// Get movie calendar (upcoming releases)
router.get('/movies/calendar', async (req: Request, res: Response) => {
  if (!radarrService.isEnabled()) {
    res.status(503).json({ error: 'Radarr is not configured' })
    return
  }

  const startDate = req.query.start ? new Date(req.query.start as string) : undefined
  const endDate = req.query.end ? new Date(req.query.end as string) : undefined

  const movies = await radarrService.getCalendar(startDate, endDate)
  res.json({ movies })
})

// Get Radarr root folders
router.get('/movies/rootfolders', async (req: Request, res: Response) => {
  if (!radarrService.isEnabled()) {
    res.status(503).json({ error: 'Radarr is not configured' })
    return
  }

  const folders = await radarrService.getRootFolders()
  res.json({ folders })
})

// Get Radarr quality profiles
router.get('/movies/profiles', async (req: Request, res: Response) => {
  if (!radarrService.isEnabled()) {
    res.status(503).json({ error: 'Radarr is not configured' })
    return
  }

  const profiles = await radarrService.getQualityProfiles()
  res.json({ profiles })
})

// ============ SONARR ROUTES ============

// Get all series in library
router.get('/series', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const series = await sonarrService.getSeries()
  res.json({ series })
})

// Check if series is in library by TVDB ID
router.get('/series/check/:tvdbId', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.json({ inLibrary: false, enabled: false })
    return
  }

  const tvdbId = parseInt(req.params.tvdbId, 10)
  const series = await sonarrService.getSeriesByTvdbId(tvdbId)

  res.json({
    inLibrary: !!series,
    enabled: true,
    series: series || undefined
  })
})

// Lookup series by TMDB ID (for integration with TMDB-based UI)
router.get('/series/lookup/tmdb/:tmdbId', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const tmdbId = parseInt(req.params.tmdbId, 10)
  const series = await sonarrService.lookupSeriesByTmdbId(tmdbId)

  res.json({ series })
})

// Add series to library
router.post('/series', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const { tvdbId, title, searchForMissingEpisodes } = req.body

  if (!tvdbId || !title) {
    res.status(400).json({ error: 'tvdbId and title are required' })
    return
  }

  const series = await sonarrService.addSeries({
    tvdbId,
    title,
    searchForMissingEpisodes: searchForMissingEpisodes ?? false
  })

  if (series) {
    res.json({ success: true, series })
  } else {
    res.status(500).json({ error: 'Failed to add series to library' })
  }
})

// Delete series from library
router.delete('/series/:id', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const id = parseInt(req.params.id, 10)
  const deleteFiles = req.query.deleteFiles === 'true'

  const success = await sonarrService.deleteSeries(id, deleteFiles)
  res.json({ success })
})

// Get upcoming episodes (calendar)
router.get('/series/calendar', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const days = req.query.days ? parseInt(req.query.days as string, 10) : 7
  const episodes = await sonarrService.getUpcoming(days)

  // Get all series to include series info with episodes
  const allSeries = await sonarrService.getSeries()
  const seriesMap = new Map(allSeries.map(s => [s.id, s]))

  // Enrich episodes with series info
  const enrichedEpisodes = episodes.map(ep => ({
    ...ep,
    series: seriesMap.get(ep.seriesId) || null
  }))

  res.json({ episodes: enrichedEpisodes })
})

// Get full series details including seasons stats by Sonarr series ID
router.get('/series/:seriesId', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const seriesId = parseInt(req.params.seriesId, 10)
  const series = await sonarrService.getSeriesById(seriesId)

  if (!series) {
    res.status(404).json({ error: 'Series not found' })
    return
  }

  res.json({ series })
})

// Get episodes for a series by Sonarr series ID
router.get('/series/:seriesId/episodes', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const seriesId = parseInt(req.params.seriesId, 10)
  const episodes = await sonarrService.getEpisodes(seriesId)

  res.json({ episodes })
})

// Get Sonarr root folders
router.get('/series/rootfolders', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const folders = await sonarrService.getRootFolders()
  res.json({ folders })
})

// Get Sonarr quality profiles
router.get('/series/profiles', async (req: Request, res: Response) => {
  if (!sonarrService.isEnabled()) {
    res.status(503).json({ error: 'Sonarr is not configured' })
    return
  }

  const profiles = await sonarrService.getQualityProfiles()
  res.json({ profiles })
})

export default router
