---
title: "Caching Geospatial Queries Without a Specialized Geo Database"
date: 2026-07-14T15:00:00+07:00
draft: false
tags: ["go", "geospatial", "postgres"]
summary: "You don't need PostGIS or a geohash library to cache repeat road-distance lookups — rounding coordinates and a unique index gets you most of the win."
---

In [the previous post]({{< ref "self-hosting-a-routing-engine" >}}) we
self-hosted [OSRM](https://project-osrm.org/) so distance calculations don't
depend on a metered maps API. OSRM answers in milliseconds even against a
country-sized graph — but at real traffic volumes, the cheapest query is the
one you don't make at all. If your app repeatedly asks the distance between
the same office and the same job site, or the same warehouse and the same
few delivery zones, that's a cache-hit rate waiting to be collected.

The instinct is to reach for something geospatial-native — PostGIS, a
geohash library, an R-tree. For exact-match lookups on a bounded set of
recurring routes, that's more machinery than the problem needs. Plain
Postgres, one rounding function, and a unique index cover it.

## The key insight: round before you key

GPS coordinates typically arrive with far more precision than the question
needs. `13.723456789, 100.529099` and `13.723444444, 100.529050` are about a
meter apart — for routing purposes, the same point. If you cache on raw
float coordinates, you get a cache miss every time GPS jitter changes the
9th decimal place, which is close to always.

Round to 4 decimal places instead — about 11 meters of precision, plenty for
"which route is this":

```go
func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
}
```

```
round4(13.723456789)  = 13.7235
round4(13.723444444)  = 13.7234
round4(100.529099)    = 100.5291
round4(100.529050)    = 100.5291   // ties round up, same as math.Round elsewhere
```

That single function is doing the job a geohash would do — bucketing nearby
points together — without adding a dependency or a new data type.

## The schema

```sql
CREATE TABLE IF NOT EXISTS distance_cache (
    id           BIGSERIAL PRIMARY KEY,
    from_lat     NUMERIC(9,6) NOT NULL,
    from_lon     NUMERIC(9,6) NOT NULL,
    to_lat       NUMERIC(9,6) NOT NULL,
    to_lon       NUMERIC(9,6) NOT NULL,
    distance_km  NUMERIC(10,3) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_lat, from_lon, to_lat, to_lon)
);

CREATE INDEX IF NOT EXISTS idx_distance_cache_lookup
    ON distance_cache (from_lat, from_lon, to_lat, to_lon);
```

The `UNIQUE` constraint is doing double duty: it's the cache key *and* it's
what makes an `ON CONFLICT` upsert possible, so a cache write is a single
statement rather than a check-then-insert race.

> A composite unique index on four columns works here because a route is
> always queried as a specific ordered pair — `from → to`. If your app also
> needs `to → from` to hit the same cache row, round and sort the pair
> consistently before keying, or you'll silently double your storage and
> your miss rate.

## Reading and writing

```go
// Get returns (distanceKm, true) on cache hit, (0, false) on miss.
func (s *Store) Get(ctx context.Context, fromLat, fromLon, toLat, toLon float64) (float64, bool, error) {
	fLat, fLon, tLat, tLon := round4(fromLat), round4(fromLon), round4(toLat), round4(toLon)

	var km float64
	err := s.db.QueryRowContext(ctx,
		`SELECT distance_km FROM distance_cache
         WHERE from_lat=$1 AND from_lon=$2 AND to_lat=$3 AND to_lon=$4`,
		fLat, fLon, tLat, tLon,
	).Scan(&km)

	if err == sql.ErrNoRows {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("cache get: %w", err)
	}
	return km, true, nil
}

// Set inserts or updates a cached distance.
func (s *Store) Set(ctx context.Context, fromLat, fromLon, toLat, toLon, km float64) error {
	fLat, fLon, tLat, tLon := round4(fromLat), round4(fromLon), round4(toLat), round4(toLon)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO distance_cache (from_lat, from_lon, to_lat, to_lon, distance_km)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (from_lat, from_lon, to_lat, to_lon)
         DO UPDATE SET distance_km=$5, created_at=NOW()`,
		fLat, fLon, tLat, tLon, km,
	)
	return err
}
```

## Wiring it in front of OSRM

The handler tries the cache first and only falls through to OSRM on a miss,
treating cache errors as non-fatal — a cache that's down should degrade to
"slower," never to "broken":

```go
func (h *Handler) Distance(w http.ResponseWriter, r *http.Request) {
	var req distanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	ctx := r.Context()

	km, hit, err := h.cache.Get(ctx, req.From.Lat, req.From.Lon, req.To.Lat, req.To.Lon)
	if err != nil {
		log.Printf("cache get error: %v", err) // non-fatal: fall through to OSRM
	}
	if hit {
		writeJSON(w, distanceResponse{DistanceKm: km, Cached: true})
		return
	}

	km, err = h.osrm.RoadDistanceKm(ctx, req.From.Lat, req.From.Lon, req.To.Lat, req.To.Lon)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not calculate distance")
		return
	}

	if err := h.cache.Set(ctx, req.From.Lat, req.From.Lon, req.To.Lat, req.To.Lon, km); err != nil {
		log.Printf("cache set error: %v", err) // non-fatal
	}
	writeJSON(w, distanceResponse{DistanceKm: km, Cached: false})
}
```

That `Cached` field in the response isn't just debug noise — exposing it
makes cache-hit rate observable from the outside without needing to add
metrics plumbing before you've decided whether you need any.

## Where this approach stops working

Rounded-coordinate caching is a good fit specifically because the traffic is
**exact-match repeats** — the same handful of real-world places, queried
over and over. It stops being the right tool once the questions change
shape:

- **"Points within N km of here"** — a proximity/radius query needs an
  actual spatial index (PostGIS `GIST` on a `geography` column, or
  equivalent) — a unique index on rounded columns can't answer "nearby,"
  only "identical."
- **Unbounded, low-repeat coordinates** — if every query is between two
  points that have never been queried before (e.g. live GPS breadcrumbs),
  cache hit rate approaches zero and the table just grows forever with no
  benefit. Add a TTL/eviction policy, or don't cache at all.
- **Sub-11-meter precision requirements** — round4 buys ~11m buckets;
  tighten the rounding if your use case needs finer-grained distinction
  between very close points, at the cost of more distinct cache rows.

For the common case this was built for — recurring routes between a bounded
set of known locations — a table, a rounding function, and a unique index
outperform the complexity of a geospatial engine you'd otherwise have to run
and operate for the same result.
