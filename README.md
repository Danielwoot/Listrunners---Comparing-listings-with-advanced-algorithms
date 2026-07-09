<div align="center">

# 🏠 LISTRUNNERS

### Comparing Listings with Advanced Algorithms

[![GitHub](https://img.shields.io/badge/GitHub-Danielwoot-181717?style=for-the-badge&logo=github)](https://github.com/Danielwoot)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tor](https://img.shields.io/badge/Tor-Anonymous%20Routing-7D4698?style=for-the-badge&logo=torproject&logoColor=white)](https://www.torproject.org/)

**A privacy-first real estate intelligence platform that compares two property listings side-by-side using Tor-routed scraping, AI-powered location analytics from Felo.ai, and a proprietary Value Index algorithm.**

---

<img src="screen.png" alt="ListRunners Screenshot" width="900"/>

</div>

---

## ⚡ What is ListRunners?

ListRunners is a self-hosted web application that lets you compare **two real estate listings** — whether you're **buying or renting** — with deep location intelligence and a calculated **Value Index** that tells you which property delivers more bang for your buck.

Unlike traditional real estate sites, ListRunners:
- 🧅 **Routes all scraping through Tor** — no IP bans, no rate limits
- 🤖 **Uses Felo.ai** as an AI search engine to resolve incomplete addresses, extract pricing, and rate neighborhood quality
- 📊 **Calculates a proprietary Value Index** that normalizes buying vs. renting on the same scale
- 📜 **Logs comparison history** with sessionStorage persistence and one-click restore

---

## 🧠 How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER INPUT                                │
│              "123 Main St.     + mode: BUY/RENT                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PARALLEL PIPELINE                             │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐ │
│  │  Tor DuckDuckGo     │    │  Felo.ai Combined Session        │ │
│  │  Onion Scraper      │    │                                  │ │
│  │                     │    │  1. Resolve full address         │ │
│  │  • DDG .onion HTML  │    │  2. Extract market price         │ │
│  │  • Redfin / Zillow  │    │  3. Rate: Safety, Schools,       │ │
│  │  • Apartments.com   │    │     Walkability, Economy         │ │
│  │  • Rent.com         │    │                                  │ │
│  └─────────┬───────────┘    └──────────────┬───────────────────┘ │
│            │                               │                     │
│            └───────────┬───────────────────┘                     │
│                        ▼                                         │
│              PRICE RESOLUTION                                    │
│         (Tor price → Felo fallback)                              │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FRONTEND RENDER                               │
│                                                                  │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────────────────┐  │
│  │  Price   │  │  2×2 Grid  │  │  Value Comparison Analysis   │  │
│  │  Card    │  │  Location  │  │  + History Log               │  │
│  │          │  │  Factors   │  │                              │  │
│  └──────────┘  └────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Features

### 🔍 Dual-Mode Property Search
> **Buying** or **Renting** — each panel lets you choose independently. Compare a rental against a purchase, or two rentals, or two purchases.

### 🧅 Tor-Routed Scraping Pipeline
> All external requests are routed through a **SOCKS5 Tor proxy** with rotating exit nodes. The backend queries DuckDuckGo's `.onion` hidden service to extract prices from Redfin, Zillow, Apartments.com, Rent.com, and more — without ever exposing your IP.

### 🤖 Felo.ai Intelligence
> A Puppeteer-driven headless browser session queries [Felo.ai](https://felo.ai/) to:
> - **Resolve incomplete addresses** (e.g., `"533 s. devon rd"` → `"533 S Devon Rd, Orange, CA 92868"`)
> - **Extract pricing** when Tor scraping fails (fallback)
> - **Rate 4 location factors** on a 0–100 scale

### 📊 Location Factors

| Factor | What It Measures |
|--------|-----------------|
| 🛡️ **Safety** | Crime rates, neighborhood safety indicators |
| 🎓 **Schools** | Nearby school quality and education ratings |
| 🚶 **Walkability** | Transit access, amenities proximity, walk score |
| 📈 **Economy** | Local job market strength, economic indicators |

The **Location Score** is the average of the 4 factors:
```
Location Score = (Safety + Schools + Walkability + Economy) / 4
```

> 📌 **Higher Value Index = Better deal.** The winning listing gets a ★ highlight.

### 📜 Comparison History Log
> Inspired by [Ghostrunners](https://github.com/Danielwoot), every completed comparison is automatically saved to `sessionStorage` with:
> - **Collapsible entries** showing both listings, prices, factors, and Value Index
> - **One-click restore** to reload a previous comparison without re-fetching
> - **Deduplication** — re-comparing the same pair updates the existing entry
> - **Clear All** button to purge history
> - Up to **20 entries** retained per session

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Docker Compose Stack                │
│                                                     │
│  ┌───────────────┐  ┌────────────┐  ┌────────────┐  │
│  │   Frontend    │  │  Backend   │  │    Tor     │  │
│  │   (Nginx)     │──│  (Node.js) │──│  (SOCKS5)  │  │
│  │               │  │            │  │            │  │
│  │  :80 → :8080  │  │   :3001    │  │   :9050    │  │
│  │               │  │            │  │            │  │
│  │  Static HTML  │  │  Express   │  │  Rotating  │  │
│  │  + /api proxy │  │  Puppeteer │  │  Exit IPs  │  │
│  └───────────────┘  └────────────┘  └────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

| Container | Image | Purpose |
|-----------|-------|---------|
| `listrunners-web` | `nginx:alpine` | Serves `code.html`, proxies `/api/*` to backend |
| `listrunners-api` | `puppeteer:22` | Express API + Puppeteer for Felo.ai + Tor scraping |
| `listrunners-tor` | `osminogin/tor-simple` | SOCKS5 proxy at `tor:9050` for anonymous routing |

---

## 🚀 Quick Start

### Prerequisites
- [Docker](https://www.docker.com/get-started) & Docker Compose installed

### 1. Clone the Repository
```bash
git clone https://github.com/Danielwoot/Listrunners---Comparing-listings-with-advanced-algorithms.git
cd Listrunners---Comparing-listings-with-advanced-algorithms
```

### 2. Launch the Stack
```bash
docker-compose up --build -d
```

### 3. Open the App
Navigate to **[http://localhost:8080](http://localhost:8080)** in your browser.

### 4. Compare Properties
1. Select **BUYING** or **RENTING** on each panel
2. Enter an address (partial addresses work — Felo.ai resolves them)
3. Hit **SEARCH →** and watch the pipeline run
4. Once both panels have results, the **Value Comparison Analysis** bar appears
5. Scroll down to see your **Comparison History**

---

## 📁 Project Structure

```
ListRunners/
├── code.html              # Frontend — full SPA (HTML + CSS + JS)
├── Dockerfile             # Frontend container (Nginx)
├── nginx.conf             # Nginx config — static files + /api proxy
├── docker-compose.yml     # Container orchestration
├── DESIGN.md              # Design documentation
├── screen.png             # Screenshot
├── .gitignore
│
└── backend/
    ├── server.js          # Express API — Tor scraping + Felo.ai pipeline
    ├── package.json       # Node.js dependencies
    └── Dockerfile         # Backend container (Puppeteer base image)
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla HTML/CSS/JS, Google Fonts (Anton, Space Mono, Archivo Narrow) |
| **Backend** | Node.js, Express, Puppeteer 22, Cheerio, node-fetch |
| **Proxy** | Tor SOCKS5 via `socks-proxy-agent` |
| **AI Engine** | [Felo.ai](https://felo.ai/) — headless Puppeteer queries |
| **Containers** | Docker Compose — Nginx, Node.js/Puppeteer, Tor |
| **Persistence** | `sessionStorage` (client-side history log) |

---

## ⚙️ Configuration

Optional API keys can be set in `docker-compose.yml` for additional pricing data sources:

| Variable | Provider | Notes |
|----------|----------|-------|
| `RENTCAST_API_KEY` | [RentCast](https://www.rentcast.io/api) | Free tier: 50 calls/month |
| `ATTOM_API_KEY` | [ATTOM Data](https://www.attomdata.com/) | Free sandbox available |

> These are **optional** — the app works fully without them using the Tor + Felo.ai pipeline.

---
<div align="center">

### Built with 🧅 Tor · 🤖 Felo.ai · 🐳 Docker

</div>
