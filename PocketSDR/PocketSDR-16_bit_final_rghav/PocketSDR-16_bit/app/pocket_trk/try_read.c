#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

// Function to execute when row count exceeds 4
void process_file(const char* filename) {
    // Open the file for processing
    FILE* file = fopen(filename, "r");
    if (file == NULL) {
        printf("Error opening file %s for processing: %s\n", filename, strerror(errno));
        return;
    }
    
    // Process the second column (sum values)
    double sum = 0.0;
    char line[1024];
    int row = 0;
    
    // Create diagnostic file to track values
    FILE* diag_file = fopen("diagnostic.txt", "w");
    if (diag_file == NULL) {
        printf("Failed to create diagnostic file\n");
        fclose(file);
        return;
    }
    
    fprintf(diag_file, "Starting to process %s\n", filename);
    
    // Read each line
    while (fgets(line, sizeof(line), file) != NULL) {
        row++;
        fprintf(diag_file, "Row %d: %s", row, line);
        
        // Skip header row
        if (row == 1) {
            fprintf(diag_file, "Skipping header row\n");
            continue;
        }
        
        // Make a copy of the line before tokenizing
        char line_copy[1024];
        strcpy(line_copy, line);
        
        // Parse the CSV to get the second column
        char* token = strtok(line_copy, ",");
        if (token == NULL) {
            fprintf(diag_file, "Failed to extract first column in row %d\n", row);
            continue;
        }
        
        token = strtok(NULL, ",");
        if (token == NULL) {
            fprintf(diag_file, "Failed to extract second column in row %d\n", row);
            continue;
        }
        
        // Convert to double and add to sum
        double value = atof(token);
        sum += value;
        fprintf(diag_file, "Row %d: Second column value: %f, Running sum: %f\n", row, value, sum);
    }
    
    fclose(file);
    
    // Create output file with sum
    FILE* out_file = fopen("column_sum.csv", "w");
    if (out_file == NULL) {
        fprintf(diag_file, "Failed to create output file: %s\n", strerror(errno));
        fclose(diag_file);
        return;
    }
    
    fprintf(out_file, "Column2Sum,%f\n", sum);
    fclose(out_file);
    
    fprintf(diag_file, "Processing complete. Final sum: %f\n", sum);
    fprintf(diag_file, "Sum written to column_sum.csv\n");
    fclose(diag_file);
    
    printf("Processing complete. Sum of second column: %f\n", sum);
}

// Main function
int main(int argc, char** argv) {
    const char* filename = ".pocket_navdata2.csv";  // Default filename
    
    // Use command line argument as filename if provided
    if (argc > 1) {
        filename = argv[1];
    }
    
    printf("Starting program\n");
    printf("Checking file: %s\n", filename);
    
    // Open the file and count rows
    FILE* file = fopen(filename, "r");
    if (file == NULL) {
        printf("Error opening file %s: %s\n", filename, strerror(errno));
        return 1;
    }
    
    // Count rows
    int row_count = 0;
    char buffer[1024];
    
    while (fgets(buffer, sizeof(buffer), file) != NULL) {
        row_count++;
    }
    
    fclose(file);
    
    printf("File has %d rows\n", row_count);
    
    // Check if we have more than 4 rows
    if (row_count > 4) {
        printf("Row count exceeds 4, processing file...\n");
        process_file(filename);
    } else {
        printf("Row count is 4 or fewer, no processing needed\n");
    }
    
    printf("Program complete\n");
    return 0;
}