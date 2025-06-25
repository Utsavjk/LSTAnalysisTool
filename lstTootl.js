// LST Point Analysis Tool for Google Earth Engine
// Click on map to get 10-year LST time series for selected point with 100m buffer

// ============================================================================
// CONFIGURATION
// ============================================================================
var startDate = '2014-01-01';
var endDate = '2024-01-01';
var bufferSize = 100; // meters
var scale = 30; // Landsat resolution

// ============================================================================
// FUNCTIONS
// ============================================================================

// Function to mask clouds in Landsat images
function maskClouds(image) {
  var qa = image.select('QA_PIXEL');
  var cloudMask = qa.bitwiseAnd(1 << 3).eq(0)  // Cloud shadow
                   .and(qa.bitwiseAnd(1 << 4).eq(0))  // Cloud
                   .and(qa.bitwiseAnd(1 << 2).eq(0)); // Cirrus
  return image.updateMask(cloudMask);
}

// Function to calculate LST from Landsat Collection 2
function calculateLST(image) {
  // Select surface temperature band (ST_B10)
  var lst = image.select('ST_B10')
    .multiply(0.00341802)  // Scale factor
    .add(149.0)            // Offset
    .subtract(273.15)      // Convert Kelvin to Celsius
    .rename('LST');
  
  return image.addBands(lst);
}

// Function to process LST for a given point
function analyzeLSTAtPoint(point) {
  // Clear previous layers
  Map.layers().reset();
  
  // Create 100m buffer around the point
  var buffer = point.buffer(bufferSize);
  
  // Load Landsat 8 and 9 collections
  var landsat8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(point)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUD_COVER', 20))
    .map(maskClouds)
    .map(calculateLST);
    
  var landsat9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(point)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUD_COVER', 20))
    .map(maskClouds)
    .map(calculateLST);
  
  // Merge collections
  var allLandsat = landsat8.merge(landsat9);
  
  print('Total images found:', allLandsat.size());
  
  // Function to extract LST values for each image
  var extractLST = function(image) {
    var meanLST = image.select('LST').reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: buffer,
      scale: scale,
      maxPixels: 1e9
    });
    
    return ee.Feature(null, {
      'date': image.date().format('YYYY-MM-dd'),
      'LST': meanLST.get('LST'),
      'year': image.date().get('year'),
      'month': image.date().get('month'),
      'day': image.date().get('day')
    });
  };
  
  // Extract LST time series
  var lstTimeSeries = allLandsat.map(extractLST);
  
  // Print time series data
  print('LST Time Series Data:');
  print(lstTimeSeries.limit(50)); // Show first 50 records
  
  // Calculate statistics
  var lstValues = lstTimeSeries.aggregate_array('LST');
  var validLST = lstValues.removeAll([null]);
  
  var stats = {
    'count': validLST.size(),
    'mean': validLST.reduce(ee.Reducer.mean()),
    'min': validLST.reduce(ee.Reducer.min()),
    'max': validLST.reduce(ee.Reducer.max()),
    'std': validLST.reduce(ee.Reducer.stdDev())
  };
  
  print('LST Statistics (°C):');
  print('Count:', stats.count);
  print('Mean:', stats.mean);
  print('Min:', stats.min);
  print('Max:', stats.max);
  print('Std Dev:', stats.std);
  
  // Create annual averages
  var years = ee.List.sequence(2014, 2023);
  var yearlyLST = years.map(function(year) {
    var yearData = lstTimeSeries.filter(ee.Filter.eq('year', year));
    var yearlyMean = yearData.aggregate_mean('LST');
    return ee.Feature(null, {
      'year': year,
      'yearly_mean_LST': yearlyMean
    });
  });
  
  print('Yearly Average LST:');
  print(ee.FeatureCollection(yearlyLST));
  
  // Visualize on map
  Map.addLayer(point, {color: 'red'}, 'Selected Point');
  Map.addLayer(buffer, {color: 'blue', fillColor: '0000FF11'}, '100m Buffer');
  
  // Get most recent LST image for visualization
  var recentImage = allLandsat.sort('system:time_start', false).first();
  var lstVis = {
    min: 10,
    max: 40,
    palette: ['blue', 'cyan', 'yellow', 'red']
  };
  
  Map.addLayer(recentImage.select('LST'), lstVis, 'Recent LST');
  Map.centerObject(buffer, 15);
  
  // Create and display chart
  var chart = ui.Chart.feature.byFeature(lstTimeSeries, 'date', 'LST')
    .setChartType('LineChart')
    .setOptions({
      title: 'Land Surface Temperature Time Series (10 Years)',
      vAxis: {
        title: 'LST (°C)',
        titleTextStyle: {italic: false, bold: true}
      },
      hAxis: {
        title: 'Date',
        titleTextStyle: {italic: false, bold: true},
        format: 'YYYY-MM'
      },
      series: {
        0: {
          color: 'red',
          lineWidth: 2,
          pointSize: 3
        }
      },
      legend: {position: 'none'},
      curveType: 'function'
    });
  
  print(chart);
  
  // Export options (uncomment to use)
  /*
  Export.table.toDrive({
    collection: lstTimeSeries,
    description: 'LST_TimeSeries_' + Date.now(),
    fileFormat: 'CSV'
  });
  */
}

// ============================================================================
// USER INTERFACE SETUP
// ============================================================================

// Instructions panel
var instructions = ui.Panel({
  widgets: [
    ui.Label({
      value: 'LST Point Analysis Tool',
      style: {fontSize: '20px', fontWeight: 'bold', color: '4A90E2'}
    }),
    ui.Label({
      value: 'Instructions:',
      style: {fontSize: '16px', fontWeight: 'bold'}
    }),
    ui.Label('1. Click anywhere on the map to select a point'),
    ui.Label('2. Tool will analyze LST within 100m buffer'),
    ui.Label('3. Shows 10-year time series (2014-2024)'),
    ui.Label('4. Results appear in Console and Chart'),
    ui.Label({
      value: 'Data: Landsat 8/9 Collection 2 Surface Temperature',
      style: {fontSize: '12px', color: '666'}
    })
  ],
  style: {
    position: 'top-left',
    padding: '10px',
    backgroundColor: 'white'
  }
});

// Add instructions to map
Map.add(instructions);

// Set up map clicking functionality
Map.onClick(function(coords) {
  var clickedPoint = ee.Geometry.Point([coords.lon, coords.lat]);
  
  print('============================================================');
  print('Analyzing LST at coordinates:', coords.lon.toFixed(4), coords.lat.toFixed(4));
  print('Processing... Please wait...');
  
  analyzeLSTAtPoint(clickedPoint);
});

// ============================================================================
// INITIAL SETUP
// ============================================================================

// Set initial map view (you can change this to your area of interest)
Map.setCenter(-122.4194, 37.7749, 10); // San Francisco Bay Area
Map.setOptions('SATELLITE');

// Display instructions
print('============================================================');
print('LST POINT ANALYSIS TOOL READY');
print('============================================================');
print('Click anywhere on the map to start analysis!');
print('The tool will:');
print('- Create a 100m buffer around your clicked point');
print('- Extract LST data from Landsat 8/9 (2014-2024)');
print('- Show time series, statistics, and trends');
print('- Display results in console and chart');
print('============================================================');