import React, { useState, useRef, useCallback, useEffect } from 'react';
import MapPip from './components/MapPip';
import ControlPanel from './components/ControlPanel';
import SettingsPanel from './components/SettingsPanel';


function App() {
  const [activeWindow, setActiveWindow] = useState('VEHICLE');
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
    if (type !== 'info') {
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
    setSimulatedLocation(null);
    setTrajectoryPoints([]);
  }, []);

  const [outputBinPath, setOutputBinPath] = useState(null);
  const [selectedFileType, setSelectedFileType] = useState('bin');

  // outputBinPath: Holds the absolute path string of the current output tracking target.
  //                Set to `null` when cleared. Keeps the file on disk intact.
  // selectedFileType: Tracks selected file layout filter ('bin' is the default target).
  const handleAddOutputFile = async () => {
    if (!window.api || !window.api.createEmptyBinFile) {
        addToast('Electron API not available.', 'error', 4000);
        return;
    }
    try {
        const savedPath = await window.api.createEmptyBinFile();
        if (savedPath) {
            setOutputBinPath(savedPath);
            addToast(`Empty target file created: ${savedPath}`, 'success', 4000);
        }
    } catch (err) {
        addToast('Error creating empty output file: ' + err.message, 'error', 5000);
    }
  };

  const handleClearOutputFile = () => {
    setOutputBinPath(null);
    addToast('Output file tracking cleared.', 'success', 3000);
  };

//=======================================================================================

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
        setToasts(prev => prev.filter(t => t.type !== 'info'));
        addToast(data.message, data.success ? 'success' : 'error', 6000);
      });
    }
  }, [addToast]);

  const handlePlaceSelected = useCallback((location) => {
    setSelectedLocation(location);
    setTrajectoryPoints([]);
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
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        setSelectedLocation(location);
        setTrajectoryPoints([]);
        setIsLoadingLocation(false);
      },
      (error) => {
        setIsLoadingLocation(false);
        addToast('Geolocation error occurred.', 'error', 6000);
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
      const res = await window.api.saveDrawnTrajectory({ points: drawnPoints, alt, duration });
      if (res.success) {
        setTrajectoryPoints(res.points);
        setDrawnPoints([]);
        setMotionFile(null);
        addToast('Trajectory saved successfully', 'success', 5000);
      }
    } catch (error) {
      addToast('Error saving trajectory.', 'error', 6000);
    }
  }, [drawnPoints, addToast]);

  // Global Atmosphere Settings State
  const [atmosphereSettings, setAtmosphereSettings] = useState({
    model: 0,          // 0 = NONE, 1 = SAASTAMOINEN, 2 = STANAG
    pressure: 1013.25, // Default P (hPa)
    temperature: 288.15, // Default T (Kelvin)
    waterVapor: 11.0,  // Default e (hPa)
  });

  return (
    <div className="layout">
      {/* Side View Navigation Control */}
      <nav className="sidebar-menu">
        {/*OUTPUT BUTTON */}
         <button 
           className={activeWindow === 'OUTPUT' ? 'active' : ''} 
           onClick={() => setActiveWindow('OUTPUT')}
       >
          OUTPUT
        </button>
        <button 
          className={activeWindow === 'VEHICLE' ? 'active' : ''} 
          onClick={() => setActiveWindow('VEHICLE')}
        >
          VEHICLE
        </button>
        <button 
          className={activeWindow === 'SETTINGS' ? 'active' : ''} 
          onClick={() => setActiveWindow('SETTINGS')}
        >
          SETTINGS
        </button>
      </nav>

      {/* Main Panel Canvas */}
      <div className="main-content">
        
        {/* --- 1. OUTPUT WINDOW --- */}
       <div 
        className="split-layout" 
        style={activeWindow === 'OUTPUT' ? {} : { position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1 }}
       >

    
    {/* UPPER HALF: Device Configuration & Parameters Workspace */}
    <div className="upper-pane">
      <div className="pane-header">Hardware Settings & Execution Console</div>
      <div className="control-wrapper">
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
          hideExecutionSections={false}
          showOnlyExecution={true}
          customOutputPath={outputBinPath}
          atmosphereSettings={atmosphereSettings} // Pass the atmosphere settings to the backend
        />
      </div>
    </div>

    {/* BOTTOM HALF: Telemetry & Multi-Constellation View Tracking Matrix */}
    <div className="bottom-pane">
      
      {/* Left Monitoring Window Side Panel Matrix: Constellations & Channels Selector */}
      <div className="constellation-sidebar">
        <div className="constellation-tab-header">Constellations</div>
        <div className="constellation-list-group">
          <button className="telemetry-tab active"><span className="indicator gps-dot"></span>GPS</button>
          <button className="telemetry-tab"><span className="indicator glonass-dot"></span>GLONASS</button>
          <button className="telemetry-tab"><span className="indicator galileo-dot"></span>GALILEO</button>
          <button className="telemetry-tab"><span className="indicator beidou-dot"></span>BEIDOU</button>
          <button className="telemetry-tab"><span className="indicator sbas-dot"></span>SBAS</button>
          <button className="telemetry-tab"><span className="indicator qzss-dot"></span>QZSS</button>
          <button className="telemetry-tab"><span className="indicator navic-dot"></span>NAVIC</button>
          <button className="telemetry-tab"><span className="indicator custom-dot"></span>CUSTOM</button>
        </div>
      </div>

      {/* Center Simulated Channel RF Metrics Area */}
      <div className="rf-matrix-center">
        {/* ========================================================================
       SIDE-BY-SIDE FILE TYPE SELECTOR & CONTROLS
       ======================================================================== */}
    <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px', 
        padding: '12px 20px', 
        background: '#111420',                       /* Solid contrast backdrop color */
        borderBottom: '1px solid var(--border-color)', /* Border line sitting right above charts */
        width: '100%',
        boxSizing: 'border-box'
    }}>
        {/* Dropdown Field Container */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Output File:
            </label>
            <select 
                value={selectedFileType} 
                onChange={(e) => setSelectedFileType(e.target.value)}
                style={{ padding: '4px 10px', minWidth: '135px' }}
            >
                <option value="bin">Binary (.bin)</option>
            </select>
        </div>

        {/* Dynamic Operational Action Control Elements */}
        <div style={{ display: 'flex', gap: '8px' }}>
            <button 
                className="btn btn-primary"
                style={{ padding: '4px 14px', margin: 0, fontSize: '0.75rem', height: 'auto' }}
                onClick={handleAddOutputFile}
            >
                Add
            </button>
            <button 
                className="btn btn-secondary"
                style={{ padding: '4px 14px', margin: 0, fontSize: '0.75rem', height: 'auto' }}
                onClick={handleClearOutputFile}
            >
                Clear
            </button>
        </div>

        {/* Operational Realtime Active Path Information Readout */}
        {outputBinPath && (
            <div style={{ 
                marginLeft: 'auto', 
                fontSize: '0.75rem', 
                color: '#2ecc71',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '400px'
            }} title={outputBinPath}>
                Tracking Destination File: <span style={{ textDecoration: 'underline' }}>{outputBinPath}</span>
            </div>
        )}
    </div>
    {/* ======================================================================== */}
        <div className="pane-header" style={{ background: '#161d2a' }}>Channel Power Levels & Pseudo-Range Status</div>
        <div className="placeholder-bars">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 'auto' }}>
            Select active constellation channels to display RF signal power sliders...
          </p>
        </div>
      </div>

      {/* Right Radar Circular Orbit Map Area (Sky View Canvas Engine) */}
      <div className="skyview-right">
        <div className="pane-header" style={{ background: '#161d2a' }}>Satellite Constellation Track (Sky View)</div>
        <div className="canvas-box">
          <MapPip
            selectedLocation={selectedLocation}
            simulatedLocation={simulatedLocation}
            trajectoryPoints={trajectoryPoints}
            onMapClick={handleMapClick}
            isDrawing={isDrawing}
            onDrawingFinished={handleDrawingFinished}
            simulationTime={simulationTime}
            rinexPath={rinexPath}
            forceSkyView={true}
          />
        </div>
      </div>

    </div>
  </div>


       {/* --- 2. VEHICLE WINDOW --- */}
       <div 
       className="vehicle-window-layout" 
       style={activeWindow === 'VEHICLE' ? {} : { position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1 }}
      >
            
            {/* Map-related Controls and Grouped Inputs Panel */}
            <div className="vehicle-workspace-panel">
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
                hideExecutionSections={true}
                customOutputPath={outputBinPath}
                atmosphereSettings={atmosphereSettings} // Pass the atmosphere settings to the backend
              />
            </div>
            
            {/* Integrated Map View Window */}
            <div className="vehicle-map-panel">
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
            </div>

          </div>
        

        {/* Global Configuration Panel View Component Wrapper */}
        {activeWindow === 'SETTINGS' && (
        <div className="window-placeholder full-settings-view">
          <SettingsPanel 
            settings={atmosphereSettings} 
            setSettings={setAtmosphereSettings} 
          />
        </div>
        )}
      </div>

      {/* Toast Alert View Layer */}
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