# GPS-SDR-SIM Desktop Controller

A cross-platform Electron application that provides a modern, interactive Graphical User Interface (GUI) for the popular command-line tool, `gps-sdr-sim`. By seamlessly integrating a React-based mapping frontend with a Node.js backend, this application allows users to simulate GPS baseband signal data streams visually.

## Requirements

Before running the application, ensure your system has the following requirements met:
- **Node.js** (v18+)
- **GCC (MinGW)**: Used to compile the `gps-sdr-sim` C source files into an executable.
- **SDR CLI Tools**: To transmit the generated signal directly from the app, you need tools like `hackrf_transfer` installed and added to your system `PATH`.
- **MATLAB (Optional)**: For automated signal verification and receiver plotting.

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Compile GPS-SDR-SIM**:
   Ensure `gps-sdr-sim.exe` exists in the `gps-sdr-sim/` folder. If not, compile it:
   ```bash
   cd gps-sdr-sim
   gcc gpssim.c getopt.c -lm -O3 -o gps-sdr-sim.exe
   ```
3. **Run the Application**:
   ```bash
   npm run electron:dev
   ```

---

## Key Features

### 1. Interactive Map & Mission Planning
- **Geosearch & Placement**: Use the built-in search bar (powered by OpenStreetMap) to jump to any global coordinate or landmark.
- **Dynamic Trajectory Modes**:
    - **Auto-Generate**: Instantly create a circular motion path around any center point.
    - **Manual Drawing**: Click on the map to draw custom, multi-waypoint routes. The app automatically interpolates these into high-density navigation data.
    - **CSV Upload**: Import existing motion files directly into the simulation pipeline.

### 2. Intelligent Signal Parameterization
- **RINEX Multi-Constellation Parser**: Automatically extracts the simulation start time from RINEX 2 or RINEX 3 headers. The parser is specifically optimized to synchronize with the first **GPS (`G`)** epoch record, ensuring temporal alignment with the ephemeris.
- **SkyView Verification**: A real-time satellite constellation plotter (Picture-in-Picture). It uses a pure-JavaScript Keplerian orbital propagator to visualize Azimuth/Elevation geometry directly in the UI before you even start the simulation.

### 3. Hardware-Ready Execution
- **SDR Hardware Presets**: One-click configuration for popular SDRs:
    - **HackRF One**: Optimized for 8-bit I/Q at 2.6 Msps.
    - **PlutoSDR / BladeRF**: Optimized for 16-bit I/Q at 2.6 Msps.
    - **USRP**: Optimized for 16-bit I/Q at 2.5 Msps.
- **Direct Transmission**: Transmit generated signals immediately via `hackrf_transfer` with integrated safety timeouts and hardware connectivity guards.

### 4. Advanced Verification Pipelines
- **MATLAB Integration**: A standalone "Verify with MATLAB" button that triggers an automated tracking and acquisition receiver loop, plotting the "Solved Position" back onto your map.
- **PocketSDR Processing**: Direct output action to process and validate generated bitstreams using the PocketSDR suite.

---

## Technical Stack
- **Frontend**: React 18, Vite, OpenLayers/Leaflet
- **Desktop**: Electron (Main/Renderer IPC Architecture)
- **Signal Engine**: gps-sdr-sim (C)
- **Orbital Logic**: satpos.cjs (Pure-JS Keplerian engine)
- **Verification**: MATLAB (softGNSS), PocketSDR
- **Styling**: Modern Vanilla CSS (Dark Mode, Glassmorphism)

---

## Safety & Legal
**Warning**: Transmitting GNSS signals on L1/L2 frequencies without a shielded environment (Faraday cage) is illegal in many jurisdictions. This software is provided for research and educational purposes only.
