#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "nequick.h"

// Load the static maps into memory arrays
int load_nequick_grids(nequick_data_t* ne_data, const char* modip_path, const char* ccir_dir) {
    FILE* f_modip = fopen(modip_path, "r");
    if (!f_modip) {
        fprintf(stderr, "Error: Unable to open MODIP file: %s\n", modip_path);
        return -1;
    }

    // Read the 181 x 361 MODIP data points
    for (int r = 0; r < MODIP_ROWS; r++) {
        for (int c = 0; c < MODIP_COLS; c++) {
            if (fscanf(f_modip, "%f", &ne_data->modip_grid[r][c]) != 1) {
                fprintf(stderr, "Error parsing MODIP grid data line.\n");
                fclose(f_modip);
                return -1;
            }
        }
    }
    fclose(f_modip);
    printf("Successfully loaded MODIP grid map.\n");

    // Loop to read 12 month files (ccir11.asc to ccir22.asc)
    for (int m = 0; m < 12; m++) {
        char filepath[512];
        sprintf(filepath, "%s/ccir%02d.asc", ccir_dir, m + 11); // Matches typical ccir11 - ccir22 naming scheme

        FILE* f_ccir = fopen(filepath, "r");
        if (!f_ccir) {
            fprintf(stderr, "Warning: Could not open CCIR file: %s\n", filepath);
            continue;
        }

        // 1. Read the F2 matrix coefficients
        for (int r = 0; r < CCIR_ROWS; r++) {
            for (int c = 0; c < CCIR_COEF; c++) {
                if (fscanf(f_ccir, "%f", &ne_data->ccir_f2[m][r][c]) != 1) {
                    fprintf(stderr, "Error parsing F2 coefficients in %s at row %d, col %d\n", filepath, r, c);
                    fclose(f_ccir);
                    return -1;
                }
            }
        }

        // 2. Read the M3000 matrix coefficients (sitting right after F2 in the same file)
        for (int r = 0; r < CCIR_ROWS; r++) {
            for (int c = 0; c < CCIR_COEF; c++) {
                if (fscanf(f_ccir, "%f", &ne_data->ccir_m3000[m][r][c]) != 1) {
                    fprintf(stderr, "Error parsing M3000 coefficients in %s at row %d, col %d\n", filepath, r, c);
                    fclose(f_ccir);
                    return -1;
                }
            }
        }
        fclose(f_ccir);
    }

    return 0;
}

// Core calculation entry point
double calculate_nequick_delay(double rx_xyz[3], double tx_xyz[3], double freq, nequick_data_t* ne_data, gpstime_t time) {
    double stec = 0.0;

    // 1. Calculate line-of-sight ray path from Rx (User) to Tx (Satellite)
    // 2. Compute solar activity factor (Az) from the Galileo broadcast parameters
    // 3. Integrate electron density along the ray path using Simpson's rule or similar

    // Stub implementation returning 0 for now
    double delay = (40.3 * stec) / (freq * freq);
    return delay;
}