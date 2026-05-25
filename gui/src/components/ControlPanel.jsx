import React, { useState, useEffect, useRef } from 'react';
import ResultsModal from './ResultsModal';

const ControlPanel = ({
    selectedLocation,
    onPlaceSelected,
    onClearMarker,
    onGeolocate,
    isLoadingLocation,
    setSimulatedLocation,
    setTrajectoryPoints,
    isDrawing,
    setIsDrawing,
    drawnPoints,
    setDrawnPoints,
    onSaveDrawnTrajectory,
    motionFile,
    setMotionFile,
    simulationTime,
    setSimulationTime,
    addToast,
    setRinexPath
}) => {
    // ---- Map Explorer State ----
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // ---- GPS-SDR-SIM State ----
    // 1. Location & Motion
    const [mode, setMode] = useState('static'); // 'static' or 'dynamic'
    const [height, setHeight] = useState(100);
    const [isGeneratingTrajectory, setIsGeneratingTrajectory] = useState(false);

    // 2. Ephemeris & Time
    const [rinexFile, setRinexFile] = useState(null);

    // 3. Hardware Specs
    const [sdrPreset, setSdrPreset] = useState('hackrf'); // 'hackrf', 'plutosdr', 'usrp'
    const [duration, setDuration] = useState(300);
    const [outputAction, setOutputAction] = useState('save'); // 'save', 'transmit-hackrf'

    // ---- Results Modal State ----
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        content: '',
        isError: false
    });

    const [logs, setLogs] = useState([]);
    const logRef = useRef(null);

    useEffect(() => {
        if (window.api && window.api.onEngineLog) {
            window.api.onEngineLog((log) => {
                setLogs(prev => [...prev.slice(-49), log]); // Keep last 50 lines
            });
        }
    }, []);

    // Auto-scroll log terminal on new output
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logs]);

    const handleTrajectoryGenerate = async () => {
        if (!selectedLocation) {
            addToast('Please select a center location on the map first.', 'error', 4000);
            return;
        }

        if (!window.api || !window.api.generateTrajectory) {
            addToast('Electron API not available.', 'error', 4000);
            return;
        }

        setTrajectoryPoints([]); // Clear old dots before generating new ones
        setIsGeneratingTrajectory(true);
        try {
            const res = await window.api.generateTrajectory({
                centerLat: selectedLocation.lat,
                centerLon: selectedLocation.lng,
                alt: height,
                duration: duration,
                speed: 10,
                radius: 100
            });

            if (res.success) {
                setTrajectoryPoints(res.points);
                setMotionFile(null);
                addToast(`Trajectory generated — ${res.points.length} points saved to temp/trajectory.csv`, 'success', 5000);
            } else {
                addToast('Failed to generate trajectory: ' + res.error, 'error', 6000);
            }
        } catch (error) {
            addToast('Error: ' + error.message, 'error', 6000);
        } finally {
            setIsGeneratingTrajectory(false);
        }
    };

    // ---- Map Explorer Logic ----
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchTerm.trim().length > 2) {
                fetchSuggestions(searchTerm);
            } else {
                setSuggestions([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    const fetchSuggestions = async (query) => {
        setIsSearching(true);
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
            );
            if (!response.ok) throw new Error('Network response not ok');
            const data = await response.json();
            setSuggestions(data);
        } catch (error) {
            console.error('Search error:', error);
            setSuggestions([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectSuggestion = (suggestion) => {
        const lat = parseFloat(suggestion.lat);
        const lon = parseFloat(suggestion.lon);

        setSearchTerm(suggestion.display_name);
        setSuggestions([]);

        onPlaceSelected({ lat, lng: lon });
    };

    const formattedCoords = selectedLocation
        ? `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lng.toFixed(6)}`
        : 'No location selected';

    // ---- GPS-SDR-SIM Logic ----
    const lat = selectedLocation ? selectedLocation.lat.toFixed(6) : '0.000000';
    const lon = selectedLocation ? selectedLocation.lng.toFixed(6) : '0.000000';

    const sdrSpecs = {
        hackrf: { name: 'HackRF', b: 8, s: 2600000 },
        plutosdr: { name: 'PlutoSDR / BladeRF', b: 16, s: 2600000 },
        usrp: { name: 'USRP', b: 16, s: 2600000 }
    };

    const maxDuration = mode === 'dynamic' ? 300 : 86400;

    useEffect(() => {
        if (duration > maxDuration) {
            setDuration(maxDuration);
        }
    }, [mode, maxDuration, duration]);

    const handleMatchFile = async () => {
        if (!rinexFile) {
            addToast('Please select a RINEX file first.', 'error', 4000);
            return;
        }

        try {
            const res = await window.api.readRinexHeader(rinexFile.path);
            if (res.success) {
                setSimulationTime(res.simulationTime);
                addToast('Start time matched: ' + res.simulationTime, 'success', 5000);
            } else {
                addToast('Could not parse date: ' + res.error, 'error', 6000);
            }
        } catch (error) {
            addToast('Error matching file: ' + error.message, 'error', 6000);
        }
    };

    const handleSelectRinex = async () => {
        const file = await window.api.selectFile({
            title: 'Select RINEX File',
            filters: [{ name: 'RINEX Navigation', extensions: ['rnx', '22n', 'txt', 'n'] }]
        });
        if (file) {
            setRinexFile(file);
            if (setRinexPath) setRinexPath(file.path);
        }
    };

    const handleSelectMotion = async () => {
        const file = await window.api.selectFile({
            title: 'Select Motion File',
            filters: [{ name: 'Trajectory CSV', extensions: ['csv', 'txt'] }]
        });
        if (file) {
            setMotionFile(file);
            // Parse and show points
            try {
                const res = await window.api.parseMotionCsv(file.path);
                if (res.success) {
                    setTrajectoryPoints(res.points);
                    onClearMarker(); // Clear static marker to focus on file
                    setSearchTerm('');
                }
            } catch (e) {
                console.warn("Could not parse selected CSV:", e);
                setTrajectoryPoints([]);
            }
        }
    };

    const rinexName = rinexFile ? rinexFile.name : '<rinex_file>';
    const motionName = motionFile ? motionFile.name : 'temp/trajectory.csv'; // Default to the generated one if no file picked
    const bits = sdrSpecs[sdrPreset].b;
    const sampRate = sdrSpecs[sdrPreset].s;
    const timeArg = simulationTime ? ` -t ${simulationTime}` : '';

    const cmd = mode === 'static'
        ? `gps-sdr-sim -e ${rinexName} -l ${lat},${lon},${height} -b ${bits} -s ${sampRate} -d ${duration}${timeArg}`
        : `gps-sdr-sim -e ${rinexName} -u ${motionName} -b ${bits} -s ${sampRate} -d ${duration}${timeArg}`;

    const handleGenerate = async () => {
        if (!window.api) {
            addToast('Electron API not found. Run the desktop app (npm run electron:dev).', 'error', 6000);
            return;
        }

        // Let user know it's processing
        // We can keep a simple log console or just a loading state
        console.log("Starting generation...");

        try {
            const data = {
                lat,
                lon,
                alt: height,
                duration,
                action: outputAction,
                bits,
                sampRate,
                simulationTime,
                mode,
                motionFilePath: motionFile ? motionFile.path : null,
                rinexFilePath: rinexFile ? rinexFile.path : null
            };

            console.log("[ControlPanel] Sending data to generate-gps:", data);
            const result = await window.api.generateGps(data);
            if (result.success) {
                let msg = result.message;
                if (result.simulatedLocation) {
                    msg += `\n\nSimulated Position:\nLat: ${result.simulatedLocation.lat.toFixed(6)}\nLng: ${result.simulatedLocation.lng.toFixed(6)}`;
                    if (result.simulatedLocation.time) {
                        msg += `\nTime: ${result.simulatedLocation.time}`;
                    }
                }
                
                setModalConfig({
                    isOpen: true,
                    title: 'Simulation Successful',
                    content: msg,
                    isError: false
                });

                if (result.simulatedLocation) {
                    setSimulatedLocation(result.simulatedLocation);
                }
            } else {
                setModalConfig({
                    isOpen: true,
                    title: 'Simulation Failed',
                    content: result.error,
                    isError: true
                });
            }
        } catch (error) {
            setModalConfig({
                isOpen: true,
                title: 'Execution Error',
                content: error.message,
                isError: true
            });
        }
    };

    return (
        <div className="controls-panel">
            {/* Map Explorer Section */}
            <div className="panel-header">
                <h1>Simulator Graphical User Interface</h1>
            </div>

            <div className="input-group">
                <label htmlFor="search">Find Place</label>
                <div style={{ position: 'relative' }}>
                    <input
                        id="search"
                        type="text"
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search for locations..."
                        autoComplete="off"
                    />
                    {isSearching && (
                        <div style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)'
                        }}>
                            Searching...
                        </div>
                    )}
                    {suggestions.length > 0 && (
                        <ul className="suggestions-list">
                            {suggestions.map((item, index) => (
                                <li
                                    key={item.place_id || index}
                                    onClick={() => handleSelectSuggestion(item)}
                                >
                                    {item.display_name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="input-group">
                <label htmlFor="coordinates">Coordinates</label>
                <input
                    id="coordinates"
                    type="text"
                    className="coord-input"
                    value={formattedCoords}
                    readOnly
                />
                <p className="helper-text">Latitude, Longitude (EPSG:4326)</p>
            </div>

            <div className="button-group">
                <button
                    className="btn btn-primary"
                    onClick={onGeolocate}
                    disabled={isLoadingLocation}
                >
                    {isLoadingLocation ? 'Locating...' : 'Use Current Location'}
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        onClearMarker();
                        setSearchTerm('');
                    }}
                    disabled={!selectedLocation}
                >
                    Clear Marker
                </button>
            </div>

            <hr className="divider" />

            {/* GPS-SDR-SIM Section */}
            <div className="panel-header">
                <h1>Simulation Parameters</h1>
                <p>Configure and generate GPS-SDR-SIM commands.</p>
            </div>

            <div className="drawer-content" style={{ padding: 0 }}>
                {/* Simulation Parameters Grid */}
                <div className="panel-grid">
                    {/* 1. Location & Motion */}
                    <div className="drawer-section">
                        <h3>1. Location & Motion</h3>
                        <div className="switch-group">
                            <label>
                                <input
                                    type="radio"
                                    value="static"
                                    checked={mode === 'static'}
                                    onChange={() => {
                                        setMode('static');
                                        setTrajectoryPoints([]);
                                    }}
                                /> Static
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    value="dynamic"
                                    checked={mode === 'dynamic'}
                                    onChange={() => {
                                        setMode('dynamic');
                                        setTrajectoryPoints([]);
                                        setIsDrawing(false);
                                        setDrawnPoints([]);
                                    }}
                                /> Dynamic
                            </label>
                        </div>

                        {mode === 'static' ? (
                            <>
                                <div className="drawer-input-group">
                                    <label>Latitude</label>
                                    <input type="text" value={lat} readOnly className="read-only" />
                                </div>
                                <div className="drawer-input-group">
                                    <label>Longitude</label>
                                    <input type="text" value={lon} readOnly className="read-only" />
                                </div>
                                <div className="drawer-input-group">
                                    <label>Height (meters)</label>
                                    <input
                                        type="number"
                                        value={height}
                                        onChange={(e) => setHeight(Number(e.target.value))}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="drawer-input-group">
                                    <label>Height (meters)</label>
                                    <input
                                        type="number"
                                        value={height}
                                        onChange={(e) => setHeight(Number(e.target.value))}
                                    />
                                </div>
                                <div className="drawer-input-group">
                                    <label>Manual Motion File</label>
                                    <div className="file-select-container">
                                        <button className="btn btn-secondary file-btn" onClick={handleSelectMotion}>
                                            {motionFile ? motionFile.name : 'Select .csv/.txt'}
                                        </button>
                                    </div>
                                </div>
                                <button 
                                    className="btn btn-secondary" 
                                    style={{ width: '100%', marginTop: '0.5rem', borderColor: '#ea4335', color: '#ea4335' }}
                                    onClick={handleTrajectoryGenerate}
                                    disabled={isGeneratingTrajectory || isDrawing}
                                >
                                    {isGeneratingTrajectory ? 'Generating...' : 'Auto-Generate Trajectory (.csv)'}
                                </button>
                                
                                <div style={{ marginTop: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Manual Drawing</h4>
                                    {!isDrawing && drawnPoints.length === 0 && (
                                        <button 
                                            className="btn btn-primary" 
                                            style={{ width: '100%' }}
                                            onClick={() => setIsDrawing(true)}
                                        >
                                            Draw Trajectory on Map
                                        </button>
                                    )}
                                    
                                    {isDrawing && (
                                        <div className="info-box" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                                            <strong>Drawing Mode:</strong> Click points on map. Double-click to finish.
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ width: '100%', marginTop: '5px', fontSize: '0.75rem' }}
                                                onClick={() => setIsDrawing(false)}
                                            >
                                                Cancel Drawing
                                            </button>
                                        </div>
                                    )}

                                    {drawnPoints.length > 0 && !isDrawing && (
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button 
                                                className="btn btn-generate" 
                                                style={{ flex: 2 }}
                                                onClick={() => onSaveDrawnTrajectory(height, duration)}
                                            >
                                                Save Drawn Path
                                            </button>
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ flex: 1 }}
                                                onClick={() => setDrawnPoints([])}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* 2. Ephemeris & Time */}
                    <div className="drawer-section">
                        <h3>2. Ephemeris & Time</h3>
                        <div className="drawer-input-group">
                            <label>RINEX File (-e)</label>
                            <div className="file-select-container">
                                <button className="btn btn-secondary file-btn" onClick={handleSelectRinex}>
                                    {rinexFile ? rinexFile.name : 'Select RINEX file'}
                                </button>
                            </div>
                        </div>
                        <div className="drawer-input-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label>Start Time (-t)</label>
                                <button className="match-btn" onClick={handleMatchFile}>Match File</button>
                            </div>
                            <input
                                type="text"
                                placeholder="YYYY/MM/DD,HH:mm:ss"
                                value={simulationTime}
                                onChange={(e) => setSimulationTime(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* 3. Hardware Specs */}
                    <div className="drawer-section">
                        <h3>3. Hardware Specs</h3>
                        <div className="drawer-input-group">
                            <label>SDR Preset</label>
                            <select
                                value={sdrPreset}
                                onChange={(e) => setSdrPreset(e.target.value)}
                            >
                                <option value="hackrf">HackRF (-b 8, -s 2600000)</option>
                                <option value="plutosdr">PlutoSDR / BladeRF (-b 16, -s 2600000)</option>
                                <option value="usrp">USRP (-b 16, -s 2500000)</option>
                            </select>
                        </div>
                        <div className="drawer-input-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label>Duration (-d) seconds</label>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Max: {maxDuration}s
                                </span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max={maxDuration}
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                            />
                            <input
                                type="number"
                                min="1"
                                max={maxDuration}
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* 4. Output Actions */}
                    <div className="drawer-section">
                        <h3>4. Output Action</h3>
                        <div className="drawer-input-group">
                            <select
                                value={outputAction}
                                onChange={(e) => setOutputAction(e.target.value)}
                            >
                                <option value="save">Save File Locally (.bin)</option>
                                <option value="transmit-hackrf">Verify with MATLAB Receiver</option>
                                <option value="pocket-sdr">Process with PocketSDR</option>
                                <option value="hardware-hackrf">Transmit via HackRF One</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Secondary Row: Execution & Verification */}
                <div className="panel-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    {/* Generated Command Section */}
                    <div className="drawer-section" style={{ marginTop: '1rem', paddingBottom: '2rem' }}>
                        <h3>Generated Command</h3>
                        <div className="code-block">
                            {cmd}
                        </div>
                        <button className="btn btn-generate" onClick={handleGenerate}>
                            Generate Output
                        </button>
                    </div>

                    {/* Verification Section */}
                    <div className="drawer-section" style={{ borderTop: '2px solid var(--border-color)', paddingTop: '1.5rem' }}>
                        <h3>5. Verification (MATLAB)</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Validate the generated <code>gpssim.bin</code> using the integrated MATLAB SDR receiver.
                        </p>

                        <div className="info-box" style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '10px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            marginBottom: '1rem',
                            borderLeft: '4px solid #f2994a'
                        }}>
                            <strong>Requirement:</strong> MATLAB must be installed and in your system PATH.
                        </div>

                        <button
                            className="btn btn-secondary"
                            style={{ width: '100%', marginBottom: '10px' }}
                            onClick={async () => {
                                if (!window.api || !window.api.runMatlabVerification) {
                                    addToast('MATLAB API not available.', 'error', 4000);
                                    return;
                                }
                                const res = await window.api.runMatlabVerification({
                                    binPath: null,
                                    bits,
                                    sampRate
                                });
                                if (res.success) {
                                    addToast(res.message, 'success', 6000);
                                    if (res.simulatedLocation) {
                                        setSimulatedLocation(res.simulatedLocation);
                                    }
                                } else {
                                    addToast((res.error || 'MATLAB failed') + (res.details ? ' — ' + res.details : ''), 'error', 8000);
                                }
                            }}
                        >
                            Verify with MATLAB
                        </button>

                        <button
                            className="btn btn-secondary"
                            style={{ width: '100%', marginBottom: '10px', border: '1px solid #5A8DEE' }}
                            onClick={async () => {
                                if (!window.api || !window.api.fetchResults) {
                                    addToast('API not available.', 'error', 4000);
                                    return;
                                }
                                const res = await window.api.fetchResults();
                                if (res.success && res.simulatedLocation) {
                                    setSimulatedLocation(res.simulatedLocation);
                                    addToast('Simulation results loaded successfully!', 'success', 5000);
                                } else {
                                    addToast('No results found. Run a simulation first.', 'error', 5000);
                                }
                            }}
                        >
                            Fetch Results from JSON
                        </button>

                        <p style={{ fontSize: '0.75rem', textAlign: 'center' }}>
                            Manual: Run <code>link_receiver.m</code> in MATLAB
                        </p>
                    </div>
                </div>

                {/* Log Terminal Section */}
                <div className="drawer-section" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    <h3>Engine Output Log</h3>
                    <div ref={logRef} className="terminal-log" style={{
                        background: '#000',
                        color: '#0f0',
                        fontFamily: 'monospace',
                        padding: '10px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        height: '150px',
                        overflowY: 'auto',
                        marginTop: '0.5rem',
                        border: '1px solid #333'
                    }}>
                        {logs.length === 0 ? '> Idle' : logs.map((log, i) => (
                            <div key={i} style={{ color: log.type === 'error' ? '#ff4d4d' : '#0f0', marginBottom: '2px' }}>
                                {log.type === 'error' ? '!' : '>'} {log.text}
                            </div>
                        ))}
                    </div>
                    <button 
                        className="btn btn-secondary" 
                        style={{ width: '100%', marginTop: '5px', fontSize: '0.7rem', padding: '4px' }}
                        onClick={() => setLogs([])}
                    >
                        Clear Log
                    </button>
                </div>
            </div>

            <ResultsModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                title={modalConfig.title}
                content={modalConfig.content}
                isError={modalConfig.isError}
            />
        </div>
    );
};

export default ControlPanel;
