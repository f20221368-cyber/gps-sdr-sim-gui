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
    setRinexPath,
    hideExecutionSections = false, // New prop to conditionally hide execution and verification sections
    showOnlyExecution = false, // New prop to show only execution section with a simplified interface
    customOutputPath,
    atmosphereSettings,
    
}) => {
    
    // State to track the checkboxes currently selected inside the open modal
    const [tempSelectedSignals, setTempSelectedSignals] = useState([]); 
    // State to track telemetry settings currently selected inside the open modal
    const [tempSampleRate, setTempSampleRate] = useState("2.60 MSps");
    const [tempAwgnEnabled, setTempAwgnEnabled] = useState(false);
    const [tempAwgnValue, setTempAwgnValue] = useState("0.0 dB/Hz");
    const [tempTxGain, setTempTxGain] = useState("40 dB");

    // Master array holding all permanent signals added to your radio stack
    const [addedSignals, setAddedSignals] = useState([]);

    // Tracks null if creating a new signal, or the array index number if editing an existing signal
    const [editingSignalIndex, setEditingSignalIndex] = useState(null);
  

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

    // Hardware Specs
    const [sdrPreset, setSdrPreset] = useState('hackrf'); // 'hackrf', 'plutosdr', 'usrp'
    const [customBits, setCustomBits] = useState(16);
    const [customSampRate, setCustomSampRate] = useState(2600000);
    const [duration, setDuration] = useState(300);
    const [outputAction, setOutputAction] = useState('save'); // 'save', 'transmit-hackrf'
    const [isGnssModalOpen, setIsGnssModalOpen] = useState(false);

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
        usrp: { name: 'USRP', b: 16, s: 2600000 },
        custom: { name: 'Custom Profile', b: 8, s: 2600000 }
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
    const bits = sdrPreset === 'custom' ? customBits : sdrSpecs[sdrPreset].b;
    const sampRate = sdrPreset === 'custom' ? customSampRate : sdrSpecs[sdrPreset].s;
    const timeArg = simulationTime ? ` -t ${simulationTime}` : '';

    const cmd = mode === 'static'
        ? `gps-sdr-sim -e ${rinexName} -l ${lat},${lon},${height} -b ${bits} -s ${sampRate} -d ${duration}${timeArg}`
        : `gps-sdr-sim -e ${rinexName} -u ${motionName} -b ${bits} -s ${sampRate} -d ${duration}${timeArg}`;

    const handleGenerate = async () => {
        if (!window.api) {
            addToast('Electron API not found. Run the desktop app (npm run electron:dev).', 'error', 6000);
            return;
        }
        
        if (!customOutputPath) {
            addToast('Please use the Add option to add an output destination file before generating!', 'error', 5000);
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
                rinexFilePath: rinexFile ? rinexFile.path : null,
                customOutputPath: customOutputPath,

               atmosphereSettings: atmosphereSettings // Pass the atmosphere settings to the backend
            };

            console.log("[ControlPanel] Sending data to generate-gps:", data);
            const result = await window.api.generateGps(data);
            if (result.success) {
                
                let msg = ""; 
    
                // Direct sentence injection since customOutputPath is guaranteed to exist
                const fileName = customOutputPath.split('\\').pop().split('/').pop();
                msg += `The output has been stored into ${fileName} file.`;
                
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
    const [typedLat, setTypedLat] = React.useState('');
    const [typedLng, setTypedLng] = React.useState('');

    // Sync input fields when selecting a location on the map or using geolocation
    useEffect(() => {
        if (selectedLocation) {
            setTypedLat(selectedLocation.lat.toString());
            setTypedLng(selectedLocation.lng.toString());
        } else {
            setTypedLat('');
            setTypedLng('');
        }
    }, [selectedLocation]);

    const handleLatitudeChange = (e) => {
        let val = e.target.value;
        const regex = /^-?\d*\.?\d*$/; // Unlimited decimals tracking
        
        if (val === '' || val === '-' || regex.test(val)) {
            setTypedLat(val); // Always keep text state fluid
            
            // Do not update parent if typing a trailing dot or trailing decimal zeros
            // This prevents parseFloat() from stripping them out and resetting your text box
            const isUnfinishedDecimal = val.endsWith('.') || (val.includes('.') && val.endsWith('0'));
            
            if (val !== '' && val !== '-' && !isUnfinishedDecimal) {
                onPlaceSelected({ 
                    lat: parseFloat(val), 
                    lng: selectedLocation?.lng || 0 
                });
            }
        }
    };

    const handleLongitudeChange = (e) => {
        let val = e.target.value;
        const regex = /^-?\d*\.?\d*$/; // Unlimited decimals tracking
        
        if (val === '' || val === '-' || regex.test(val)) {
            setTypedLng(val); // Always keep text state fluid
            
            // CRITICAL: Do not update parent if typing a trailing dot or trailing decimal zeros
            // This prevents parseFloat() from stripping them out and resetting your text box
            const isUnfinishedDecimal = val.endsWith('.') || (val.includes('.') && val.endsWith('0'));
            
            if (val !== '' && val !== '-' && !isUnfinishedDecimal) {
                onPlaceSelected({ 
                    lat: selectedLocation?.lat || 0, 
                    lng: parseFloat(val) 
                });
            }
        }
    };

    if (showOnlyExecution) {
        return (
            <div className="hardware-execution-split-panel" style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr', 
                gap: '24px',
                padding: '16px',
                alignItems: 'start',
                width: '100%',
                maxWidth: '100vw',        // Strictly locks the layout background from extending past the viewport edge
                boxSizing: 'border-box',
                overflowX: 'hidden'
            }}>
                
                {/* LEFT WINDOW CONTAINER */}
                <div className="left-console-pane" style={{ 
                       display: 'flex', 
                       flexDirection: 'column', 
                       gap: '20px',
                       minWidth: '0',        // CRITICAL: Overrides any rigid CSS min-width values
                       width: '100%',        // Allows full container flexibility
                       maxWidth: '600px'     // Sets a clean limit so it never stretches too far
                         }}>
                    
                    {/* Hardware Specifications Section */}
                    <div className="drawer-section">
                        <h3>Data Format & Sample Frequency</h3>
                        <div className="drawer-input-group">
                            <label>Configuration Preset</label>
                            <select value={sdrPreset} onChange={(e) => setSdrPreset(e.target.value)}>
                                <option value="hackrf">HackRF (-b 8, -s 2600000)</option>
                                <option value="plutosdr">PlutoSDR / BladeRF (-b 16, -s 2600000)</option>
                                <option value="usrp">USRP (-b 16, -s 2500000)</option>
                                <option value="custom">Custom Configuration</option>
                            </select>
                        </div>

                        {sdrPreset === 'custom' && (
                            <div className="custom-config-window" style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                padding: '12px',
                                borderRadius: '6px',
                                marginTop: '10px',
                                border: '1px dashed var(--border-color)'
                            }}>
                                <div className="drawer-input-group" style={{ marginBottom: '10px' }}>
                                    <label style={{ fontSize: '0.8rem', color: '#f2994a' }}>Custom Data Format (Bits)</label>
                                    <select value={customBits} onChange={(e) => setCustomBits(Number(e.target.value))}>
                                        <option value={1}>1-bit</option>
                                        <option value={8}>8-bit</option>
                                        <option value={16}>16-bit</option>
                                    </select>
                                </div>
                                <div className="drawer-input-group" style={{ marginBottom: '0' }}>
                                    <label style={{ fontSize: '0.8rem', color: '#f2994a' }}>Custom Sample Frequency</label>
                                    <select value={customSampRate} onChange={(e) => setCustomSampRate(Number(e.target.value))}>
                                        <option value={2600000}>2.6 MHz (2600000)</option>
                                        <option value={4000000}>4.0 MHz (4000000)</option>
                                        <option value={8000000}>8.0 MHz (8000000)</option>
                                        <option value={12500000}>12.5 MHz (12500000)</option>
                                        <option value={25000000}>25.0 MHz (25000000)</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="drawer-input-group" style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label>Duration (-d) seconds</label>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max: {maxDuration}s</span>
                            </div>
                            <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <input type="range" min="1" max={maxDuration} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ width: '100%' }} />
                                <input type="number" min="1" max={maxDuration} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ width: '97.18%', padding: '4px 8px' }} />
                            </div>
                        </div>
                    </div>

                    {/* Output Actions Section */}
                    <div className="drawer-section">
                        <h3>Output Action</h3>
                        <div className="drawer-input-group">
                            <select value={outputAction} onChange={(e) => setOutputAction(e.target.value)}>
                                <option value="save">Save File Locally (.bin)</option>
                                <option value="transmit-hackrf">Verify with MATLAB Receiver</option>
                                <option value="pocket-sdr">Process with PocketSDR</option>
                                <option value="hardware-hackrf">Transmit via HackRF One</option>
                            </select>
                        </div>
                    </div>

                    {/* Command Display Terminal block */}
                    <div className="drawer-section">
                        <h3>Generated Command</h3>
                        <div className="code-block" style={{ 
                            marginBottom: '10px',
                            whiteSpace: 'pre-wrap',   // Allows text to wrap naturally
                            wordBreak: 'break-all',   // Prevents long un-spaced text from stretching lines
                            maxWidth: '100%'          // Confines it to parent width
                               }}>
                            {cmd}
                        </div>
                        <button className="btn btn-generate" style={{ width: '100%' }} onClick={handleGenerate}>
                            Generate Output
                        </button>
                    </div>

                    {/* MATLAB Signal Verification Section */}
                    <div className="drawer-section">
                        <h3>5. Verification (MATLAB)</h3>
                        <button
                            className="btn btn-secondary"
                            style={{ width: '100%', marginBottom: '10px' }}
                            onClick={async () => {
                                if (!window.api || !window.api.runMatlabVerification) {
                                    addToast('MATLAB API not available.', 'error', 4000);
                                    return;
                                }
                                const res = await window.api.runMatlabVerification({ binPath: null, bits, sampRate });
                                if (res.success) {
                                    addToast(res.message, 'success', 6000);
                                    if (res.simulatedLocation) setSimulatedLocation(res.simulatedLocation);
                                } else {
                                    addToast((res.error || 'MATLAB failed') + (res.details ? ' — ' + res.details : ''), 'error', 8000);
                                }
                            }}
                        >
                            Verify with MATLAB
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ width: '100%', border: '1px solid #5A8DEE' }}
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
                    </div>

                    {/* Hardware Engine Output Console Log */}
                    <div className="drawer-section">
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
                            border: '1px solid #333'
                        }}>
                            {logs.length === 0 ? '> Idle' : logs.map((log, i) => (
                                <div key={i} style={{ color: log.type === 'error' ? '#ff4d4d' : '#0f0', marginBottom: '2px' }}>
                                    {log.type === 'error' ? '!' : '>'} {log.text}
                                </div>
                            ))}
                        </div>
                        <button className="btn btn-secondary" style={{ width: '100%', marginTop: '5px', fontSize: '0.7rem', padding: '4px' }} onClick={() => setLogs([])}>
                            Clear Log
                        </button>
                    </div>
                </div>

                {/* RIGHT CONTAINER: GNSS Control Interface Dashboard */}
                <div className="right-console-pane" style={{ 
                    background: 'rgba(255,255,255,0.01)', 
                    padding: '20px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px' }}>GNSS Control Interface</h3>
                    
                    <div className="signals-display-list" style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px', 
                        marginBottom: '16px',
                        maxHeight: '300px',
                        overflowY: 'auto'
                    }}>
                        {addedSignals.length === 0 ? (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                No active signals configured. Click below to add a radio transmission track.
                            </p>
                        ) : (
                            addedSignals.map((sig, idx) => (
                                <div key={idx} style={{ 
                                    background: '#111215', 
                                    border: '1px solid #2d3039', 
                                    borderRadius: '4px', 
                                    padding: '10px 12px', 
                                    fontSize: '0.75rem' 
                                }}>
                                    <div style={{ fontWeight: '700', color: '#60a5fa', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>RF Signal #{idx + 1}</span>
                                        
                                        {/* ACTION GROUP: Edit & Delete Links */}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            {/* Edit Button */}
                                            <button
                                                onClick={() => {
                                                    setEditingSignalIndex(idx);
                                                    setTempSelectedSignals(sig.signals);
                                                    setTempSampleRate(sig.sampleRate);
                                                    setTempAwgnEnabled(sig.awgn);
                                                    setTempAwgnValue(sig.awgnValue);
                                                    setTempTxGain(sig.gain);
                                                    setIsGnssModalOpen(true);
                                                }}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#f2994a',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    padding: '2px'
                                                }}
                                            >
                                                Edit
                                            </button>

                                            <span style={{ color: '#4b5563', fontSize: '0.7rem' }}>|</span>

                                            {/* THE NEW DELETE ACTION BUTTON */}
                                            <button
                                                onClick={() => {
                                                    // Filter out the selected item index from the master array tracker
                                                    const remainingSignals = addedSignals.filter((_, index) => index !== idx);
                                                    setAddedSignals(remainingSignals);
                                                }}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#ef4444', // Red color warning tone
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    padding: '2px'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div style={{ color: '#e2e8f0', marginBottom: '4px', wordBreak: 'break-word' }}>
                                        <strong>Signals:</strong> {sig.signals.length > 0 ? sig.signals.join(', ') : 'None selected'}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                                        <span>Gain: {sig.gain}</span>
                                        <span>Rate: {sig.sampleRate}</span>
                                        <span>AWGN: {sig.awgn ? `ON (${sig.awgnValue})` : 'OFF'}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <button 
                        onClick={() => {
                            setEditingSignalIndex(null);
                            setTempSelectedSignals([]);
                            setTempSampleRate("2.60 MSps");
                            setTempAwgnEnabled(false);
                            setTempAwgnValue("0.0 dB/Hz");
                            setTempTxGain("40 dB");
                            setIsGnssModalOpen(true);
                        }} 
                        className="btn btn-primary"
                        style={{ padding: '10px 20px', fontWeight: '600', background: '#2563eb', border: 'none', borderRadius: '4px', width: '100%' }}
                    >
                        + Add Signal
                    </button>
                </div>

                {/* Sub-Modal Popup Window for Selecting Satellites */}
                {/* Selector Popup Dialog Overlay Modal */}
                {isGnssModalOpen && (
                    <div className="gnss-modal-overlay" style={{ 
                        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', 
                        justifyContent: 'center', zIndex: 9999 
                    }}>
                        <div className="gnss-modal-window" style={{ 
                            background: '#1c1d22', border: '1px solid #374151', borderRadius: '4px', 
                            width: '920px', color: '#e2e8f0', fontFamily: 'sans-serif', overflow: 'hidden'
                        }}>
                            {/* Window Close Header Handle */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#111215', borderBottom: '1px solid #2d3039' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#60a5fa' }}>Signal Selection - GNSS</span>
                                <button onClick={() => setIsGnssModalOpen(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                            </div>

                            {/* Helper function logic block inside the panel layout layout map */}
                            {(() => {
                                const handleCheckChange = (signalName) => {
                                    if (tempSelectedSignals.includes(signalName)) {
                                        setTempSelectedSignals(tempSelectedSignals.filter(s => s !== signalName));
                                    } else {
                                        setTempSelectedSignals([...tempSelectedSignals, signalName]);
                                    }
                                };

                                const constellations = [
                                    { title: 'GPS', color: '#10b981', items: ['L1 C/A', 'L1C', 'L1 P-Code', 'L1M', 'L2C', 'L2 P-Code', 'L2M', 'L5'] },
                                    { title: 'GLONASS', color: '#f59e0b', items: ['G1', 'G2', 'G3'] },
                                    { title: 'Galileo', color: '#3b82f6', items: ['E1','E1 PRS','E6','E6 HAS','E6 PRS', 'E5a', 'E5b', 'E5 AltBOC'] },
                                    { title: 'BeiDou', color: '#8b5cf6', items: ['B1C', 'B1','B2', 'B2a', 'B2b', 'B3I'] },
                                    { title: 'SBAS', color: '#ec4899', items: ['L1', 'L5'] },
                                    { title: 'QZSS', color: '#06b6d4', items: ['L1 C/A', 'L1C', 'L1-SAIF', 'L2C', 'L5', 'L5S', 'L6'] },
                                    { title: 'NavIC', color: '#f43f5e', items: ['S','L1','L5'] },
                                    { title: 'Pulsar', color: '#a855f7', items: ['X1', 'X5'] }
                                ];

                                return (
                                    <>
                                        {/* THE SELECTION MATRIX CONTAINER */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0', padding: '16px 8px', background: '#18191e' }}>
                                            {constellations.map((constellation) => (
                                                <div key={constellation.title} style={{ borderRight: constellation.title !== 'Pulsar' ? '1px solid #2d3039' : 'none', padding: '0 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: constellation.color, textTransform: 'uppercase', marginBottom: '4px', borderBottom: '1px solid #2d3039', paddingBottom: '4px' }}>
                                                        {constellation.title}
                                                    </div>
                                                    {constellation.items.map((sig) => {
                                                        const uniqueId = `${constellation.title} ${sig}`;
                                                        return (
                                                            <label key={sig} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                                                {/* Unchecked by default */}
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={tempSelectedSignals.includes(uniqueId)}
                                                                    onChange={() => handleCheckChange(uniqueId)}
                                                                    style={{ margin: 0 }} 
                                                                /> {sig}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>

                                        {/* LOWER HARDWARE & TELEMETRY CONFIGURATION PARAMETERS */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', padding: '16px', background: '#111215', borderTop: '1px solid #2d3039', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ fontWeight: '600', color: '#9ca3af', borderBottom: '1px solid #2d3039', paddingBottom: '4px' }}>Sampling Rate</div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" defaultChecked /> Ideal Mode</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Rate:</span>
                                                    <select 
                                                        value={tempSampleRate} 
                                                        onChange={(e) => setTempSampleRate(e.target.value)}
                                                        style={{ background: '#1c1d22', color: '#fff', border: '1px solid #374151', borderRadius: '3px', padding: '2px 4px', fontSize: '0.75rem' }}
                                                    >
                                                        <option>1.25 MSps</option>
                                                        <option>2.60 MSps</option>
                                                        <option>5.00 MSps</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ fontWeight: '600', color: '#9ca3af', borderBottom: '1px solid #2d3039', paddingBottom: '4px' }}>Gaussian Noise</div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={tempAwgnEnabled}
                                                        onChange={(e) => setTempAwgnEnabled(e.target.checked)}
                                                    /> Add AWGN Channel
                                                </label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Offset:</span>
                                                    <input 
                                                        type="text" 
                                                        value={tempAwgnValue} 
                                                        onChange={(e) => setTempAwgnValue(e.target.value)}
                                                        style={{ background: '#1c1d22', color: '#fff', border: '1px solid #374151', borderRadius: '3px', padding: '2px 6px', width: '70px', fontSize: '0.75rem' }} 
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ fontWeight: '600', color: '#9ca3af', borderBottom: '1px solid #2d3039', paddingBottom: '4px' }}>Hardware Parameters</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.75rem', width: '50px' }}>GPU ID:</span>
                                                    <input type="number" defaultValue={0} style={{ background: '#1c1d22', color: '#fff', border: '1px solid #374151', borderRadius: '3px', padding: '2px 6px', width: '40px', fontSize: '0.75rem' }} />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.75rem', width: '50px' }}>TX Gain:</span>
                                                    <input 
                                                        type="text" 
                                                        value={tempTxGain} 
                                                        onChange={(e) => setTempTxGain(e.target.value)}
                                                        style={{ background: '#1c1d22', color: '#fff', border: '1px solid #374151', borderRadius: '3px', padding: '2px 6px', width: '65px', fontSize: '0.75rem' }} 
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '10px 16px', background: '#111215', borderTop: '1px solid #2d3039' }}>
                                        <button onClick={() => setIsGnssModalOpen(false)} style={{ background: '#2d3039', color: '#e2e8f0', border: '1px solid #4b5563', padding: '5px 14px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                                        <button 
                                            onClick={() => {
                                                const updatedSignalProfile = {
                                                    signals: tempSelectedSignals,
                                                    sampleRate: tempSampleRate,
                                                    awgn: tempAwgnEnabled,
                                                    awgnValue: tempAwgnValue,
                                                    gain: tempTxGain
                                                };

                                                if (editingSignalIndex !== null) {
                                                    // UPDATE MODE: Map over array and insert modifications smoothly at index position
                                                    const revisedSignals = addedSignals.map((item, index) => 
                                                        index === editingSignalIndex ? updatedSignalProfile : item
                                                    );
                                                    setAddedSignals(revisedSignals);
                                                } else {
                                                    // CREATE MODE: Append a completely new entry profile onto your array state tracker
                                                    setAddedSignals([...addedSignals, updatedSignalProfile]);
                                                }

                                                setIsGnssModalOpen(false);
                                                setEditingSignalIndex(null); // Flush index allocation clear
                                            }} 
                                            style={{ background: '#2563eb', color: '#fff', border: '1px solid #3b82f6', padding: '5px 18px', borderRadius: '3px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                            OK
                                        </button>
                                    </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Status/Notification Target Wrapper */}
                <ResultsModal
                    isOpen={modalConfig.isOpen}
                    onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                    title={modalConfig.title}
                    content={modalConfig.content}
                    isError={modalConfig.isError}
                />
            </div>
        );
    }
    
    return (
        <div className="controls-panel">
            {/* Map Explorer Section */}
            {!showOnlyExecution && (
                <>
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
            </>
            )}

            {/* GPS-SDR-SIM Section */}
            <div className="panel-header">
                <h1>Simulation Parameters</h1>
                <p>Configure and generate GPS-SDR-SIM commands.</p>
            </div>

            <div className="drawer-content" style={{ padding: 0 }}>
                {/* Simulation Parameters Grid */}
                <div className="panel-grid">
                    {/* 1. Location & Motion */}
                    {!showOnlyExecution && (
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
                                    <input 
                                        type="text" 
                                        value={typedLat} /* 🟢 Binds to local fluid text state */
                                        onChange={handleLatitudeChange}
                                        placeholder="0.000000"
                                    />
                                </div>
                                <div className="drawer-input-group">
                                    <label>Longitude</label>
                                    <input 
                                        type="text" 
                                        value={typedLng} /* 🟢 Binds to local fluid text state */
                                        onChange={handleLongitudeChange}
                                        placeholder="0.000000"
                                    />
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
                    )}

                    {/* 2. Ephemeris & Time */}
                    {!showOnlyExecution && (
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
                    )}
                    
                    {/* 3. Hardware Specs */}
                    {!hideExecutionSections && (
                    <div className="drawer-section">
                        <h3>Hardware Specs</h3>
                        <div className="drawer-input-group">
                            <label>Data Format and Sample Frequency</label>
                            <select
                                value={sdrPreset}
                                onChange={(e) => setSdrPreset(e.target.value)}
                            >
                                <option value="hackrf">HackRF (-b 8, -s 2600000)</option>
                                <option value="plutosdr">PlutoSDR / BladeRF (-b 16, -s 2600000)</option>
                                <option value="usrp">USRP (-b 16, -s 2500000)</option>
                                <option value="custom">Custom Configuration</option>
                            </select>
                        </div>

                        {/*CONDITIONAL DROPDOWNS POPPING UP FOR CUSTOM MODE */}
                       {sdrPreset === 'custom' && (
                            <div className="custom-config-window" style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                padding: '12px',
                                borderRadius: '6px',
                                marginTop: '10px',
                                border: '1px dashed var(--border-color)'
                          }}>
                             <div className="drawer-input-group" style={{ marginBottom: '10px' }}>
                                <label style={{ fontSize: '0.8rem', color: '#f2994a' }}>Custom Data Format (Bits)</label>
                                <select
                                     value={customBits}
                                     onChange={(e) => setCustomBits(Number(e.target.value))}
                              >
                                    <option value={1}>1-bit</option>
                                    <option value={8}>8-bit</option>
                                    <option value={16}>16-bit</option>
                              </select>
                           </div>

                           <div className="drawer-input-group" style={{ marginBottom: '0' }}>
                           <label style={{ fontSize: '0.8rem', color: '#f2994a' }}>Custom Sample Frequency</label>
                             <select
                                  value={customSampRate}
                                  onChange={(e) => setCustomSampRate(Number(e.target.value))}
                            >
                                   <option value={2600000}>2.6 MHz (2600000)</option>
                                   <option value={4000000}>4.0 MHz (4000000)</option>
                                   <option value={8000000}>8.0 MHz (8000000)</option>
                                   <option value={12500000}>12.5 MHz (12500000)</option>
                                   <option value={25000000}>25.0 MHz (25000000)</option>
                             </select>
                             </div>
                         </div>
                         )}

                        <div className="drawer-input-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label>Duration (-d) seconds</label>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Max: {maxDuration}s
                                </span>
                            </div>

                            
                            <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input
                                  type="range"
                                  min="1"
                                  max={maxDuration}
                                  value={duration}
                                  onChange={(e) => setDuration(Number(e.target.value))}
                                  style={{ width: '100%' }}
                                />
                             <input
                                 type="number"
                                 min="1"
                                 max={maxDuration}
                                 value={duration}
                                 onChange={(e) => setDuration(Number(e.target.value))}
                                 style={{ width: '97.18%', padding: '4px 8px' }}
                              />
                            </div>
                        </div>
                    </div>
                    )}

                    {/* 4. Output Actions */}
                    {!hideExecutionSections && (
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
                    )}
                </div>

                {/* Secondary Row: Execution & Verification */}
                {!hideExecutionSections && (
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
                )}

                {/* Log Terminal Section */}
                {!hideExecutionSections && (
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
                )}

                

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
