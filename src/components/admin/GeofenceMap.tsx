'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon broken in webpack/Next.js
import L from 'leaflet';
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

/** Recenter map when coords change */
function RecenterView({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap();
  useEffect(() => {
    // Calculate bounds manually — L.circle.getBounds() needs the circle added to map first
    const degLat = radius / 111320;
    const degLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
    const bounds = L.latLngBounds(
      [lat - degLat, lng - degLng],
      [lat + degLat, lng + degLng]
    );
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [lat, lng, radius, map]);
  return null;
}

interface GeofenceMapProps {
  lat: number;
  lng: number;
  radius: number;
}

export default function GeofenceMap({ lat, lng, radius }: GeofenceMapProps) {
  const center: [number, number] = [lat, lng];

  return (
    <MapContainer
      center={center}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center} />
      <Circle
        center={center}
        radius={radius}
        pathOptions={{
          color: '#d4af37',
          fillColor: '#d4af37',
          fillOpacity: 0.08,
          weight: 2,
          dashArray: '8 4',
        }}
      />
      <RecenterView lat={lat} lng={lng} radius={radius} />
    </MapContainer>
  );
}
