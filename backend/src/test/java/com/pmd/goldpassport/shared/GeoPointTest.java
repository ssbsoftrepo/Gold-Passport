package com.pmd.goldpassport.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.util.List;

import org.junit.jupiter.api.Test;

class GeoPointTest {

    @Test
    void distanceLimaToNazcaIsAboutThreeHundredSeventyKm() {
        GeoPoint lima = new GeoPoint(-12.0464, -77.0428);
        GeoPoint nazca = new GeoPoint(-14.8309, -74.9389);
        assertThat(lima.distanceKm(nazca)).isCloseTo(380, within(20.0));
    }

    @Test
    void approximateRoundsToTwoDecimals() {
        GeoPoint p = new GeoPoint(-14.83456, -74.93789).approximate();
        assertThat(p.latitude()).isEqualTo(-14.83);
        assertThat(p.longitude()).isEqualTo(-74.94);
    }

    @Test
    void centroidOfPoints() {
        GeoPoint c = GeoPoint.centroid(List.of(new GeoPoint(0, 0), new GeoPoint(2, 2))).orElseThrow();
        assertThat(c.latitude()).isEqualTo(1.0);
        assertThat(c.longitude()).isEqualTo(1.0);
        assertThat(GeoPoint.centroid(List.of())).isEmpty();
    }

    @Test
    void rejectsInvalidCoordinates() {
        assertThatThrownBy(() -> new GeoPoint(91, 0)).isInstanceOf(BadRequestException.class);
    }
}
