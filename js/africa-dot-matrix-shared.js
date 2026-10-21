/* Shared Africa dot-matrix geometry for both homepage canvases. No dependencies. */
(function (global) {
  'use strict';
  var BOUNDS = Object.freeze({ minLon: -20, maxLon: 55, minLat: -37, maxLat: 39 });
  var POLYGON = [
    [-17.5,14.7],[-16.8,21.0],[-13.0,27.7],[-8.7,27.3],[-5.5,35.8],[-1.0,35.2],
    [3.0,36.0],[9.5,37.0],[11.0,33.0],[25.0,31.5],[34.0,31.0],[36.8,22.0],
    [43.0,12.7],[51.0,11.5],[49.0,2.0],[42.0,-4.5],[40.5,-11.0],[35.0,-17.0],
    [35.8,-24.5],[32.9,-29.5],[28.5,-34.8],[25.0,-34.7],[19.0,-34.8],[16.5,-28.5],
    [12.5,-17.0],[12.0,-6.0],[8.5,4.5],[2.0,5.5],[-4.5,5.0],[-8.5,4.0],
    [-12.0,7.0],[-16.5,12.0]
  ];
  function pointInPolygon(lon, lat) {
    var inside = false;
    for (var i = 0, j = POLYGON.length - 1; i < POLYGON.length; j = i++) {
      var a = POLYGON[i], b = POLYGON[j];
      if (((a[1] > lat) !== (b[1] > lat)) &&
          (lon < ((b[0] - a[0]) * (lat - a[1])) / ((b[1] - a[1]) || 0.000001) + a[0])) inside = !inside;
    }
    return inside;
  }
  function project(lon, lat, rect, bounds) {
    var b = bounds || BOUNDS;
    return { x: rect.left + ((lon - b.minLon) / (b.maxLon - b.minLon)) * rect.width,
      y: rect.top + ((b.maxLat - lat) / (b.maxLat - b.minLat)) * rect.height };
  }
  function unproject(x, y, rect, bounds) {
    var b = bounds || BOUNDS;
    return { lon: b.minLon + ((x - rect.left) / rect.width) * (b.maxLon - b.minLon),
      lat: b.maxLat - ((y - rect.top) / rect.height) * (b.maxLat - b.minLat) };
  }
  global.AfricaDotMatrixShared = { bounds: BOUNDS, polygon: POLYGON, pointInPolygon: pointInPolygon, project: project, unproject: unproject };
}(window));
