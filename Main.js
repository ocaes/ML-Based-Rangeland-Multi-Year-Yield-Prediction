/****************************************************
 * USER INPUTS
 ****************************************************/

// DPM field data
var dpm_fc = table; // imported asset into Google Earth Engine
// must contain: rl_dpm_hei (cm)

var baselineYear = 2020; // changed from 2023
var startDate = baselineYear + '-01-01';
var endDate   = baselineYear + '-12-31';

/****************************************************
 * STEP 0: LESOTHO BOUNDARY
 ****************************************************/
var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var lesotho = countries.filter(ee.Filter.eq('country_na','Lesotho'));
var roi = lesotho.geometry();

/****************************************************
 * STEP 1: DPM → BIOMASS (kg/ha)
 ****************************************************/
var addBiomass = function(feature) {
  var x = ee.Number(feature.get('rl_dpm_hei'));

  var biomass_low = ee.Number(31.7176)
    .multiply(ee.Number(0.32181).divide(x).pow(0.2834)).pow(2);

  var biomass_high = ee.Number(17.3543)
    .multiply(x.multiply(0.9893).pow(0.5413)).pow(2);

  var biomass = ee.Algorithms.If(x.lte(26), biomass_low, biomass_high);

  return feature.set({biomass_kg_ha: ee.Number(biomass)});
};

var dpm_biomass = dpm_fc.map(addBiomass);

/****************************************************
 * STEP 2: SENTINEL-2 PREPARATION (baselineYear)
 ****************************************************/
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(function(img) {
    var scaled = img.divide(10000);
    var ndvi = scaled.normalizedDifference(['B8','B4']).rename('NDVI');
    return scaled.addBands(ndvi)
      .select(['B2','B3','B4','B8','B11','B12','NDVI'])
      .copyProperties(img,['system:time_start']);
  });

var s2_img = s2.median().clip(roi);

/****************************************************
 * STEP 3: SAMPLE SENTINEL-2 AT DPM POINTS
 ****************************************************/
var predictors = ['B2','B3','B4','B8','B11','B12','NDVI'];

var samples = s2_img.sampleRegions({
  collection: dpm_biomass,
  properties: ['biomass_kg_ha'],
  scale: 10,
  geometries: true
});

/****************************************************
 * STEP 4: TRAIN / TEST SPLIT
 ****************************************************/
var withRandom = samples.randomColumn('rand', 42);
var trainSet = withRandom.filter(ee.Filter.lt('rand', 0.7));
var testSet  = withRandom.filter(ee.Filter.gte('rand', 0.7));

/****************************************************
 * STEP 5: RANDOM FOREST REGRESSION
 ****************************************************/
var rf = ee.Classifier.smileRandomForest({
  numberOfTrees: 500,
  minLeafPopulation: 5,
  bagFraction: 0.7,
  seed: 42
})
.setOutputMode('REGRESSION')
.train({
  features: trainSet,
  classProperty: 'biomass_kg_ha',
  inputProperties: predictors
});

/****************************************************
 * STEP 6: VALIDATION
 ****************************************************/
var validated = testSet.classify(rf);

var validatedErrors = validated.map(function(f){
  var obs = ee.Number(f.get('biomass_kg_ha'));
  var pred = ee.Number(f.get('classification'));
  var err = pred.subtract(obs);
  return f.set({
    error: err,
    abs_error: err.abs(),
    sq_error: err.pow(2),
    predicted: pred,
    observed: obs
  });
});

var rmse = ee.Number(validatedErrors.aggregate_mean('sq_error')).sqrt();
var mae = ee.Number(validatedErrors.aggregate_mean('abs_error'));
var meanObs = ee.Number(validatedErrors.aggregate_mean('observed'));
var ssTot = validatedErrors.map(function(f){
  return f.set('ss_tot', ee.Number(f.get('observed')).subtract(meanObs).pow(2));
}).aggregate_sum('ss_tot');
var ssRes = validatedErrors.aggregate_sum('sq_error');
var r2 = ee.Number(1).subtract(ee.Number(ssRes).divide(ssTot));

print('RMSE (kg/ha):', rmse);
print('MAE (kg/ha):', mae);
print('R²:', r2);

// Observed vs Predicted
print(ui.Chart.feature.byFeature({
  features: validatedErrors,
  xProperty: 'observed',
  yProperties: ['predicted']
}).setOptions({
  title: 'Observed vs Predicted Biomass (' + baselineYear + ')',
  hAxis: {title: 'Observed Biomass (kg/ha)'},
  vAxis: {title: 'Predicted Biomass (kg/ha)'},
  pointSize: 4,
  trendlines: {0:{showR2:true, visibleInLegend:true}},
  colors: ['#1f77b4']
}));

/****************************************************
 * STEP 7: VARIABLE IMPORTANCE
 ****************************************************/
var importance = ee.Dictionary(rf.explain().get('importance'));
print('Variable importance (raw)', importance);

var importanceFc = ee.FeatureCollection(
  importance.keys().map(function(k){
    return ee.Feature(null, {variable:k, importance: importance.get(k)});
  })
);

print(ui.Chart.feature.byFeature({
  features: importanceFc,
  xProperty: 'variable',
  yProperties: ['importance']
}).setChartType('ColumnChart')
.setOptions({
  title: 'Random Forest Variable Importance',
  legend: {position: 'none'},
  hAxis: {title:'Predictor', slantedText:true, slantedTextAngle:45},
  vAxis: {title:'Importance'},
  colors:['#2e7d32']
}));

/****************************************************
 * STEP 8: BIOMASS PREDICTION MAP (baselineYear)
 ****************************************************/
var biomass_map = s2_img.select(predictors).classify(rf).rename('biomass_kg_ha');

Map.centerObject(roi,8);
Map.addLayer(
  biomass_map,
  {min:0,max:8000,palette:['red','lightgreen','green','darkgreen']},
  'Predicted Biomass (kg/ha) - ' + baselineYear
);

/****************************************************
 * STEP 9: EXPORTS (baselineYear)
 ****************************************************/
Export.image.toDrive({
  image: biomass_map,
  description:'RF_Sentinel2_Biomass_Lesotho_' + baselineYear,
  folder:'GEE_Exports',
  fileNamePrefix:'biomass_rf_s2_ndvi_lesotho_' + baselineYear,
  scale:10,
  region:roi,
  maxPixels:1e13
});

Export.table.toDrive({
  collection:dpm_biomass,
  description:'DPM_Biomass_Field_Data',
  folder:'GEE_Exports',
  fileFormat:'SHP'
});

Export.table.toDrive({
  collection:importanceFc,
  description:'RF_Variable_Importance',
  folder:'GEE_Exports',
  fileFormat:'CSV'
});

/****************************************************
 * STEP 10: MULTI-YEAR PREDICTION 2020-2025
 ****************************************************/
var years = ee.List.sequence(2020, 2025);

var annualBiomass = years.map(function(y){
  y = ee.Number(y);
  var start = ee.Date.fromYMD(y,1,1);
  var end = ee.Date.fromYMD(y,12,31);

  var s2_year = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(roi)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

  var s2_median = ee.Image(
    ee.Algorithms.If(
      s2_year.size().gt(0),
      s2_year.map(function(img){
        var scaled = img.divide(10000);
        var ndvi = scaled.normalizedDifference(['B8','B4']).rename('NDVI');
        return scaled.addBands(ndvi)
          .select(['B2','B3','B4','B8','B11','B12','NDVI'])
          .copyProperties(img,['system:time_start']);
      }).median().clip(roi),
      ee.Image(0).rename('biomass_kg_ha').updateMask(ee.Image(0))
    )
  );

  var biomass_pred = s2_median.select(predictors).classify(rf).rename('biomass_kg_ha');

  var mean_biomass = ee.Number(
    biomass_pred.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: 10,
      maxPixels: 1e13
    }).get('biomass_kg_ha')
  );

  return ee.Feature(null, {'year': y, 'mean_biomass': mean_biomass});
});

var ts_fc = ee.FeatureCollection(annualBiomass);

print(ui.Chart.feature.byFeature(ts_fc, 'year', ['mean_biomass'])
  .setChartType('LineChart')
  .setOptions({
    title: 'Mean Biomass in Lesotho (2020-2025)',
    hAxis: {title: 'Year'},
    vAxis: {title: 'Mean Biomass (kg/ha)'},
    lineWidth: 2,
    pointSize: 4,
    trendlines: {0: {type: 'linear', visibleInLegend: true, color: 'red'}}
  }));

/****************************************************
 * STEP 10-11: MULTI-YEAR PREDICTION 2020-2025 (optimized)
 ****************************************************/
var years = ee.List.sequence(2020, 2025);

years.getInfo().forEach(function(y){  // getInfo() here runs client-side loop, not server-side
  var start = ee.Date.fromYMD(y,1,1);
  var end = ee.Date.fromYMD(y,12,31);

  var s2_year = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(roi)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

  s2_year.size().evaluate(function(count){
    if(count > 0){
      var s2_median = s2_year.map(function(img){
        var scaled = img.divide(10000);
        var ndvi = scaled.normalizedDifference(['B8','B4']).rename('NDVI');
        return scaled.addBands(ndvi)
          .select(['B2','B3','B4','B8','B11','B12','NDVI'])
          .copyProperties(img,['system:time_start']);
      }).median().clip(roi);

      var biomass_pred = s2_median.select(predictors).classify(rf).rename('biomass_kg_ha');

      // Export image for this year
      Export.image.toDrive({
        image: biomass_pred,
        description: 'Biomass_' + y,
        folder: 'GEE_Exports',
        fileNamePrefix: 'biomass_rf_' + y,
        scale: 10,  // increased scale to reduce computation
        region: roi,
        maxPixels:1e13
      });

      // Compute mean biomass for time series
      biomass_pred.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: roi,
        scale: 50, // increased scale to reduce computation
        maxPixels:1e13
      }).get('biomass_kg_ha', function(mean){
        print('Mean biomass ' + y + ':', mean);
      });

    } else {
      print('No images for year ' + y + ', skipping.');
    }
  });
});
