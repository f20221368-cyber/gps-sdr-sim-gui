# Project Description: GPS-SDR-SIM Desktop Controller

## 1. Overview
The **GPS-SDR-SIM Desktop Controller** is a high-fidelity, cross-platform application designed to provide a modern graphical interface for the `gps-sdr-sim` engine. It bridges the gap between complex command-line GNSS (Global Navigation Satellite System) simulation and intuitive mission planning.

## 2. Core Architecture
The system utilizes a split-process architecture to ensure stability and performance:
*   **Main Process (Electron/Node.js)**: Manages heavy-duty shell execution, file system I/O, and the pure-JS **satpos.cjs** engine for orbital mechanics.
*   **Renderer Process (React/Vite)**: Provides a high-performance mapping interface and real-time telemetry visualization.
*   **Simulation Tier**: A pre-compiled C-based engine capable of synthesizing multi-constellation baseband signals.

## 3. Latest Technological Advancements

### A. Integrated Keplerian Propagator (SkyView)
Unlike standard GUIs that rely on external binaries for visualization, this project implements a standalone JavaScript Keplerian orbital engine (**satpos.cjs**). It parses RINEX 2/3 ephemeris data and computes satellite Azimuth/Elevation in real-time, allowing users to verify constellation geometry before signal synthesis.

### B. Intelligent Trajectory Synthesis
The platform supports three distinct modes of motion planning:
1.  **Algorithmic**: Auto-generated circular and linear trajectories.
2.  **Interactive**: User-defined manual drawing directly on the global map.
3.  **Extrinsic**: Direct CSV/NMEA upload support.

### C. Enhanced RINEX Synchronization
A proprietary parsing logic specifically targets the first valid **GPS (`G`) epoch** in multi-constellation navigation files. This prevents simulation failures caused by temporal offsets often found in modern RINEX 3 files.

### D. Hardware-Locked Execution
Full integration with SDR hardware like **HackRF One**, **PlutoSDR**, and **BladeRF**. The system includes safety timeout guards (30s) and automatic I/Q bit-depth adjustment (`-b 8` vs `-b 16`) based on hardware presets.

## 4. Verification & Validation
The project includes an automated loop for Signal Quality Assurance:
*   **MATLAB softGNSS Bridge**: Automated acquisition and tracking validation with solved-coordinate feedback.
*   **PocketSDR Integration**: Support for post-processing validation of generated bitstreams.

## 5. Vision
This suite is designed for researchers and educational institutions, providing an all-in-one ecosystem for GNSS spoofing research, receiver resilience testing, and signal analysis.
