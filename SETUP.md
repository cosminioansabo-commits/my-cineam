# My Cinema - Complete Setup Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Local Development](#local-development)
5. [NAS Deployment](#nas-deployment)
6. [Service Configuration](#service-configuration)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

---

## Overview

My Cinema is a self-hosted media management application that provides:

- **Media Discovery**: Browse movies and TV shows using TMDB API
- **Torrent Search**: Search across multiple torrent providers (Prowlarr, Torrentio, YTS)
- **Download Management**: Queue downloads to qBittorrent
- **Library Integration**: Add media to Radarr/Sonarr for automatic organization
- **Auto-Updates**: Watchtower monitors for new Docker images

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vue 3 + TypeScript + PrimeVue + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | None (stateless) |
| Containerization | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Registry | GitHub Container Registry (ghcr.io) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROUTER (Port Forwarding)                         │
│   Port 8081 → Frontend    Port 3001 → Backend    Port 6881 → qBittorrent│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              UGREEN NAS                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Docker Network: my-cinema-network            │   │
│  │                                                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │   Frontend   │  │   Backend    │  │  Watchtower  │           │   │
│  │  │   (nginx)    │  │  (Node.js)   │  │ (auto-update)│           │   │
│  │  │   :8081      │  │   :3001      │  │              │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  │         │                 │                                       │   │
│  │         │                 ▼                                       │   │
│  │         │    ┌────────────────────────────────────────┐          │   │
│  │         │    │           Service Layer                 │          │   │
│  │         │    │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │          │   │
│  │         │    │  │qBittor- │ │ Prowlarr│ │  Radarr │   │          │   │
│  │         │    │  │  rent   │ │  :9696  │ │  :7878  │   │          │   │
│  │         │    │  │  :8080  │ └─────────┘ └─────────┘   │          │   │
│  │         │    │  └─────────┘      │      ┌─────────┐   │          │   │
│  │         │    │       │           │      │  Sonarr │   │          │   │
│  │         │    │       │           └──────│  :8989  │   │          │   │
│  │         │    │       │                  └─────────┘   │          │   │
│  │         │    └───────┼────────────────────────────────┘          │   │
│  │         │            │                                            │   │
│  └─────────┼────────────┼────────────────────────────────────────────┘   │
│            │            │                                                │
│  ┌─────────┴────────────┴────────────────────────────────────────────┐  │
│  │                        Storage Volumes                             │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────────┐ │  │
│  │  │  Volume2 (SSD) - Config │  │  Volume1 (HDD) - Media          │ │  │
│  │  │  /volume2/docker/       │  │  /volume1/data/                 │ │  │
│  │  │  ├── qbittorrent/       │  │  ├── downloads/                 │ │  │
│  │  │  ├── radarr/            │  │  ├── movies/                    │ │  │
│  │  │  ├── sonarr/            │  │  └── tv/                        │ │  │
│  │  │  ├── prowlarr/          │  │                                 │ │  │
│  │  │  └── my-cinema/         │  │  (Hardlinks between downloads   │ │  │
│  │  │      ├── .env           │  │   and media folders)            │ │  │
│  │  │      └── docker-compose*│  │                                 │ │  │
│  │  └─────────────────────────┘  └─────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User browses media** → Frontend fetches from TMDB API
2. **User searches torrents** → Backend queries Prowlarr/Torrentio/YTS
3. **User downloads torrent** → Backend sends to qBittorrent
4. **Download completes** → Radarr/Sonarr detects and imports with hardlinks
5. **Code pushed to GitHub** → Actions build images → Watchtower updates containers

---

## Prerequisites

### Required Accounts & API Keys

| Service | Purpose | Get it from |
|---------|---------|-------------|
| TMDB API Key | Movie/TV metadata | https://www.themoviedb.org/settings/api |
| GitHub Account | Container registry | https://github.com |
| Dynamic DNS (optional) | External access | Your DNS provider |

### Hardware Requirements

- **NAS**: UGREEN, Synology, or any Docker-capable NAS
- **Storage**:
  - SSD recommended for Docker configs (faster database access)
  - HDD for media storage (capacity over speed)
- **RAM**: 4GB minimum, 8GB recommended
- **Network**: Gigabit LAN recommended

---

## Local Development

### 1. Clone Repository

```bash
git clone https://github.com/cosminioansabo-commits/my-cinema.git
cd my-cinema
```

### 2. Install Dependencies

```bash
# Frontend
npm install

# Backend
cd server
npm install
cd ..
```

### 3. Configure Environment

Create `.env` in project root:
```env
VITE_TMDB_API_KEY=your_tmdb_api_key
VITE_TORRENT_API_URL=http://localhost:3001
```

Create `server/.env`:
```env
PORT=3001
CORS_ORIGIN=http://localhost:5173
DOWNLOAD_PATH=./downloads

# Prowlarr
PROWLARR_URL=http://localhost:9696
PROWLARR_API_KEY=your_prowlarr_api_key

# qBittorrent
QBITTORRENT_URL=http://localhost:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your_password

# Radarr
RADARR_URL=http://localhost:7878
RADARR_API_KEY=your_radarr_api_key

# Sonarr
SONARR_URL=http://localhost:8989
SONARR_API_KEY=your_sonarr_api_key
```

### 4. Start Development Servers

```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
cd server
npm run dev
```

Access at http://localhost:5173

---

## NAS Deployment

### Step 1: GitHub Setup

#### 1.1 Push Code to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/my-cinema.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

#### 1.2 Add GitHub Secrets

Go to Repository → Settings → Secrets and variables → Actions

| Secret Name | Value |
|-------------|-------|
| `VITE_TMDB_API_KEY` | Your TMDB API key |
| `VITE_TORRENT_API_URL` | `http://your-domain:3001` |

#### 1.3 Enable GitHub Packages

Repository → Settings → Actions → General:
- Workflow permissions: **Read and write permissions**
- Allow GitHub Actions to create and approve pull requests: ✅

### Step 2: NAS Folder Structure

SSH into your NAS:

```bash
# Media folders on HDD (large storage)
mkdir -p /volume1/data/downloads
mkdir -p /volume1/data/movies
mkdir -p /volume1/data/tv

# Docker configs on SSD (fast access)
mkdir -p /volume2/docker/qbittorrent
mkdir -p /volume2/docker/radarr
mkdir -p /volume2/docker/sonarr
mkdir -p /volume2/docker/prowlarr
mkdir -p /volume2/docker/my-cinema

# Set permissions
sudo chmod -R 777 /volume1/data
```

### Step 3: Find User/Group IDs

```bash
id your-username
# Example output: uid=1000(admin) gid=1000(users)
# Use PUID=1000 and PGID=1000 in configs
```

### Step 4: Copy Docker Compose Files

Copy these files to `/volume2/docker/my-cinema/`:

- `docker-compose.qbittorrent.yml`
- `docker-compose.prowlarr.yml`
- `docker-compose.radarr.yml`
- `docker-compose.sonarr.yml`
- `docker-compose.my-cinema.yml`
- `docker-compose.watchtower.yml`

### Step 5: Create Environment File

Create `/volume2/docker/my-cinema/.env`:

```env
# GitHub
GITHUB_USERNAME=your-github-username

# Network
NAS_IP=your-domain.com:8081

# User/Group IDs (from Step 3)
PUID=1000
PGID=1000
TZ=Europe/Bucharest

# qBittorrent
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-secure-password

# API Keys (fill after services start)
PROWLARR_API_KEY=
RADARR_API_KEY=
SONARR_API_KEY=
```

### Step 6: Login to GitHub Container Registry

Create a Personal Access Token:
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scope: `read:packages`
4. Copy the token

On NAS:
```bash
sudo sh -c 'echo "ghp_your_token" | docker login ghcr.io -u YOUR_USERNAME --password-stdin'
```

### Step 7: Deploy Services (In Order)

```bash
cd /volume2/docker/my-cinema

# 1. qBittorrent (download client)
sudo docker compose -f docker-compose.qbittorrent.yml up -d

# 2. Prowlarr (indexer manager)
sudo docker compose -f docker-compose.prowlarr.yml up -d

# 3. Radarr (movies) & Sonarr (TV)
sudo docker compose -f docker-compose.radarr.yml up -d
sudo docker compose -f docker-compose.sonarr.yml up -d

# 4. Connect services to network
sudo docker network connect my-cinema-network qbittorrent
sudo docker network connect my-cinema-network radarr
sudo docker network connect my-cinema-network sonarr
sudo docker network connect my-cinema-network prowlarr

# 5. Get API keys from each service (see Service Configuration below)
# Then update .env with the API keys

# 6. My Cinema app
sudo docker compose -f docker-compose.my-cinema.yml up -d

# 7. Watchtower (auto-updates)
sudo docker compose -f docker-compose.watchtower.yml up -d
```

### Step 8: Router Port Forwarding

Configure your router to forward these ports to your NAS:

| Service | External Port | Internal Port | Protocol |
|---------|---------------|---------------|----------|
| Frontend | 8081 | 8081 | TCP |
| Backend | 3001 | 3001 | TCP |
| qBittorrent | 6881 | 6881 | TCP+UDP |

---

## Service Configuration

### qBittorrent

**Access**: http://NAS_IP:8080

**Default Login**: admin / adminadmin

**Initial Setup**:
1. Change password immediately: Settings → WebUI → Password
2. Set default save path: Settings → Downloads → Default Save Path: `/data/downloads`
3. Add categories:
   - Category: `radarr`, Path: `/data/downloads/movies`
   - Category: `sonarr`, Path: `/data/downloads/tv`
4. Connection settings: Settings → Connection → Listening Port: `6881`

### Prowlarr

**Access**: http://NAS_IP:9696

**Get API Key**: Settings → General → API Key

**Setup**:

1. **Add Indexers**: Settings → Indexers → Add your preferred indexers

2. **Add Download Client**:
   - Settings → Download Clients → + → qBittorrent
   - Host: `qbittorrent`
   - Port: `8080`
   - Username: `admin`
   - Password: your qBittorrent password

3. **Add Apps** (to sync indexers):
   - Settings → Apps → + → Radarr
     - Prowlarr Server: `http://prowlarr:9696`
     - Radarr Server: `http://radarr:7878`
     - API Key: (from Radarr)
   - Settings → Apps → + → Sonarr
     - Prowlarr Server: `http://prowlarr:9696`
     - Sonarr Server: `http://sonarr:8989`
     - API Key: (from Sonarr)

4. Click **Sync App Indexers** to push indexers to Radarr/Sonarr

### Radarr

**Access**: http://NAS_IP:7878

**Get API Key**: Settings → General → API Key

**Setup**:

1. **Root Folder**: Settings → Media Management → Add Root Folder → `/data/movies`

2. **Enable Hardlinks**:
   - Settings → Media Management → Show Advanced
   - Use Hardlinks instead of Copy: ✅

3. **Download Client**:
   - Settings → Download Clients → + → qBittorrent
   - Host: `qbittorrent`
   - Port: `8080`
   - Category: `radarr`

### Sonarr

**Access**: http://NAS_IP:8989

**Get API Key**: Settings → General → API Key

**Setup**:

1. **Root Folder**: Settings → Media Management → Add Root Folder → `/data/tv`

2. **Enable Hardlinks**:
   - Settings → Media Management → Show Advanced
   - Use Hardlinks instead of Copy: ✅

3. **Download Client**:
   - Settings → Download Clients → + → qBittorrent
   - Host: `qbittorrent`
   - Port: `8989`
   - Category: `sonarr`

---

## Troubleshooting

### Common Issues

#### 1. CORS Errors

**Symptom**: Browser console shows "Access-Control-Allow-Origin" errors

**Solution**:
```bash
# Check .env has correct NAS_IP
cat /volume2/docker/my-cinema/.env | grep NAS_IP

# Should be: NAS_IP=your-domain:8081

# Recreate container (not just restart)
sudo docker compose -f docker-compose.my-cinema.yml down
sudo docker compose -f docker-compose.my-cinema.yml up -d
```

#### 2. Container Can't Find Other Services

**Symptom**: Error "getaddrinfo ENOTFOUND qbittorrent"

**Solution**: Connect containers to the same network
```bash
sudo docker network connect my-cinema-network qbittorrent
sudo docker network connect my-cinema-network radarr
sudo docker network connect my-cinema-network sonarr
sudo docker network connect my-cinema-network prowlarr
```

#### 3. qBittorrent 403 Forbidden

**Symptom**: Backend logs show "Forbidden" when accessing qBittorrent

**Solution**: Check password in .env matches qBittorrent WebUI password
```bash
# Verify password
cat /volume2/docker/my-cinema/.env | grep QBITTORRENT

# Recreate backend
sudo docker compose -f docker-compose.my-cinema.yml down
sudo docker compose -f docker-compose.my-cinema.yml up -d
```

#### 4. Torrents Stalled / Trackers Unreachable

**Symptom**: Trackers show "skipping tracker announce (unreachable)"

**Solution**: Add DNS to qBittorrent container

Edit `docker-compose.qbittorrent.yml`:
```yaml
services:
  qbittorrent:
    dns:
      - 8.8.8.8
      - 8.8.4.4
```

Then recreate:
```bash
sudo docker compose -f docker-compose.qbittorrent.yml down
sudo docker compose -f docker-compose.qbittorrent.yml up -d
```

#### 5. Permission Denied Creating Folders

**Symptom**: Backend fails with "EACCES: permission denied, mkdir '/data/downloads'"

**Solution**:
```bash
sudo chmod -R 777 /volume1/data
```

#### 6. Docker Images Not Found

**Symptom**: "manifest unknown" error when pulling images

**Solution**:
1. Check GitHub Actions completed successfully
2. Verify image names match repository name
3. Re-login to ghcr.io:
```bash
sudo sh -c 'echo "ghp_token" | docker login ghcr.io -u USERNAME --password-stdin'
```

### Useful Commands

```bash
# View container logs
sudo docker logs my-cinema-backend --tail 100
sudo docker logs my-cinema-frontend --tail 100
sudo docker logs qbittorrent --tail 100

# Restart a service
sudo docker compose -f docker-compose.my-cinema.yml restart my-cinema-backend

# Recreate containers (applies .env changes)
sudo docker compose -f docker-compose.my-cinema.yml down
sudo docker compose -f docker-compose.my-cinema.yml up -d

# Check container status
sudo docker ps

# Check network connections
sudo docker network inspect my-cinema-network

# Check disk usage
du -sh /volume1/data/*
df -h /volume1
```

---

## Maintenance

### Auto-Updates with Watchtower

Watchtower automatically checks for new Docker images every 5 minutes.

**How it works**:
1. Push code to GitHub
2. GitHub Actions builds new images
3. Images pushed to ghcr.io
4. Watchtower detects new images
5. Containers automatically updated

**Check Watchtower logs**:
```bash
sudo docker logs watchtower --tail 50
```

### Manual Updates

```bash
cd /volume2/docker/my-cinema

# Pull latest images
sudo docker compose -f docker-compose.my-cinema.yml pull

# Recreate with new images
sudo docker compose -f docker-compose.my-cinema.yml up -d
```

### Backup

**What to backup**:
- `/volume2/docker/` - All service configs and databases
- `/volume2/docker/my-cinema/.env` - Your secrets

**Backup command**:
```bash
tar -czvf backup-$(date +%Y%m%d).tar.gz /volume2/docker/
```

### Hardlinks Explained

Hardlinks allow the same file to exist in multiple locations without duplicating data.

**How it works**:
```
/data/downloads/Movie.mkv  ←──┐
                              ├── Same file data (3.5GB)
/data/movies/Movie/Movie.mkv ←┘
```

**Benefits**:
- Continue seeding from downloads folder
- Organized library in movies/tv folders
- No duplicate disk space used

**Verify hardlinks**:
```bash
# Check link count (should be 2+)
ls -li /volume1/data/movies/*/

# Check actual disk usage
du -sh /volume1/data/*
# downloads: shows actual size
# movies/tv: shows 0 (hardlinked)
```

### Storage Path Reference

| Container Path | NAS Path | Purpose |
|----------------|----------|---------|
| `/data` | `/volume1/data` | Media storage |
| `/data/downloads` | `/volume1/data/downloads` | Torrent downloads |
| `/data/movies` | `/volume1/data/movies` | Radarr library |
| `/data/tv` | `/volume1/data/tv` | Sonarr library |
| `/config` | `/volume2/docker/{service}` | Service configs |

---

## Port Reference

| Service | Container Port | Host Port | URL |
|---------|---------------|-----------|-----|
| Frontend | 80 | 8081 | http://NAS:8081 |
| Backend | 3001 | 3001 | http://NAS:3001 |
| qBittorrent WebUI | 8080 | 8080 | http://NAS:8080 |
| qBittorrent BT | 6881 | 6881 | - |
| Prowlarr | 9696 | 9696 | http://NAS:9696 |
| Radarr | 7878 | 7878 | http://NAS:7878 |
| Sonarr | 8989 | 8989 | http://NAS:8989 |

---

## Security Considerations

1. **Change default passwords** for all services immediately
2. **Use strong passwords** stored in .env file
3. **Don't expose** Radarr/Sonarr/Prowlarr to the internet unless necessary
4. **Use a VPN** if your ISP blocks torrents
5. **Firewall rules**: Only forward necessary ports (8081, 3001, 6881)
6. **HTTPS**: Consider adding a reverse proxy (Nginx Proxy Manager) for SSL

---

## Support

- **Issues**: https://github.com/cosminioansabo-commits/my-cinema/issues
- **TMDB API**: https://developers.themoviedb.org/3
- **Radarr Wiki**: https://wiki.servarr.com/radarr
- **Sonarr Wiki**: https://wiki.servarr.com/sonarr
- **Prowlarr Wiki**: https://wiki.servarr.com/prowlarr
