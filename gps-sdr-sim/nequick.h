#ifndef NEQUICK_H
#define NEQUICK_H

#include "gpssim.h"

// Grid dimensions
#define MODIP_ROWS 181
#define MODIP_COLS 361
#define CCIR_ROWS 181
#define CCIR_COEF 13

// Structure to hold loaded grid data in memory
typedef struct {
    float modip_grid[MODIP_ROWS][MODIP_COLS];
    float ccir_f2[12][CCIR_ROWS][CCIR_COEF];
    float ccir_m3000[12][CCIR_ROWS][CCIR_COEF];

    // Broadcast parameters from Galileo nav message
    double ai0, ai1, ai2;
    int month;
} nequick_data_t;

// Function declarations
int load_nequick_grids(nequick_data_t* ne_data, const char* modip_path, const char* ccir_dir);
double calculate_nequick_delay(double rx_xyz[3], double tx_xyz[3], double freq, nequick_data_t* ne_data, gpstime_t time);

#endif