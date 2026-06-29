import React, { useState, useRef, useEffect } from 'react';
import MapView from './MapView';
import SkyView from './SkyView';

const MapPip = ({ 
    selectedLocation, 
    simulatedLocation, 
    trajectoryPoints, 
    onMapClick, 
    isDrawing, 
    onDrawingFinished,
    simulationTime,
    rinexPath,
    forceSkyView = false
}) => {
    const [pipView, setPipView] = useState('map');
    const [isMaximized, setIsMaximized] = useState(false);
    const [isPipActive, setIsPipActive] = useState(true);
    const [satData, setSatData] = useState([]);
    const mapRef = useRef(null);

    const togglePipView = () => {
        const nextView = pipView === 'map' ? 'sky' : 'map';
        setPipView(nextView);
        if (nextView === 'sky') fetchSatData();
    };

    const toggleMaximize = () => {
        if (!isMaximized && pipView === 'sky') fetchSatData();
        setIsMaximized(!isMaximized);
    };

    const fetchSatData = async () => {
        if (!window.api || !window.api.getSatVisibility) return;
        
        // Target location
        const loc = simulatedLocation || selectedLocation || { lat: 15.39, lng: 73.88 };
        
        // Use simulationTime if provided, else fallback to current UTC
        let timeStr = simulationTime;
        if (!timeStr) {
            const now = new Date();
            const y = now.getUTCFullYear();
            const m = String(now.getUTCMonth() + 1).padStart(2, '0');
            const d = String(now.getUTCDate()).padStart(2, '0');
            const hh = String(now.getUTCHours()).padStart(2, '0');
            const mm = String(now.getUTCMinutes()).padStart(2, '0');
            const ss = String(now.getUTCSeconds()).padStart(2, '0');
            timeStr = `${y}/${m}/${d},${hh}:${mm}:${ss}`;
        }

        try {
            const data = await window.api.getSatVisibility({
                lat: loc.lat,
                lon: loc.lng,
                alt: loc.alt || 100,
                time: timeStr,
                rinexPath: rinexPath || null
            });
            if (data && data.length > 0) setSatData(data);
        } catch (e) {
            console.error("Failed to fetch sat data:", e);
        }
    };

    // Real-time propagation timer (Update every 5 seconds)
    useEffect(() => {
        let interval = null;
        if (isPipActive && pipView === 'sky') {
            // Initial fetch
            fetchSatData();
            // Regular updates
            interval = setInterval(fetchSatData, 5000); 
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isPipActive, pipView, simulatedLocation, selectedLocation, simulationTime]);

    const renderMap = (isPip) => (
        <div className={isPip ? "pip-frame" : "base-frame"}>
            <MapView
                selectedLocation={selectedLocation}
                simulatedLocation={simulatedLocation}
                trajectoryPoints={trajectoryPoints}
                onMapClick={onMapClick}
                mapRef={mapRef}
                isDrawing={isDrawing}
                onDrawingFinished={onDrawingFinished}
            />
            {isPip && <div className="pip-label">Map</div>}
        </div>
    );

    const renderSky = (isPip) => (
        <div className={isPip ? "pip-frame" : "base-frame"}>
            <SkyView 
                satellites={satData} 
                width={isPip ? 320 : 1000} 
                height={isPip ? 320 : 1000} 
            />
            {isPip && <div className="pip-label">Sky View</div>}
        </div>
    );

    useEffect(() => {
        if (forceSkyView) {
            fetchSatData();
            const fallbackInterval = setInterval(fetchSatData, 5000);
            return () => clearInterval(fallbackInterval);
        }
    }, [forceSkyView, simulatedLocation, selectedLocation, simulationTime]);

    if (forceSkyView) {
        return (
            <div className="sky-view-standalone-panel">
                <div className="sky-view-container">
                    <SkyView 
                        satellites={satData} 
                        width={330} 
                        height={330} 
                    />
                </div>
            </div>
        );
    }

  
    return (
        <div className={`map-pip-container ${isMaximized ? 'maximized' : ''}`}>
            {/* Primary View (Full-screen Overlay) - Always matches PiP content */}
            <div className="primary-view">
                {pipView === 'map' ? renderMap(false) : renderSky(false)}
                <button className="pip-btn close-maximize" onClick={toggleMaximize}>
                    Back to Panel
                </button>
            </div>

            {/* Secondary View (PiP) */}
            {isPipActive && !isMaximized && (
                <div className="secondary-pip">
                    {pipView === 'map' ? renderMap(true) : renderSky(true)}
                </div>
            )}

            <div className="pip-controls">
                <button className="pip-btn" onClick={toggleMaximize} title="Full Screen">
                    {isMaximized ? 'Back to Panel' : 'Full Screen'}
                </button>
                <button className="pip-btn" onClick={togglePipView} title="Switch View">
                    Switch to {pipView === 'map' ? 'Sky View' : 'Map View'}
                </button>
                <button className="pip-btn" onClick={() => setIsPipActive(!isPipActive)} title="Show/Hide PiP">
                    {isPipActive ? 'Hide PiP' : 'Show PiP'}
                </button>
            </div>
        </div>
    );
};




export default MapPip;

