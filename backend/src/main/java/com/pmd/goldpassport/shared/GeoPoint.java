package com.pmd.goldpassport.shared;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.Optional;

/** A WGS84 coordinate. */
public record GeoPoint(double latitude, double longitude) {

    private static final double EARTH_RADIUS_KM = 6371.0088;

    public GeoPoint {
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new BadRequestException("INVALID_COORDINATES", "Latitude must be within [-90, 90] and longitude within [-180, 180]");
        }
    }

    /** Great-circle distance in kilometres (haversine). */
    public double distanceKm(GeoPoint other) {
        double dLat = Math.toRadians(other.latitude - latitude);
        double dLon = Math.toRadians(other.longitude - longitude);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(latitude)) * Math.cos(Math.toRadians(other.latitude))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    /** Rounds to 2 decimals (roughly 1 km) for privacy-preserving public display. */
    public GeoPoint approximate() {
        return new GeoPoint(round2(latitude), round2(longitude));
    }

    /** Simple arithmetic centroid; adequate for points that are a few km apart. */
    public static Optional<GeoPoint> centroid(Collection<GeoPoint> points) {
        if (points == null || points.isEmpty()) {
            return Optional.empty();
        }
        double lat = 0;
        double lon = 0;
        for (GeoPoint p : points) {
            lat += p.latitude;
            lon += p.longitude;
        }
        return Optional.of(new GeoPoint(lat / points.size(), lon / points.size()));
    }

    private static double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
