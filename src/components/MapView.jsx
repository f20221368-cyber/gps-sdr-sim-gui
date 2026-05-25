import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Style, Icon, Stroke } from 'ol/style';
import Draw from 'ol/interaction/Draw';
import LineString from 'ol/geom/LineString';

const MapView = ({ selectedLocation, simulatedLocation, trajectoryPoints = [], onMapClick, mapRef, isDrawing, onDrawingFinished }) => {
  const mapElement = useRef();
  const markerSource = useRef(new VectorSource());
  const drawSource = useRef(new VectorSource());
  const drawInteraction = useRef(null);

  useEffect(() => {
    // Initializing OpenLayers Map
    const initialMap = new Map({
      target: mapElement.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        new VectorLayer({
          source: markerSource.current,
        }),
        new VectorLayer({
          source: drawSource.current,
          style: new Style({
            stroke: new Stroke({
              color: '#ffcc33',
              width: 4,
            }),
          }),
        }),
      ],
      view: new View({
        center: fromLonLat([78.9629, 20.5937]), // Center: India [lon, lat]
        zoom: 5,
      }),
    });

    mapRef.current = initialMap;

    // Handle map click
    initialMap.on('click', (event) => {
      const clickedCoord = toLonLat(event.coordinate);
      // [lon, lat] -> { lat, lng }
      onMapClick({
        lat: clickedCoord[1],
        lng: clickedCoord[0]
      });
    });

    return () => {
      if (initialMap) initialMap.setTarget(null);
    };
  }, []);

  // Handle Drawing Interaction Toggle
  useEffect(() => {
    if (!mapRef.current) return;

    if (isDrawing) {
      drawSource.current.clear();
      drawInteraction.current = new Draw({
        source: drawSource.current,
        type: 'LineString',
      });

      drawInteraction.current.on('drawend', (event) => {
        const geometry = event.feature.getGeometry();
        const coords = geometry.getCoordinates();
        const lonLatCoords = coords.map(c => {
          const lonLat = toLonLat(c);
          return { lat: lonLat[1], lng: lonLat[0] };
        });
        
        if (onDrawingFinished) {
          onDrawingFinished(lonLatCoords);
        }
      });

      mapRef.current.addInteraction(drawInteraction.current);
    } else {
      if (drawInteraction.current) {
        mapRef.current.removeInteraction(drawInteraction.current);
        drawInteraction.current = null;
      }
      drawSource.current.clear();
    }
  }, [isDrawing]);

  // Sync markers and view when locations change
  useEffect(() => {
    if (!mapRef.current) return;

    markerSource.current.clear();

    const features = [];

    // 1. Input/Selected Location (LARGE RED MARKER)
    if (selectedLocation) {
      const coord = fromLonLat([selectedLocation.lng, selectedLocation.lat]);
      const marker = new Feature({
        geometry: new Point(coord),
        name: 'Input Location'
      });
      marker.setStyle(new Style({
        image: new Icon({
          anchor: [0.5, 1],
          src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
          scale: 1,
        }),
      }));
      features.push(marker);
    }

    // 2. Trajectory Points (SMALL RED DOTS)
    if (trajectoryPoints && trajectoryPoints.length > 0) {
      trajectoryPoints.forEach((pt, index) => {
        const coord = fromLonLat([pt.lng, pt.lat]);
        const dot = new Feature({
          geometry: new Point(coord),
          name: `Trajectory Pt ${index}`
        });
        
        // Using a Circle for small dots to avoid loading many images
        // We'll use a Style with a circle
        dot.setStyle(new Style({
          image: new Icon({
            anchor: [0.5, 0.5],
            src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            scale: 0.3, // Scale down to look like a dot
          }),
        }));
        features.push(dot);
      });
    }

    // 3. Simulated Location (BLUE)
    if (simulatedLocation) {
      const coord = fromLonLat([simulatedLocation.lng, simulatedLocation.lat]);
      const marker = new Feature({
        geometry: new Point(coord),
        name: 'Simulated Location'
      });
      marker.setStyle(new Style({
        image: new Icon({
          anchor: [0.5, 1],
          src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
          scale: 1,
        }),
      }));
      features.push(marker);
    }

    if (features.length > 0) {
      markerSource.current.addFeatures(features);

      // Adjust view
      const extent = markerSource.current.getExtent();
      if (features.length > 1) {
        mapRef.current.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          maxZoom: 15,
          duration: 1000
        });
      } else {
        mapRef.current.getView().animate({
          center: markerSource.current.getFeatures()[0].getGeometry().getCoordinates(),
          duration: 800,
          zoom: 14,
        });
      }
    }
  }, [selectedLocation, simulatedLocation, trajectoryPoints]);

  return <div ref={mapElement} style={{ width: '100%', height: '100%' }}></div>;
};

export default MapView;
