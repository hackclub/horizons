import { Injectable, Logger } from '@nestjs/common';

interface GeoResult {
  lat: number;
  lng: number;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private cache = new Map<string, GeoResult | null>();

  async geocodeCountry(country: string): Promise<GeoResult | null> {
    const key = country.toLowerCase().trim();
    if (!key) return null;

    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    try {
      const params = new URLSearchParams({
        q: country,
        format: 'json',
        limit: '1',
        addressdetails: '0',
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            'User-Agent': 'Horizons-Admin/1.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        this.logger.warn(`Nominatim returned ${response.status} for "${country}"`);
        this.cache.set(key, null);
        return null;
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        this.logger.warn(`No geocoding result for "${country}"`);
        this.cache.set(key, null);
        return null;
      }

      const result: GeoResult = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
      this.cache.set(key, result);
      return result;
    } catch (error) {
      this.logger.warn(
        `Geocoding failed for "${country}": ${error instanceof Error ? error.message : 'unknown'}`,
      );
      this.cache.set(key, null);
      return null;
    }
  }

  async geocodeMany(countries: string[]): Promise<Map<string, GeoResult>> {
    const unique = [...new Set(countries.map((c) => c.toLowerCase().trim()))];
    const results = new Map<string, GeoResult>();

    // Resolve cached ones first
    const toFetch: string[] = [];
    for (const key of unique) {
      if (this.cache.has(key)) {
        const cached = this.cache.get(key);
        if (cached) results.set(key, cached);
      } else {
        toFetch.push(key);
      }
    }

    // Fetch uncached ones sequentially (Nominatim rate limit: 1 req/sec)
    for (const key of toFetch) {
      const result = await this.geocodeCountry(key);
      if (result) results.set(key, result);
      // Respect Nominatim's 1 req/sec rate limit
      if (toFetch.indexOf(key) < toFetch.length - 1) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    return results;
  }
}
