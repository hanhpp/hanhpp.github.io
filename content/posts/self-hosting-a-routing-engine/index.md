---
title: "Self-Hosting a Routing Engine Instead of Paying Per API Call"
date: 2026-07-14T14:00:00+07:00
draft: false
tags: ["go", "geospatial", "docker"]
summary: "Road distance, not straight-line distance, is what travel expense claims and delivery pricing actually need — here's how to get it without a metered maps API."
---

If your product calculates distance between two coordinates — for a delivery
fee, a travel expense claim, a "drivers near you" radius — the tempting
default is a maps API: send two points, get back a number, pay per request.
That works, but it puts a metered, rate-limited third party in the critical
path of a calculation you might run millions of times.

The alternative is a fully open-source routing stack you run yourself:
[OpenStreetMap](https://www.openstreetmap.org/) data, preprocessed by
[OSRM](https://project-osrm.org/), served from a container you control. No
API key, no per-request billing, no external outage taking down your pricing
engine.

## Why not just use Haversine?

Straight-line (Haversine) distance is free and requires no infrastructure at
all — it's just trigonometry on two lat/lon pairs. The problem is that roads
aren't straight lines. Rivers, one-way systems, and the fact that Bangkok is
not a grid all mean actual travel distance is consistently longer than the
straight-line distance between two points:

```
  FROM                   TO                        ROAD KM  HAVERSINE KM  RATIO
  ────                   ──                        ───────  ────────────  ─────
  Silom BTS              Siam BTS                  3.33     2.59          ×1.29
  Asok                   Victory Monument          5.11     4.00          ×1.28
  Don Mueang Airport     Suvarnabhumi Airport      39.30    29.18         ×1.35
  Nonthaburi (suburban)  Silom BTS                 20.97    15.52         ×1.35
```

Bangkok routes average around **×1.3** — road distance a third longer than
straight-line — and that ratio isn't constant, it depends on the specific
geography between two points. There's no fixed multiplier you can apply to
Haversine and get something trustworthy; you have to actually route.

> If a distance figure feeds into money — reimbursement, delivery pricing,
> SLA radius — Haversine will be wrong in a way that's hard to justify later.
> It's fine for "how far away, roughly" UI, not fine for a number on an invoice.

## The stack

| Component | Role |
|---|---|
| [OpenStreetMap (OSM)](https://www.openstreetmap.org/) | Free, community-maintained map data — roads, turn restrictions, speed limits |
| [Geofabrik](https://download.geofabrik.de/) | Hosts daily per-country OSM extracts as `.osm.pbf` files |
| [OSRM](https://project-osrm.org/) | Preprocesses OSM data into a routing graph, answers distance/duration queries in milliseconds |

You need Docker and a `.osm.pbf` extract for whatever region you're routing
in. Nothing here calls out to a paid service.

## Getting the map data

Geofabrik publishes extracts per country. For Thailand:

```bash
mkdir -p osm-data
curl -L -o osm-data/thailand-latest.osm.pbf \
  https://download.geofabrik.de/asia/thailand-latest.osm.pbf
```

This file is roughly 300–400 MB — most of a country's entire road network,
free to download, no account required.

## Preprocessing: extract, partition, customize

OSRM doesn't route directly against the raw PBF — it has to build a routing
graph first, in three steps. This is the part that actually costs CPU time
(a few minutes), and it only needs to happen once per map version:

```yaml
services:
  osrm-init:
    image: ghcr.io/project-osrm/osrm-backend:latest
    volumes:
      - ./osm-data:/pbf:ro
      - osrm_data:/data
    entrypoint: /bin/sh
    command:
      - -c
      - |
        set -e
        osrm-extract -p /opt/car.lua /pbf/thailand-latest.osm.pbf -o /data/thailand.osrm
        osrm-partition /data/thailand.osrm
        osrm-customize /data/thailand.osrm

  osrm:
    image: ghcr.io/project-osrm/osrm-backend:latest
    volumes:
      - osrm_data:/data
    command: osrm-routed --algorithm mld /data/thailand.osrm
    ports:
      - "5000:5000"
    restart: unless-stopped
    depends_on:
      osrm-init:
        condition: service_completed_successfully

volumes:
  osrm_data:
```

- **`osrm-extract`** reads the PBF and a routing profile (`car.lua` ships
  with the image) to build the base graph — this is where "which roads can
  cars use, and at what speed" gets decided.
- **`osrm-partition`** and **`osrm-customize`** prepare the graph for the
  `mld` (multi-level Dijkstra) query algorithm, which is what makes queries
  against a country-sized graph return in milliseconds instead of seconds.
- The `osrm` service only starts once `osrm-init` exits successfully, so a
  single `docker compose up -d` handles first-run preprocessing and every
  subsequent restart correctly — restarts skip straight to serving, since the
  processed graph is sitting in the `osrm_data` volume.

```bash
docker compose up -d
docker compose logs -f osrm-init   # watch preprocessing progress
```

OSRM is ready when it's listening on `http://localhost:5000`.

## Querying it

OSRM's HTTP API takes coordinates in `lon,lat` order — the GeoJSON
convention, and the opposite of the `lat,lon` order most map UIs use. This is
the single easiest mistake to make integrating against it:

```bash
curl "http://localhost:5000/route/v1/driving/100.5352,13.7563;100.5018,13.7466?overview=false"
```

A minimal Go client wrapping that endpoint:

```go
package osrm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	base string
	http *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{base: baseURL, http: &http.Client{Timeout: 10 * time.Second}}
}

type routeResponse struct {
	Code   string `json:"code"`
	Routes []struct {
		Distance float64 `json:"distance"` // meters
		Duration float64 `json:"duration"` // seconds
	} `json:"routes"`
}

// RoadDistanceKm returns the shortest road distance in kilometers between two points.
func (c *Client) RoadDistanceKm(ctx context.Context, fromLat, fromLon, toLat, toLon float64) (float64, error) {
	url := fmt.Sprintf(
		"%s/route/v1/driving/%f,%f;%f,%f?overview=false&alternatives=false",
		c.base, fromLon, fromLat, toLon, toLat,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("osrm request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("osrm returned status %d", resp.StatusCode)
	}

	var result routeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("osrm decode: %w", err)
	}
	if result.Code != "Ok" || len(result.Routes) == 0 {
		return 0, fmt.Errorf("osrm: no route found (code=%s)", result.Code)
	}

	return result.Routes[0].Distance / 1000.0, nil
}
```

`overview=false` skips returning the full route geometry — worth setting
explicitly if all you need is the distance number, since the polyline for a
40km route is a lot of payload you'd otherwise discard.

## What this costs instead of money

Nothing per-request, but it isn't free in the way "no external dependency"
sounds:

- **Disk and memory** for the processed graph — a whole-country graph is
  sized in gigabytes, not megabytes.
- **Map freshness is on you** — Geofabrik extracts update daily, but your
  running graph is frozen until you re-run extract/partition/customize
  against a newer PBF.
- **You own the failure mode** — if the container falls over, that's your
  on-call, not a status page you can just check.

For a service making a meaningful volume of distance queries, that trade is
usually worth it. For an occasional lookup, a paid API's simplicity may still
win — the point isn't that self-hosting is always right, it's that it's a
real option once volume or cost makes the metered version uncomfortable.

## Next: don't ask OSRM the same question twice

Preprocessing gets queries down to milliseconds, but at real traffic volumes
— the same handful of office-to-site routes queried over and over for
expense claims, say — even a millisecond round-trip adds up, and there's no
reason to recompute a route that hasn't changed. The next post covers caching
these queries in a plain Postgres table, without reaching for a specialized
geo database.
