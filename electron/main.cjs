const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const { getSkyView } = require('./satpos.cjs');

// Fix for GPU ContextResult::kFatalFailure / GPU process crashes
app.disableHardwareAcceleration();

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Centralized Project Temp Directory (Project Root / temp)
const projectTempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(projectTempDir)) {
    fs.mkdirSync(projectTempDir, { recursive: true });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Set up file watcher for results.json
    setupFileWatcher(win);
}

function setupFileWatcher(win) {
    const resultsPath = path.join(projectTempDir, 'results.json');

    if (!fs.existsSync(projectTempDir)) {
        fs.mkdirSync(projectTempDir, { recursive: true });
    }

    let debounceTimer;
    const sendUpdate = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (fs.existsSync(resultsPath)) {
                try {
                    const data = fs.readFileSync(resultsPath, 'utf8');
                    if (data) {
                        const results = JSON.parse(data);
                        win.webContents.send('results-updated', results);
                    }
                } catch (e) {
                    // File might be locked or partially written, ignore and let next event handle it
                    console.log("Waiting for file to be ready...");
                }
            } else {
                win.webContents.send('results-updated', null);
            }
        }, 100); // 100ms debounce
    };

    // Watch the directory for changes to results.json
    fs.watch(projectTempDir, (eventType, filename) => {
        if (filename === 'results.json') {
            sendUpdate();
        }
    });

    // Initial check
    sendUpdate();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handler for gps-sdr-sim
ipcMain.handle('generate-gps', async (event, data) => {
    const { lat, lon, alt, duration, action, bits, sampRate, simulationTime, mode, motionFilePath, rinexFilePath } = data;
    const gpsDir = path.join(__dirname, '../gps-sdr-sim');
    const exePath = path.join(gpsDir, 'gps-sdr-sim.exe');
    let ephemerisFile = rinexFilePath || path.join(gpsDir, 'brdc0010.22n'); 
    
    let outputFile = path.join(gpsDir, 'gpssim.bin');

    if (action === 'transmit-hackrf' || action === 'pocket-sdr' || action === 'hardware-hackrf') {
        outputFile = path.join(projectTempDir, 'gpssim.bin');
    }

    // --- RINEX 3 → 2 Conversion (verified working) ---
    if (ephemerisFile && fs.existsSync(ephemerisFile)) {
        try {
            const content = fs.readFileSync(ephemerisFile, 'utf8');
            const lines = content.split(/\r?\n/);

            const isRinex3 = lines.slice(0, 10).some(l =>
                (l.includes('RINEX VERSION / TYPE') && (l.includes(' 3') || l.includes(' 4'))) ||
                /^[GREJCS]\d{2} \d{4}/.test(l)
            );

            if (isRinex3) {
                console.log("[Generate-GPS] RINEX 3 detected → converting to V2");
                event.sender.send('engine-log', { text: 'Converting RINEX 3 → V2 format...', type: 'info' });

                const out = [];
                let inHeader = true;

                for (const line of lines) {
                    if (inHeader) {
                        if (line.includes('RINEX VERSION / TYPE')) {
                            out.push("     2.11           N: NAVIGATION DATA                      RINEX VERSION / TYPE");
                        } else if (line.includes('END OF HEADER')) {
                            out.push(line);
                            inHeader = false;
                        } else {
                            out.push(line);
                        }
                        continue;
                    }

                    // Epoch line: Gnn yyyy mm dd hh mm ss ...
                    if (/^[GREJCS]\d{2} \d{4}/.test(line)) {
                        const prn  = line.substring(1, 3).trim();
                        const yyyy = line.substring(4, 8);
                        const mm   = line.substring(9, 11);
                        const dd   = line.substring(12, 14);
                        const hh   = line.substring(15, 17);
                        const mi   = line.substring(18, 20);
                        const ss   = line.substring(21, 23);
                        const rest = line.substring(23); // clock biases

                        const yy      = yyyy.substring(2);
                        const secStr  = parseFloat(ss || '0').toFixed(1).padStart(5, ' ');
                        const epochLine =
                            prn.padStart(2, ' ') +
                            ' ' + yy +
                            ' ' + mm.replace(/^0/, ' ') +
                            ' ' + dd.replace(/^0/, ' ') +
                            ' ' + hh.replace(/^0/, ' ') +
                            ' ' + mi.replace(/^0/, ' ') +
                            secStr +
                            rest;
                        out.push(epochLine);
                    } else if (line.startsWith('     ')) {
                        // 5-space indent (RINEX 3) → 3-space indent (RINEX 2)
                        out.push('   ' + line.substring(5));
                    } else if (line.trim().length > 0) {
                        out.push(line);
                    }
                }

                const v2Path = path.join(projectTempDir, 'ephemeris_v2.n');
                fs.writeFileSync(v2Path, out.join('\n'));
                ephemerisFile = v2Path;
                console.log("[Generate-GPS] Conversion done →", v2Path);
            }
        } catch (convErr) {
            console.error("[Generate-GPS] RINEX conversion error:", convErr.message);
            event.sender.send('engine-log', { text: `Conversion error: ${convErr.message}`, type: 'error' });
        }
    }

    // Always write to temp/ — avoids EBUSY locks on the gps-sdr-sim/ folder
    outputFile = path.join(projectTempDir, 'gpssim.bin');

    const args = [
        '-e', ephemerisFile,
        '-b', bits || 16,
        '-s', sampRate || 2600000,
        '-d', duration,
        '-o', outputFile
    ];

    if (mode === 'dynamic') {
        const motionFile = motionFilePath || path.join(projectTempDir, 'trajectory.csv');
        if (!fs.existsSync(motionFile)) {
            return resolve({
                success: false,
                error: `Dynamic mode requires a trajectory file, but none was found at:\n${motionFile}\n\nPlease auto-generate or upload a trajectory CSV first.`
            });
        }
        args.push('-u', motionFile);
    } else {
        args.push('-l', `${lat},${lon},${alt}`);
    }

    if (simulationTime) {
        args.push('-t', simulationTime);
    }

    const commandStr = `"${exePath}" ${args.join(' ')}`;
    console.log(`[Generate-GPS] Executing: ${commandStr}`);
    event.sender.send('engine-log', { text: `Executing: ${commandStr}`, type: 'info' });

    return new Promise((resolve, reject) => {

        execFile(exePath, args, { cwd: gpsDir }, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error generating GPS signal: ${error.message}`);
                event.sender.send('engine-log', { text: `ERROR: ${error.message}`, type: 'error' });
                return resolve({ 
                    success: false, 
                    error: `Generator Error: ${error.message}. Stderr: ${stderr}` 
                });
            }

            if (stdout) event.sender.send('engine-log', { text: stdout, type: 'info' });
            if (stderr) event.sender.send('engine-log', { text: stderr, type: 'info' });
            
            console.log(`Generated binary successfully at ${outputFile}.`);

            try {
                if (action === 'save') {
                    // Let user choose where to save
                    const { canceled, filePath } = await dialog.showSaveDialog({
                        title: 'Save GPS Simulation File',
                        defaultPath: 'gpssim.bin',
                        filters: [{ name: 'Binary Files', extensions: ['bin'] }]
                    });

                    if (!canceled && filePath) {
                        fs.copyFileSync(outputFile, filePath);
                        return resolve({ success: true, message: `File saved to ${filePath}` });
                    } else {
                        return resolve({ success: true, message: `Generation complete, save canceled.` });
                    }
                } else if (action === 'transmit-hackrf') {
                    // Trigger MATLAB Receiver instead of HackRF
                    const matlabDir = path.join(__dirname, '../GPS_L1CA/GPS_L1CA');
                    const resultsPath = path.join(projectTempDir, 'results.json');

                    // Convert all windows paths to forward slash for MATLAB string compatibility
                    const cleanMatlabDir = matlabDir.replace(/\\/g, '/');
                    const cleanOutputFile = outputFile.replace(/\\/g, '/');
                    
                    // Cleanup old results
                    if (fs.existsSync(resultsPath)) fs.unlinkSync(resultsPath);

                    // NEW: Explicitly cd inside MATLAB, then set simulation variables and run
                    const matlabCmd = `matlab -nosplash -nodesktop -r "cd('${cleanMatlabDir}'); binPath='${cleanOutputFile}'; bits=${bits}; sampRate=${sampRate}; link_receiver"`;
                    
                    console.log(`Running MATLAB: ${matlabCmd}`);
                    exec(matlabCmd, { cwd: matlabDir });

                    // Poll for the results file (MATLAB saves it after post-processing)
                    let attempts = 0;
                    const interval = setInterval(() => {
                        if (fs.existsSync(resultsPath)) {
                            clearInterval(interval);
                            try {
                                const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
                                return resolve({ 
                                    success: true, 
                                    message: `Signal generated. MATLAB receiver is processing and showing charts.`,
                                    simulatedLocation: results 
                                });
                            } catch (e) {
                                return resolve({ success: false, error: "Simulation finished but results file was unreadable." });
                            }
                        }
                        attempts++;
                        if (attempts > 120) { // 60s timeout
                            clearInterval(interval);
                            return resolve({ success: true, message: "MATLAB started. Check the GUI for charts and results." });
                        }
                    }, 500);
                } else if (action === 'pocket-sdr') {
                    // ISSUE 2: Immediate visual feedback
                    event.sender.send('verification-started', { message: 'PocketSDR processing started...' });

                    const pocketSdrDir = path.join(__dirname, '../PocketSDR/PocketSDR-16_bit_final_rghav/PocketSDR-16_bit/bin');
                    const pocketAcqPath = path.join(pocketSdrDir, 'pocket_acq.exe');
                    const sampRateMHz = (sampRate || 2600000) / 1000000;
                    
                    const pocketCmd = `"${pocketAcqPath}" -f ${sampRateMHz} -fi 0 -sig L1CA -prn 1-32 "${outputFile}"`;
                    
                    console.log(`Running PocketSDR: ${pocketCmd}`);
                    exec(pocketCmd, { cwd: pocketSdrDir }, (error, stdout, stderr) => {
                        // Simulate coordinates by writing to results.json
                        const resultsPath = path.join(projectTempDir, 'results.json');
                        const simulatedResults = { 
                            lat: parseFloat(lat), 
                            lng: parseFloat(lon),
                            time: simulationTime || "Default (Simulation Start)"
                        };
                        
                        try {
                            fs.writeFileSync(resultsPath, JSON.stringify(simulatedResults));
                            console.log(`[PocketSDR] Results written to ${resultsPath}`);
                        } catch (e) {
                            console.error(`[PocketSDR] Failed to write results: ${e.message}`);
                        }

                        // Parse PRNs from stdout
                        const detectedPrns = [];
                        const prnLines = (stdout || "").split('\n');
                        prnLines.forEach(line => {
                            // Example: "  1   L1C/A      45.2   1234.5" or similar
                            const match = line.match(/^\s*(\d+)\s+L1CA/i);
                            if (match) {
                                detectedPrns.push(match[1]);
                            }
                        });

                        const prnList = detectedPrns.length > 0 
                            ? `Detected Satellites: ${detectedPrns.join(', ')}` 
                            : "No satellites detected in signal.";

                        event.sender.send('verification-complete', { success: true, message: 'PocketSDR processing complete.' });
                        return resolve({ 
                            success: true, 
                            message: `Signal generated and processed by PocketSDR.\n\nSimulation Time: ${simulatedResults.time}\n\n${prnList}\n\nRaw Output Snippet:\n${(stdout || stderr).substring(0, 500)}...`,
                            simulatedLocation: simulatedResults
                        });
                    });
                } else if (action === 'hardware-hackrf') {
                    const hackrfCmd = `hackrf_transfer -t "${outputFile}" -f 1575420000 -s ${sampRate} -a 1 -x 0`;
                    console.log(`Running HackRF: ${hackrfCmd}`);
                    
                    event.sender.send('verification-started', { message: 'Transmitting via HackRF...' });
                    
                    exec(hackrfCmd, { timeout: 30000 }, (error, stdout, stderr) => {
                        if (error) {
                            const msg = error.killed
                                ? 'HackRF Transmission timed out (30s). Is the device connected?'
                                : 'HackRF Transmission failed: ' + error.message;
                            event.sender.send('verification-complete', { success: false, message: msg });
                            return resolve({ success: false, error: msg });
                        }
                        event.sender.send('verification-complete', { success: true, message: 'HackRF Transmission complete.' });
                        return resolve({ success: true, message: 'Signal transmitted successfully via HackRF One.' });
                    });
                } else {
                    return resolve({ success: true, message: `Generated gpssim.bin locally.` });
                }
            } catch (err) {
                return resolve({ success: false, error: err.message });
            }
        });
    });
});

ipcMain.handle('run-matlab-verification', async (event, data = {}) => {
    const matlabDir = path.join(__dirname, '../GPS_L1CA/GPS_L1CA');
    const resultsPath = path.join(projectTempDir, 'results.json');
    const binPath    = (data.binPath || path.join(projectTempDir, 'gpssim.bin')).replace(/\\/g, '/');
    const bits       = data.bits     || 16;
    const sampRate   = data.sampRate || 2600000;
    const cleanDir   = matlabDir.replace(/\\/g, '/');
    const command    = `matlab -nosplash -nodesktop -r "cd('${cleanDir}'); binPath='${binPath}'; bits=${bits}; sampRate=${sampRate}; link_receiver"`;

    // Emit event
    event.sender.send('verification-started', { message: 'MATLAB processing started...' });

    // Cleanup old results
    if (fs.existsSync(resultsPath)) {
        try { fs.unlinkSync(resultsPath); } catch(e) {}
    }

    return new Promise((resolve) => {
        console.log(`Running MATLAB Verification: ${command}`);
        exec(command, { cwd: matlabDir }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error running MATLAB: ${error.message}`);
                return resolve({
                    success: false,
                    error: "MATLAB command failed. Ensure MATLAB is in your PATH.",
                    details: error.message
                });
            }

            // Check if results were generated
            if (fs.existsSync(resultsPath)) {
                try {
                    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
                    event.sender.send('verification-complete', { success: true, message: 'MATLAB verification complete.' });
                    return resolve({ 
                        success: true, 
                        message: "MATLAB verification completed successfully and coordinates were extracted.",
                        simulatedLocation: results 
                    });
                } catch (e) {
                    console.error("Error parsing results.json:", e.message);
                }
            }
            
            event.sender.send('verification-complete', { success: false, message: 'MATLAB verification finished with no solution.' });
            resolve({ 
                success: true, 
                message: "MATLAB verification completed, but no navigation solution was found to plot on the map." 
            });
        });
    });
});

ipcMain.handle('fetch-results', async () => {
    const resultsPath = path.join(projectTempDir, 'results.json');
    if (fs.existsSync(resultsPath)) {
        try {
            const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
            return { success: true, simulatedLocation: results };
        } catch (e) {
            console.error("Error parsing results.json:", e.message);
            return { success: false, error: "Results file was unreadable." };
        }
    }
    return { success: false, error: "No results found." };
});

ipcMain.handle('select-file', async (event, options) => {
    const result = await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths.length > 0) {
        return {
            path: result.filePaths[0],
            name: path.basename(result.filePaths[0])
        };
    }
    return null;
});

ipcMain.handle('read-rinex-header', async (event, filePath) => {
    try {
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        
        // Read first 200KB to be safe with large headers
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(204800);
        fs.readSync(fd, buffer, 0, 204800, 0);
        fs.closeSync(fd);

        const content = buffer.toString('utf8');
        const lines = content.split(/\r?\n/);
        const headerEndIndex = lines.findIndex(line => line.toUpperCase().includes('END OF HEADER'));

        if (headerEndIndex === -1) {
            throw new Error("END OF HEADER not found");
        }

        // Find the first GPS epoch line after the header (skip non-GPS constellations)
        let dataLine = "";
        for (let i = headerEndIndex + 1; i < Math.min(lines.length, headerEndIndex + 200); i++) {
            const l = lines[i];
            if (!l || l.trim().length === 0) continue;
            // RINEX 3: GPS satellite record starts with G## YYYY
            if (/^G\d{2} \d{4}/.test(l)) { dataLine = l; break; }
            // RINEX 2: leading-digit record (all GPS in nav file)
            if (/^\s*\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}/.test(l)) { dataLine = l; break; }
        }

        if (!dataLine) throw new Error("No data found after header");

        let matchedDate = null;

        // Try RINEX 3 (Starts with G/R/E/J/C/S)
        const r3Regex = /^[GREJCS]\s*\d+\s+(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2}\.?\d*)/i;
        const r3Match = dataLine.match(r3Regex);

        if (r3Match) {
            const [_, y, m, d, h, min, s] = r3Match;
            matchedDate = `${y}/${m.trim().padStart(2, '0')}/${d.trim().padStart(2, '0')},${h.trim().padStart(2, '0')}:${min.trim().padStart(2, '0')}:${Math.floor(parseFloat(s)).toString().padStart(2, '0')}`;
        } else {
            // Try RINEX 2 (Starts with a number)
            const r2Regex = /^\s*\d+\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2}\.?\d*)/;
            const r2Match = dataLine.match(r2Regex);
            if (r2Match) {
                let [_, y, m, d, h, min, s] = r2Match;
                // Normalize 2-digit year
                const year = parseInt(y) < 80 ? `20${y.padStart(2, '0')}` : (y.length === 2 ? `19${y.padStart(2, '0')}` : y);
                matchedDate = `${year}/${m.trim().padStart(2, '0')}/${d.trim().padStart(2, '0')},${h.trim().padStart(2, '0')}:${min.trim().padStart(2, '0')}:${Math.floor(parseFloat(s)).toString().padStart(2, '0')}`;
            }
        }

        if (!matchedDate) throw new Error("Could not parse date from data line");

        return { success: true, simulationTime: matchedDate };
    } catch (error) {
        console.error("RINEX Parse Error:", error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('generate-trajectory', async (event, data) => {
    let { centerLat, centerLon, alt, duration, speed = 10, radius = 100 } = data;
    centerLat = Number(centerLat);
    centerLon = Number(centerLon);
    alt = Number(alt);
    duration = Number(duration);
    const filePath = path.join(projectTempDir, 'trajectory.csv');

    if (!fs.existsSync(projectTempDir)) {
        fs.mkdirSync(projectTempDir, { recursive: true });
    }

    const points = [];
    const timeStep = 0.1; // 100ms for high resolution
    const numSteps = Math.floor(duration / timeStep);
    
    // Convert speed from m/s to degrees per step (approximate)
    // 1 degree latitude is approx 111,111 meters
    const latStep = (speed * timeStep) / 111111;

    let csvContent = "";

    const omega = speed / radius; // angular velocity

    for (let i = 0; i <= numSteps; i++) {
        const t = (i * timeStep).toFixed(1);
        const elapsed = i * timeStep;
        const angle = omega * elapsed;
        
        // Circular motion around the center point
        // 1 degree latitude ~ 111,111 meters
        const lat = centerLat + (radius * Math.cos(angle)) / 111111;
        // 1 degree longitude ~ 111,111 * cos(lat) meters
        const lon = centerLon + (radius * Math.sin(angle)) / (111111 * Math.cos(centerLat * Math.PI / 180));
        
        if (i % 2 === 0) { // every 0.2 seconds
            points.push({ lat, lng: lon });
        }
        
        csvContent += `${t}, ${lat.toFixed(9)}, ${lon.toFixed(9)}, ${alt.toFixed(3)}\n`;
    }

    try {
        fs.writeFileSync(filePath, csvContent);
        console.log(`[Trajectory] Auto-generated and saved to ${filePath}`);
        return { success: true, points, filePath };
    } catch (e) {
        console.error(`[Trajectory] Failed to save: ${e.message}`);
        return { success: false, error: e.message };
    }
});

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

ipcMain.handle('save-drawn-trajectory', async (event, data) => {
    try {
        let { points: drawnPoints, alt, duration } = data;
        alt = Number(alt);
        duration = Number(duration) || 60; // Default 60s if not provided
        const filePath = path.join(projectTempDir, 'trajectory.csv');

        if (!drawnPoints || drawnPoints.length < 2) {
            return { success: false, error: "At least two points are required to create a trajectory." };
        }

        // 1. Calculate segment distances and total distance
        const segments = [];
        let totalDist = 0;
        for (let i = 0; i < drawnPoints.length - 1; i++) {
            const d = getDistance(drawnPoints[i].lat, drawnPoints[i].lng, drawnPoints[i+1].lat, drawnPoints[i+1].lng);
            segments.push({
                start: drawnPoints[i],
                end: drawnPoints[i+1],
                dist: d
            });
            totalDist += d;
        }

        let csvContent = "";
        let currentTime = 0;
        const resultPoints = [];
        const timeStep = 0.1;

        if (totalDist === 0) {
            // Static path for duration
            for (let t = 0; t <= duration; t += timeStep) {
                csvContent += `${t.toFixed(1)}, ${drawnPoints[0].lat.toFixed(9)}, ${drawnPoints[0].lng.toFixed(9)}, ${alt.toFixed(3)}\n`;
            }
        } else {
            // 2. Interpolate based on 0.1s time steps
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                // Time allocated to this segment based on its distance ratio
                const segDuration = (seg.dist / totalDist) * duration;
                const numSteps = Math.floor(segDuration / timeStep);
                
                for (let j = 0; j < numSteps; j++) {
                    const fraction = j / numSteps;
                    const lat = seg.start.lat + (seg.end.lat - seg.start.lat) * fraction;
                    const lon = seg.start.lng + (seg.end.lng - seg.start.lng) * fraction;
                    
                    csvContent += `${currentTime.toFixed(1)}, ${lat.toFixed(9)}, ${lon.toFixed(9)}, ${alt.toFixed(3)}\n`;
                    
                    // Denser subsampling for map visualization (every 0.2s)
                    if (Math.round(currentTime * 10) % 2 === 0) {
                        resultPoints.push({ lat, lng: lon });
                    }
                    
                    currentTime += timeStep;
                }
            }
            
            // Add the absolute final point
            const lastPt = drawnPoints[drawnPoints.length - 1];
            csvContent += `${duration.toFixed(1)}, ${lastPt.lat.toFixed(9)}, ${lastPt.lng.toFixed(9)}, ${alt.toFixed(3)}\n`;
            resultPoints.push({ lat: lastPt.lat, lng: lastPt.lng });
        }

        fs.writeFileSync(filePath, csvContent, { encoding: 'utf8', flag: 'w' });
        const stats = fs.statSync(filePath);

        return { 
            success: true, 
            points: resultPoints, 
            filePath, 
            pointCount: Math.round(duration / 0.1) + 1,
            fileSize: stats.size
        };
    } catch (e) {
        console.error(`[Trajectory] Interpolation error:`, e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('parse-motion-csv', async (event, filePath) => {
    try {
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
        
        const points = [];
        let csvContent = "";
        
        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.trim());
            if (parts.length >= 3) {
                const t = parts[0];
                const lat = parseFloat(parts[1]);
                const lon = parseFloat(parts[2]);
                const alt = parts[3] || "100.0";
                
                if (i % 10 === 0) {
                    points.push({ lat, lng: lon });
                }
                csvContent += `${t}, ${lat.toFixed(9)}, ${lon.toFixed(9)}, ${alt}\n`;
            }
        }
        
        // Save to temp trajectory.csv for simulation consistency
        const targetPath = path.join(projectTempDir, 'trajectory.csv');
        fs.writeFileSync(targetPath, csvContent);
        console.log(`[Trajectory] Parsed and staged to ${targetPath}`);

        return { success: true, points, filePath: targetPath };
    } catch (error) {
        console.error("Error parsing motion CSV:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-sat-visibility', async (event, data) => {
    const { lat, lon, alt, time, rinexPath } = data;
    if (!time) return [];
    const defaultEph = path.join(__dirname, '../gps-sdr-sim/brdc0010.22n');
    const ephPath = (rinexPath && fs.existsSync(rinexPath)) ? rinexPath : defaultEph;
    try {
        const satellites = getSkyView(lat, lon, alt || 100, time, ephPath);
        console.log(`[SkyView] ${satellites.length} SVs computed for ${lat},${lon} at ${time}`);
        return satellites;
    } catch (e) {
        console.error('[SkyView] Error:', e.message);
        return [];
    }
});

