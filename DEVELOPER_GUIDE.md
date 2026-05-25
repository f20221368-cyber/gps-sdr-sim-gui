# GNSS Simulation GUI — Developer Guide & Handoff Document

This document serves as the comprehensive technical reference for the GNSS Simulation GUI. It is designed for future developers or researchers who will inherit, maintain, or expand this codebase. It explains the project architecture, maps out where each feature's source code lives, and provides instructions on how to safely implement changes.

---

## 1. High-Level Architecture

The project is built on an **Electron + React + Vite** stack. It uses a split architecture where the React frontend handles UI/UX, and the Node.js backend (Electron Main Process) handles heavy lifting, file I/O, and shell execution of external tools (C binaries, MATLAB, HackRF).

*   **Frontend (Renderer Process):** React 18, Vite, React-Leaflet (for maps). Runs with standard web security; cannot touch the filesystem directly.
*   **IPC Bridge:** A secure `preload.cjs` script exposes specific backend functions to the frontend via `window.api`.
*   **Backend (Main Process):** Node.js running inside Electron. Executes child processes (`exec`, `execFile`) to run `gps-sdr-sim.exe`, MATLAB, and SDR transmission commands.
*   **Simulation Engine:** The core GNSS signal generation is handled by a compiled C binary (`gps-sdr-sim.exe`), originally based on the open-source `gps-sdr-sim` repository but wrapped by this GUI.

---

## 2. Directory Structure Overview

```text
c:\Users\Advait Raut\Desktop\gui\
├── electron/                 # Node.js Backend Code
│   ├── main.cjs              # The core backend logic & IPC handlers
│   ├── preload.cjs           # Context bridge (window.api)
│   └── satpos.cjs            # Pure-JS Keplerian orbital propagator for SkyView
├── src/                      # React Frontend Code
│   ├── App.jsx               # Main React entrypoint and state holder
│   ├── index.css             # Global styles and dark-mode tokens
│   └── components/           # React Components
│       ├── ControlPanel.jsx  # Right sidebar (Settings, inputs, terminal log)
│       ├── MapPip.jsx        # Bottom-left widget (Mini-map & SkyView Canvas)
│       └── ResultsModal.jsx  # Modal for PocketSDR verification output
├── gps-sdr-sim/              # The C Simulation Engine
│   ├── gpssim.c              # Core C source code for GNSS generation
│   └── gps-sdr-sim.exe       # Pre-compiled Windows binary
├── GPS_L1CA/                 # MATLAB tracking code (External dependency)
├── temp/                     # Ephemeral folder for outputs (.bin, .csv, .json)
└── package.json              # NPM dependencies & build scripts
```

---

## 3. Feature Mapping: Where does the code live?

If you need to fix a bug or add a feature, use this mapping to find the relevant code:

### 3.1 The Map & Coordinates
*   **Frontend UI:** `src/App.jsx` handles the main React-Leaflet map rendering and marker placement.
*   **Custom Drawing:** Handled in `src/App.jsx` (`handleMapClick` and `handleSaveDrawnTrajectory`).
*   **Note:** The user's selected location (red marker) or MATLAB-verified location (blue marker) are managed via state in `App.jsx` and passed down as props.

### 3.2 Control Panel & Inputs
*   **Frontend UI:** `src/components/ControlPanel.jsx`
*   **Logic:** This massive component handles:
    *   Reading the SDR Preset dropdown (HackRF, PlutoSDR).
    *   Building the "Generated Command" preview string.
    *   Handling file uploads (RINEX, custom trajectories).
    *   Displaying the terminal output log (`onEngineLog` listener).

### 3.3 GNSS Binary Generation (`gps-sdr-sim`)
*   **Frontend Trigger:** `handleGenerate` in `ControlPanel.jsx`.
*   **IPC Bridge:** `window.api.generateGps(...)`
*   **Backend Execution:** `electron/main.cjs` (Search for `ipcMain.handle('generate-gps')`).
    *   This handler constructs the massive array of arguments (`-l`, `-u`, `-e`, `-b`, `-s`, etc.) and spawns `gps-sdr-sim.exe`.
    *   It routes the execution based on the chosen "Output Action" (Save to file, PocketSDR, or HackRF Transmit).

### 3.4 SkyView (Satellite Geometry Visualization)
*   **Frontend UI & Canvas:** `src/components/MapPip.jsx`. It renders an HTML5 `<canvas>` and draws green dots using simple polar-to-Cartesian math (`azimuth` and `elevation`).
*   **Backend Math:** `electron/satpos.cjs`. Because the C engine lacked a flag for satellite geometry extraction, this standalone JavaScript module parses the RINEX file, applies Kepler's equations to find ECEF coordinates, and converts them to Azimuth/Elevation angles for the frontend.

### 3.5 External Verifications (MATLAB & PocketSDR)
*   **MATLAB Execution:** Triggered in `ControlPanel.jsx`, handled in `main.cjs` (`run-matlab-verification`). It spawns a background `matlab -nosplash -nodesktop` process and passes the binary path and SDR specs.
*   **PocketSDR Execution:** Handled natively within the `generate-gps` IPC handler in `main.cjs` if the user selects that specific output action.

---

## 4. How to Make Changes & Add Features

### Rule #1: Follow the IPC Pattern
If the frontend (React) needs to touch the filesystem, run a shell command, or do heavy processing, it **must** go through the IPC bridge.
1.  **Frontend:** Call `window.api.doSomething(data)`.
2.  **Bridge (`preload.cjs`):** Add `doSomething: (data) => ipcRenderer.invoke('do-something', data)`.
3.  **Backend (`main.cjs`):** Add `ipcMain.handle('do-something', async (event, data) => { ... })`.

### Rule #2: Temporary Files go in `temp/`
Do not write outputs to the root directory or the desktop. Use the `projectTempDir` defined at the top of `main.cjs`.
*   Trajectories go to `temp/trajectory.csv`
*   Binaries go to `temp/gpssim.bin`
*   Results go to `temp/results.json`

### Common Future Modification Scenarios:

**Scenario A: Adding a new SDR Hardware Preset**
1.  Open `src/components/ControlPanel.jsx`.
2.  Locate the `sdrSpecs` object (around line 140).
3.  Add the new hardware spec (e.g., `limesdr: { name: 'LimeSDR', b: 12, s: 2600000 }`).
4.  Add the corresponding `<option>` in the `<select>` dropdown rendering block.

**Scenario B: Modifying the `gps-sdr-sim` C Code**
1.  Edit `gps-sdr-sim/gpssim.c`.
2.  You **must recompile** the binary for changes to take effect.
3.  Open a terminal with a C compiler (like MinGW GCC) in the `gps-sdr-sim` folder.
4.  Run: `gcc gpssim.c -lm -O3 -o gps-sdr-sim.exe`.
5.  The Electron app will immediately use the newly compiled `.exe` on the next run.

**Scenario C: Updating the SkyView Orbital Math**
1.  If satellites are plotting incorrectly, the math lives in `electron/satpos.cjs`.
2.  Modifications to `.cjs` backend files require a full restart of the Electron development server (`Ctrl+C`, then `npm run electron:dev`). React hot-reloading does not apply to the main process.

---

## 5. Build & Deployment

To package the application for end-users (creating an installer):
1.  Ensure all dependencies are installed: `npm install`
2.  Run the build script: `npm run build:electron`
3.  The output installer will be located in the `dist_electron/` folder.

> **Note on Windows Caching:** If `electron-builder` fails due to cache lock errors (common on Windows), try deleting the `dist_electron` and `dist` folders manually before running the build command.
