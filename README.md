# ML-Based-Rangeland-Multi-Year-Yield-Prediction

# Lesotho Rangeland Biomass Prediction Using Random Forest and Sentinel-2

## Overview

This Google Earth Engine (GEE) script implements a machine learning workflow to predict and monitor rangeland biomass across Lesotho using Disk Pasture Meter (DPM) field measurements and Sentinel-2 satellite imagery. The script employs Random Forest regression to create biomass prediction models and analyzes temporal trends from 2020 to 2025.

## Purpose

The script addresses the following objectives:

1. **Convert field measurements to biomass estimates** - Transform DPM height measurements into biomass (kg/ha) using empirical equations
2. **Train predictive models** - Use Random Forest machine learning to relate satellite imagery to ground-truth biomass
3. **Generate biomass maps** - Create wall-to-wall biomass predictions across Lesotho
4. **Monitor temporal trends** - Track biomass changes over multiple years (2020-2025)
5. **Validate model performance** - Assess prediction accuracy using standard metrics

## Methodology

### Data Sources

#### 1. Field Data (DPM Measurements)
- **Source**: User-imported asset (table)
- **Key field**: `rl_dpm_hei` (rangeland DPM height in centimeters)
- **Purpose**: Ground-truth data for model training and validation

#### 2. Satellite Imagery
- **Sensor**: Sentinel-2 Surface Reflectance (Harmonized)
- **Collection**: `COPERNICUS/S2_SR_HARMONIZED`
- **Temporal coverage**: 2020-2025
- **Cloud filtering**: Images with <20% cloud cover
- **Spatial resolution**: 10 meters

#### 3. Administrative Boundaries
- **Source**: `USDOS/LSIB_SIMPLE/2017`
- **Region of Interest**: Lesotho national boundary

## Workflow Steps

### Step 0: Define Study Area

```javascript
var lesotho = countries.filter(ee.Filter.eq('country_na','Lesotho'));
var roi = lesotho.geometry();
```

Extracts Lesotho's national boundary as the region of interest for all subsequent analyses.

### Step 1: DPM Height to Biomass Conversion

The script implements a **piecewise regression model** based on DPM height:

**For heights ≤ 26 cm (Low biomass):**
```
biomass = [31.7176 × (0.32181 / height)^0.2834]²
```

**For heights > 26 cm (High biomass):**
```
biomass = [17.3543 × (height × 0.9893)^0.5413]²
```

This dual-equation approach accounts for different growth patterns at low versus high biomass levels, providing more accurate estimates across the full range of grassland conditions.

### Step 2: Sentinel-2 Image Processing

**Preprocessing steps:**
1. Filter by location (Lesotho boundary)
2. Filter by date (baseline year: 2020)
3. Filter by cloud cover (<20%)
4. Scale reflectance values (divide by 10,000)
5. Calculate NDVI: `(B8 - B4) / (B8 + B4)`
6. Select predictor bands: B2, B3, B4, B8, B11, B12, NDVI
7. Create median composite to reduce noise

**Selected Bands:**
- **B2** (Blue): 490 nm
- **B3** (Green): 560 nm
- **B4** (Red): 665 nm
- **B8** (NIR): 842 nm
- **B11** (SWIR1): 1610 nm
- **B12** (SWIR2): 2190 nm
- **NDVI** (Vegetation Index): Derived from B8 and B4

### Step 3: Sample Extraction

The script extracts Sentinel-2 band values at each DPM measurement location, creating a training dataset that links:
- **Predictors**: Sentinel-2 reflectance values (7 bands)
- **Response variable**: Field-measured biomass (kg/ha)

### Step 4: Train/Test Split

Data is randomly partitioned using a 70/30 split:
- **Training set**: 70% of samples (random seed: 42)
- **Test set**: 30% of samples for validation

This ensures independent evaluation of model performance.

### Step 5: Random Forest Model Training

**Model configuration:**
- **Algorithm**: Random Forest Regression
- **Number of trees**: 500
- **Minimum leaf population**: 5
- **Bag fraction**: 0.7 (70% of data used per tree)
- **Random seed**: 42 (for reproducibility)
- **Output mode**: REGRESSION

Random Forest was chosen for its ability to:
- Handle non-linear relationships
- Manage multiple correlated predictors
- Provide variable importance metrics
- Reduce overfitting through ensemble methods

### Step 6: Model Validation

**Performance metrics calculated:**

1. **RMSE (Root Mean Square Error)**
   - Measures average prediction error in kg/ha
   - Lower values indicate better performance

2. **MAE (Mean Absolute Error)**
   - Average magnitude of errors
   - Less sensitive to outliers than RMSE

3. **R² (Coefficient of Determination)**
   - Proportion of variance explained by the model
   - Values range from 0 to 1 (higher is better)

**Visualization:**
- Scatter plot of observed vs. predicted biomass
- Includes trendline and R² value

### Step 7: Variable Importance Analysis

The script extracts and visualizes the relative importance of each predictor variable in the Random Forest model. This reveals which spectral bands contribute most to biomass prediction.

**Output:**
- Bar chart ranking variables by importance
- Raw importance values printed to console

### Step 8: Baseline Biomass Map (2020)

The trained model is applied to the entire Sentinel-2 median composite, generating a wall-to-wall biomass prediction map for Lesotho.

**Visualization:**
- **Color palette**: Red (low) → Light green → Green → Dark green (high)
- **Range**: 0 to 8,000 kg/ha
- **Resolution**: 10 meters

### Step 9: Data Export

Three primary exports to Google Drive:

1. **Biomass Raster Map**
   - Format: GeoTIFF
   - Resolution: 10m
   - Filename: `biomass_rf_s2_ndvi_lesotho_2020`

2. **Field Data with Biomass**
   - Format: Shapefile
   - Contains original DPM measurements and calculated biomass

3. **Variable Importance**
   - Format: CSV
   - Lists predictor variables and their importance scores

### Step 10: Multi-Year Time Series Analysis (2020-2025)

**Server-side approach:**
The script generates annual biomass predictions and calculates mean national biomass for each year. A time series chart visualizes trends with a linear trendline.

**Key features:**
- Handles missing data (years with no imagery)
- Computes national mean biomass
- Visualizes temporal trends

### Step 11: Optimized Multi-Year Export

**Client-side approach:**
A client-side loop (using `getInfo()` and `evaluate()`) exports individual biomass maps for each year from 2020 to 2025.

**Optimizations:**
- Increased scale to 50m for mean calculations (faster computation)
- Conditional exports (only years with available imagery)
- Separate export task for each year

## Key Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Baseline Year | 2020 | Reference year for model training |
| Cloud Threshold | 20% | Maximum cloud cover for imagery |
| Train/Test Split | 70/30 | Data partitioning ratio |
| Number of Trees | 500 | Random Forest ensemble size |
| Min Leaf Population | 5 | Minimum samples per leaf node |
| Bag Fraction | 0.7 | Bootstrap sampling proportion |
| Export Scale | 10m | Spatial resolution for exports |
| Time Series Scale | 50m | Resolution for mean calculations |

## Expected Outputs

### Console Outputs
1. RMSE, MAE, and R² statistics
2. Observed vs. Predicted scatter plot
3. Variable importance bar chart
4. Annual mean biomass time series (2020-2025)
5. Mean biomass values for each year

### Google Drive Exports
1. Baseline biomass map (2020) - GeoTIFF
2. Field data with biomass - Shapefile
3. Variable importance - CSV
4. Annual biomass maps (2020-2025) - GeoTIFF files

## Applications

This script supports:

- **Rangeland monitoring**: Track grassland productivity over time
- **Drought assessment**: Identify years with reduced biomass
- **Land degradation studies**: Detect long-term biomass trends
- **Grazing management**: Inform livestock carrying capacity
- **Climate change impacts**: Analyze vegetation response to climate variability
- **Policy development**: Provide evidence for sustainable land management

## Technical Considerations

### Computational Requirements
- **Large-scale processing**: National-level predictions require significant computation
- **Export limits**: GEE has task limits; monitor export queue
- **Memory management**: Client-side loops (`getInfo()`) can be slow for large datasets

### Model Limitations
1. **Temporal misalignment**: Field measurements from one period, satellite data from another
2. **Cloud cover**: May limit imagery availability in certain years
3. **DPM equation validity**: Empirical equations derived from specific study conditions
4. **Scale mismatch**: 10m pixels vs. point measurements
5. **Seasonal variability**: Using annual median may mask intra-annual dynamics

### Recommendations for Improvement

1. **Phenological alignment**: Match field surveys with satellite acquisition dates
2. **Cross-validation**: Implement k-fold CV for more robust validation
3. **Feature engineering**: Add seasonal indices (EVI, SAVI, etc.)
4. **Terrain variables**: Include elevation, slope, aspect
5. **Multi-temporal features**: Use vegetation phenology metrics
6. **Hyperparameter tuning**: Optimize RF parameters using grid search
7. **Uncertainty quantification**: Generate prediction confidence intervals

## Code Structure

The script follows a logical workflow:

```
INPUT DATA
    ↓
PREPROCESSING (Biomass calculation, Image filtering)
    ↓
SAMPLING (Extract predictors at field locations)
    ↓
MODEL TRAINING (Random Forest)
    ↓
VALIDATION (Calculate metrics)
    ↓
PREDICTION (Generate maps)
    ↓
EXPORT (Save results)
    ↓
TIME SERIES ANALYSIS (Multi-year trends)
```

## Dependencies

- **Google Earth Engine account** with access to:
  - Sentinel-2 Surface Reflectance Harmonized collection
  - USDOS boundaries dataset
- **User-provided DPM field data** (imported as Earth Engine asset)
- **Google Drive** for exports

## Version History

- **Current version**: Uses 2020 as baseline year

## References

The DPM-to-biomass conversion equations are derived from rangeland studies, though specific citations should be added based on the source methodology.

---

## Quick Start Guide

1. **Import your DPM field data** as an Earth Engine table asset
2. **Update the `table` variable** to point to your asset
3. **Set your baseline year** (default: 2020)
4. **Run the script** in the Earth Engine Code Editor
5. **Review validation metrics** in the console
6. **Check exports** in the Tasks tab
7. **Monitor Google Drive** for completed exports

## Contact & Support

Visit [here](https://ocaes.github.io/international/)

---

**Script Type**: Google Earth Engine JavaScript  
**Application Domain**: Rangeland Ecology & Remote Sensing
