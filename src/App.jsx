import React, { useState, useRef, useCallback, useEffect } from 'react';
import MapPip from './components/MapPip';
import ControlPanel from './components/ControlPanel';

function App() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [simulatedLocation, setSimulatedLocation] = useState(null);
  const [trajectoryPoints, setTrajectoryPoints] = useState([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState([]);
  const [motionFile, setMotionFile] = useState(null);
  const [simulationTime, setSimulationTime] = useState('');
  const [rinexPath, setRinexPath] = useState(null);
  const [toasts, setToasts] = useState([]);
  const mapRef = useRef(null);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    
    if (type !== 'info') { // Don't auto-remove 'info' (loading) toasts if they are long-running
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleMapClick = useCallback((location) => {
    setSelectedLocation(location);
    setSimulatedLocation(null); // Clear simulation when manual marker moves
    setTrajectoryPoints([]); // Clear trajectory when marker moves
  }, []);

  // Load results from results.json on startup
  useEffect(() => {
    const loadInitialResults = async () => {
      if (window.api && window.api.fetchResults) {
        const res = await window.api.fetchResults();
        if (res.success && res.simulatedLocation) {
          setSimulatedLocation(res.simulatedLocation);
        }
      }
    };
    loadInitialResults();
  }, []);
 
  // Listen for perpetual results updates from the main process
  useEffect(() => {
    if (window.api && window.api.onResultsUpdate) {
      window.api.onResultsUpdate((newLocation) => {
        setSimulatedLocation(newLocation);
      });
    }

    if (window.api && window.api.onVerificationStarted) {
      window.api.onVerificationStarted((data) => {
        addToast(data.message, 'info');
      });
    }

    if (window.api && window.api.onVerificationComplete) {
      window.api.onVerificationComplete((data) => {
        // Clear previous info toasts when complete
        setToasts(prev => prev.filter(t => t.type !== 'info'));
        addToast(data.message, data.success ? 'success' : 'error', 6000);
      });
    }
  }, [addToast]);

  const handlePlaceSelected = useCallback((location) => {
    setSelectedLocation(location);
    setTrajectoryPoints([]); // Clear trajectory when marker moves
  }, []);

  const handleClearMarker = useCallback(() => {
    setSelectedLocation(null);
    setTrajectoryPoints([]);
  }, []);

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      addToast('Geolocation is not supported by your browser.', 'error', 5000);
      return;
    }

    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setSelectedLocation(location);
        setTrajectoryPoints([]);
        setIsLoadingLocation(false);
      },
      (error) => {
        setIsLoadingLocation(false);
        let message = 'An unknown error occurred';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'User denied the request for Geolocation.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            message = 'The request to get user location timed out.';
            break;
        }
        addToast(`Geolocation error: ${message}`, 'error', 6000);
      }
    );
  }, [addToast]);

  const handleDrawingFinished = useCallback((points) => {
    setDrawnPoints(points);
    setIsDrawing(false);
  }, []);

  const handleSaveDrawnTrajectory = useCallback(async (alt, duration) => {
    if (drawnPoints.length < 2) {
      addToast('Please draw a path with at least 2 points first.', 'error', 4000);
      return;
    }

    try {
      const res = await window.api.saveDrawnTrajectory({
        points: drawnPoints,
        alt,
        duration
      });

      if (res.success) {
        setTrajectoryPoints(res.points);
        setDrawnPoints([]);
        setMotionFile(null); // Ensure we use the drawn trajectory.csv
        addToast(`Trajectory saved — ${res.pointCount} coordinates (${res.fileSize} bytes)`, 'success', 5000);
      } else {
        addToast('Failed to save trajectory: ' + res.error, 'error', 6000);
      }
    } catch (error) {
      addToast('Error saving trajectory: ' + error.message, 'error', 6000);
    }
  }, [drawnPoints, addToast]);

  return (
    <div className="layout">
      <ControlPanel
        selectedLocation={selectedLocation}
        onPlaceSelected={handlePlaceSelected}
        onClearMarker={handleClearMarker}
        onGeolocate={handleGeolocate}
        isLoadingLocation={isLoadingLocation}
        setSimulatedLocation={setSimulatedLocation}
        setTrajectoryPoints={setTrajectoryPoints}
        isDrawing={isDrawing}
        setIsDrawing={setIsDrawing}
        drawnPoints={drawnPoints}
        setDrawnPoints={setDrawnPoints}
        onSaveDrawnTrajectory={handleSaveDrawnTrajectory}
        motionFile={motionFile}
        setMotionFile={setMotionFile}
        simulationTime={simulationTime}
        setSimulationTime={setSimulationTime}
        addToast={addToast}
        setRinexPath={setRinexPath}
      />
      
      {/* Floating Map/Sky PiP */}
      <MapPip
        selectedLocation={selectedLocation}
        simulatedLocation={simulatedLocation}
        trajectoryPoints={trajectoryPoints}
        onMapClick={handleMapClick}
        isDrawing={isDrawing}
        onDrawingFinished={handleDrawingFinished}
        simulationTime={simulationTime}
        rinexPath={rinexPath}
      />

      <div className="toast-container">

        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'info' && <div className="toast-spinner"></div>}
            <div className="toast-message">{toast.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
