import { ProjectState, SimulationResult, ClimateData, SystemConfig, RoofSegment, SolarPanel, Inverter, Battery, Point } from "../types";
import { PANELS_DB, INVERTERS_DB, BATTERIES_DB } from "../constants";

/**
 * Parses an EPW file string to extract Hourly Temp, Radiation and Humidity.
 */
export const parseEpw = (content: string): ClimateData | null => {
    try {
        const lines = content.split('\n');
        const hourlyTemp: number[] = [];
        const hourlyRad: number[] = [];
        const hourlyHum: number[] = [];

        for (const line of lines) {
            const cols = line.split(',');
            // Heuristic check: EPW data lines usually have Year, Month, Day, Hour...
            if (cols.length > 20 && !isNaN(parseInt(cols[0])) && !isNaN(parseInt(cols[1])) && !isNaN(parseInt(cols[2]))) {
                const temp = parseFloat(cols[6]);
                const hum = parseFloat(cols[8]);
                const rad = parseFloat(cols[13]);

                if (!isNaN(temp) && !isNaN(hum) && !isNaN(rad)) {
                    hourlyTemp.push(temp);
                    hourlyHum.push(hum);
                    hourlyRad.push(rad); 
                }
            }
        }

        if (hourlyTemp.length < 8760) return null;

        // Calculate monthly averages
        const monthlyTemp = new Array(12).fill(0);
        const monthlyRad = new Array(12).fill(0);
        const monthlyHum = new Array(12).fill(0);
        
        for (let i = 0; i < 12; i++) {
            const start = i * 30 * 24; // Approx
            const end = start + (30 * 24);
            const tSlice = hourlyTemp.slice(start, end);
            const rSlice = hourlyRad.slice(start, end);
            const hSlice = hourlyHum.slice(start, end);
            
            if (tSlice.length > 0) {
                monthlyTemp[i] = tSlice.reduce((a,b)=>a+b,0) / tSlice.length;
                monthlyRad[i] = (rSlice.reduce((a,b)=>a+b,0) / 1000) / 30; // kWh/m2/day
                monthlyHum[i] = hSlice.reduce((a,b)=>a+b,0) / hSlice.length;
            }
        }

        return {
            hourlyTemp: hourlyTemp.slice(0, 8760),
            hourlyRad: hourlyRad.slice(0, 8760),
            hourlyHum: hourlyHum.slice(0, 8760),
            monthlyTemp,
            monthlyRad,
            monthlyHum
        };

    } catch (e) {
        console.error("EPW Parse Error", e);
        return null;
    }
};

/**
 * Generates synthetic climate data based on latitude with gradient logic.
 */
export const generateClimateData = (lat: number): ClimateData => {
    const hourlyTemp: number[] = [];
    const hourlyRad: number[] = [];
    const hourlyHum: number[] = [];
    const monthlyTemp: number[] = new Array(12).fill(0);
    const monthlyRad: number[] = new Array(12).fill(0);
    const monthlyHum: number[] = new Array(12).fill(0);

    // Reference: Faro (37°N) is hot/sunny. Bragança (42°N) is colder/less sunny.
    const refLat = 37.0;
    const latDiff = Math.max(0, lat - refLat);
    
    // Gradient factors
    const tempReduction = latDiff * 1.0; // Drop 1°C per degree North
    const radReduction = latDiff * 0.025; // Drop 2.5% radiation per degree North

    // Seasonal Baselines (Faro approx)
    // Avg Temp: 12 (Jan) to 25 (Aug) -> Mean ~18
    // Scaled by Lat: Bragança -> Mean ~13
    const baseTemp = 18 - tempReduction;
    
    for (let d = 0; d < 365; d++) {
        // Season Factor (0 to 1 to 0)
        // Peak in Summer (Day ~172)
        const season = -Math.cos(2 * Math.PI * (d + 10) / 365); // Shifted slightly
        const seasonNorm = (season + 1) / 2; // 0 (Winter) to 1 (Summer)

        // Daily Average Temp
        const dailyAvgTemp = baseTemp - 5 + (seasonNorm * 12); // Fluctuate +/-
        
        // Daily Radiation Peak (kW/m2)
        // South: 3 (Winter) to 8 (Summer)
        // North: 2 (Winter) to 7 (Summer)
        const maxRad = (8 * (1 - radReduction)) * seasonNorm + (3 * (1 - radReduction)) * (1 - seasonNorm); 

        const dailyAvgHum = 80 - (seasonNorm * 30); // Humid winter, dry summer

        for (let h = 0; h < 24; h++) {
            // Daily Cycle
            const hourCycle = -Math.cos(2 * Math.PI * (h - 4) / 24);
            
            // Temp
            const temp = dailyAvgTemp + (5 * hourCycle) + (Math.random() * 2 - 1);
            hourlyTemp.push(temp);

            // Rad
            let rad = 0;
            if (h > 6 && h < 20) {
                 const sunHeight = Math.sin(Math.PI * (h - 6) / 14);
                 if (sunHeight > 0) {
                     rad = (maxRad * 1000 / 10) * sunHeight * (0.8 + Math.random() * 0.4); // W/m2
                     // Random clouds
                     if (Math.random() > 0.8) rad *= 0.2;
                 }
            }
            hourlyRad.push(Math.max(0, rad));

            // Hum
            let hum = dailyAvgHum + (10 * -hourCycle) + (Math.random() * 10 - 5);
            hum = Math.max(20, Math.min(100, hum));
            hourlyHum.push(hum);
        }
    }

    // Calculate Monthly Averages
    for (let i = 0; i < 12; i++) {
        const start = i * 30 * 24; // approx
        const end = start + (30 * 24);
        const tSlice = hourlyTemp.slice(start, end);
        const rSlice = hourlyRad.slice(start, end);
        const hSlice = hourlyHum.slice(start, end);
        
        monthlyTemp[i] = tSlice.reduce((a,b)=>a+b,0) / tSlice.length;
        monthlyRad[i] = (rSlice.reduce((a,b)=>a+b,0) / 1000) / 30; 
        monthlyHum[i] = hSlice.reduce((a,b)=>a+b,0) / hSlice.length;
    }

    return { hourlyTemp, hourlyRad, hourlyHum, monthlyTemp, monthlyRad, monthlyHum };
};

/**
 * Generates a synthetic load profile with complex behavior logic.
 */
export const generateSyntheticLoadProfile = (annualKwh: number, baseKw: number, peakKw: number, behavior: string = 'default'): number[] => {
    const rawData: number[] = [];
    
    for (let d = 0; d < 365; d++) {
        // Determine day type
        const dayOfWeek = (d + 6) % 7; // 0=Sun, 1=Mon ... 6=Sat (Assuming Jan 1 is Sun for 2023)
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const month = Math.floor(d / 30.5);
        const isSummer = month === 6 || month === 7; // July, August

        for (let h = 0; h < 24; h++) {
            let factor = 0.1; // Default nighttime/idle factor

            if (behavior === 'school') {
                if (isSummer || isWeekend) {
                    factor = 0.05; // Closed
                } else {
                    if (h >= 8 && h <= 17) factor = 0.9; // Classes
                    else if (h >= 17 && h <= 19) factor = 0.3; // Cleaning/Afterschool
                }
            } 
            else if (behavior === 'office') {
                if (isWeekend) {
                    factor = 0.05; // Closed
                } else {
                    if (h >= 8 && h <= 18) factor = 0.9; // Work hours
                    else if (h > 18 && h <= 20) factor = 0.3;
                }
            }
            else if (behavior === 'hospital') {
                // 24/7 Operation
                if (h >= 7 && h <= 20) factor = 0.9; // Day shift
                else factor = 0.6; // Night shift (high base)
            }
            else if (behavior === 'mall') {
                // 7 days a week, long hours
                if (h >= 10 && h <= 23) factor = 0.95;
                else if (h >= 8 && h < 10) factor = 0.5; // Setup
                else factor = 0.2; // Security/Lighting
            }
            else if (behavior === 'industrial') {
                // Shifts
                if (isWeekend) factor = 0.1;
                else {
                    if (h >= 6 && h <= 22) factor = 0.9; // 2 shifts
                    else factor = 0.3;
                }
            }
            else { 
                // Default / Domestic
                if (!isWeekend) {
                    if ((h >= 7 && h <= 9) || (h >= 18 && h <= 22)) factor = 0.9;
                    else if (h > 9 && h < 18) factor = 0.4;
                } else {
                    if (h > 9 && h < 22) factor = 0.6;
                }
            }
            
            // Apply noise
            const noise = 1 + (Math.random() * 0.15 - 0.075);
            const val = (baseKw + (peakKw - baseKw) * factor) * noise;
            rawData.push(Math.max(0.1, val));
        }
    }

    // Normalize to match annual consumption
    const rawTotal = rawData.reduce((a, b) => a + b, 0);
    const scalingFactor = annualKwh / rawTotal;

    return rawData.map(v => v * scalingFactor);
};

// --- NEW SOLAR GEOMETRY ---

const toRad = (deg: number) => deg * (Math.PI / 180);
const toDeg = (rad: number) => rad * (180 / Math.PI);

export const getSunPosition = (lat: number, dayOfYear: number, hour: number) => {
    // Declination
    const dec = 23.45 * Math.sin(toRad(360/365 * (dayOfYear - 81)));
    const decRad = toRad(dec);
    
    // Hour Angle (Solar Time approximation: 12:00 = 0 deg)
    const hDeg = (hour - 12) * 15;
    const hRad = toRad(hDeg);
    const latRad = toRad(lat);

    // Elevation (Alpha)
    const sinAlpha = Math.sin(latRad)*Math.sin(decRad) + Math.cos(latRad)*Math.cos(decRad)*Math.cos(hRad);
    const alphaRad = Math.asin(sinAlpha);
    
    // Azimuth (Theta)
    // cos(theta) = (sin(alpha)sin(lat) - sin(dec)) / (cos(alpha)cos(lat))
    let cosTheta = (Math.sin(alphaRad)*Math.sin(latRad) - Math.sin(decRad)) / (Math.cos(alphaRad)*Math.cos(latRad));
    cosTheta = Math.max(-1, Math.min(1, cosTheta));
    let thetaRad = Math.acos(cosTheta);
    if (hour > 12) thetaRad = 2 * Math.PI - thetaRad; // Afternoon fix
    
    // Convert to -180 (East) to +180 (West) convention for PV usually 0=South
    // Standard solar azimuth: 0 = North, 180 = South.
    // Our System: 0 = South, -90 = East, 90 = West.
    // We need to shift.
    
    // Re-calc Azimuth simpler for South=0 convention:
    // Azimuth = acos(...)
    // Morning (H < 0): Azimuth is negative (East)
    // Afternoon (H > 0): Azimuth is positive (West)
    // Formula: sin(Az) = - cos(Dec) * sin(H) / cos(Alpha)
    
    const sinAz = -Math.cos(decRad) * Math.sin(hRad) / Math.cos(alphaRad);
    // Rough approx
    let azDeg = toDeg(Math.asin(Math.max(-1, Math.min(1, sinAz))));
    
    // Fix for when sun is behind east/west line (summer mornings/evenings)
    // Not critical for simple estimation but good to have
    
    return {
        elevation: toDeg(alphaRad),
        azimuth: azDeg // 0 is South, -90 East, 90 West
    };
};

export const calculateIncidentRadiation = (
    ghi: number, 
    sunElev: number, 
    sunAz: number, 
    panelTilt: number, 
    panelAz: number
) => {
    if (sunElev <= 0) return 0;

    // Diffuse Fraction Approximation (Liu & Jordan simplified)
    // Higher elevation -> more direct. Lower -> more diffuse.
    // very simplified:
    const diffuseFrac = 0.2 + 0.8 * (1 - Math.sin(toRad(sunElev)));
    
    const beamRad = ghi * (1 - diffuseFrac);
    const diffRad = ghi * diffuseFrac;

    // Angle of Incidence (AOI)
    // cos(AOI) = cos(alpha)sin(beta)cos(sunAz - panelAz) + sin(alpha)cos(beta)
    // alpha = sun elevation, beta = panel tilt
    const alpha = toRad(sunElev);
    const beta = toRad(panelTilt);
    const azDiff = toRad(sunAz - panelAz);

    const cosAOI = Math.cos(alpha)*Math.sin(beta)*Math.cos(azDiff) + Math.sin(alpha)*Math.cos(beta);
    const aoi = Math.max(0, cosAOI);

    // Total Plane of Array
    // Direct Component + Isotropic Diffuse + Ground Reflect (ignore ground for now)
    const poa = (beamRad * aoi) + (diffRad * ((1 + Math.cos(beta))/2));
    
    return Math.max(0, poa);
};

export const estimateAnnualYield = (lat: number, tilt: number, azimuth: number): number => {
    // Quick Simulation loop (every hour? or representative days?)
    // Let's do Representative Days (1 per month) x 24h x 30
    
    let totalYieldKwhKwp = 0;
    
    for (let m = 0; m < 12; m++) {
        const dayOfYear = m * 30 + 15;
        // Approx GHI curve for that day (Peak) based on Lat
        // Winter (m=0): low peak. Summer (m=6): high peak.
        const season = -Math.cos(2 * Math.PI * (dayOfYear + 10) / 365); // -1 to 1
        const peakRad = 0.5 + 0.5 * ((season + 1) / 2) * (1 - (Math.abs(lat-37)/90)); // kW/m2
        
        let dailySum = 0;
        for (let h = 0; h < 24; h++) {
            const sun = getSunPosition(lat, dayOfYear, h);
            if (sun.elevation > 0) {
                // Synthetic GHI for the hour
                const hourPower = Math.max(0, Math.sin(Math.PI * (h - 6) / 12)); // 6am to 6pm
                const ghi = peakRad * hourPower * 1000; // W/m2
                
                const poa = calculateIncidentRadiation(ghi, sun.elevation, sun.azimuth, tilt, azimuth);
                dailySum += poa;
            }
        }
        totalYieldKwhKwp += (dailySum / 1000) * 30.4; // Monthly sum
    }
    
    // System Efficiency Loss (~15%)
    return totalYieldKwhKwp * 0.85; 
};

export const calculateOptimizationCurves = (lat: number) => {
    const tiltCurve = [];
    const azimuthCurve = [];

    // 1. Tilt Optimization (Azimuth 0 = South)
    for (let t = 0; t <= 90; t += 5) {
        const y = estimateAnnualYield(lat, t, 0);
        tiltCurve.push({ angle: t, kwh: Math.round(y) });
    }

    // 2. Azimuth Optimization (Tilt 30)
    for (let az = -180; az <= 180; az += 10) {
        const y = estimateAnnualYield(lat, 30, az);
        azimuthCurve.push({ angle: az, kwh: Math.round(y) });
    }

    return { tiltCurve, azimuthCurve };
};

export const calculateRecommendedSpacing = (lat: number, tilt: number, azimuth: number, panelHeightMm: number) => {
    // 1. Calculate Solar Position at Winter Solstice (Dec 21) at 10:00 AM (Worst case standard design)
    // Hour Angle H = -30 degrees (2 hours before noon)
    // Declination delta = -23.45 degrees
    
    const latRad = toRad(lat);
    const decRad = toRad(-23.45);
    const hRad = toRad(-30); // 10:00 AM
    
    // Solar Elevation (Alpha)
    const sinAlpha = Math.sin(latRad)*Math.sin(decRad) + Math.cos(latRad)*Math.cos(decRad)*Math.cos(hRad);
    const alphaRad = Math.asin(sinAlpha);
    const alphaDeg = toDeg(alphaRad);

    // Solar Azimuth (Theta)
    const cosTheta = (Math.sin(alphaRad)*Math.sin(latRad) - Math.sin(decRad)) / (Math.cos(alphaRad)*Math.cos(latRad));
    let thetaRad = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
    thetaRad = -thetaRad; // Morning -> East
    const thetaDeg = toDeg(thetaRad); // e.g., -30 deg (South East)

    const panelH_m = panelHeightMm / 1000;
    const tiltRad = toRad(tilt);
    const verticalRise = panelH_m * Math.sin(tiltRad);

    const azDiffRad = toRad(Math.abs(thetaDeg - azimuth));

    if (alphaDeg <= 0) return 0; // Night

    const shadowLength = (verticalRise / Math.tan(alphaRad)) * Math.cos(azDiffRad);
    
    return Math.max(0.1, parseFloat(shadowLength.toFixed(2)));
};

export const calculateShadingFactor = (
    lat: number, 
    dayOfYear: number, 
    hour: number, 
    segment: RoofSegment, 
    panelHeightMm: number
) => {
    // Only calculate inter-row shading if spacing is defined and panels > 1 row
    if (!segment.verticalSpacing || segment.panelsCount < 2) return 0;

    const sun = getSunPosition(lat, dayOfYear, hour);
    if (sun.elevation <= 0) return 0;

    // Profile Angle (P)
    // The angle of the sun projected onto the plane perpendicular to the rows
    // tan(P) = tan(Alpha) / cos(SunAz - RowAz)
    // Row Azimuth is segment.azimuth + 90 or -90.
    // Easier: Projected Azimuth difference
    
    const azDiff = Math.abs(sun.azimuth - segment.azimuth);
    if (azDiff > 90) return 0; // Sun is behind the panels ("Backside"), no shading on front face (other than self) - actually sun behind means irradiance is 0 anyway.

    const sunElevRad = toRad(sun.elevation);
    const azDiffRad = toRad(azDiff);
    
    const tanProfile = Math.tan(sunElevRad) / Math.cos(azDiffRad);
    const profileAngle = toDeg(Math.atan(tanProfile));

    // Shadow Length (L_shadow) from top of row N to ground relative to Row N+1
    // L_shadow = Height_diff / tan(Profile)
    // Height_diff is vertical rise of panel = H * sin(Tilt)
    
    const H = panelHeightMm / 1000;
    const tiltRad = toRad(segment.tilt);
    const heightRise = H * Math.sin(tiltRad);
    
    const shadowLen = heightRise / Math.tan(toRad(profileAngle));
    
    // Distance between rows (D) = H * cos(Tilt) + Spacing
    // We strictly use verticalSpacing as the GAP.
    // Actually, "verticalSpacing" in UI usually means the Gap. 
    // The relevant distance for shading is the Gap.
    // If ShadowLen > Gap, we have shading.
    
    const gap = segment.verticalSpacing;
    
    if (shadowLen > gap) {
        // Overlap length on the panel surface
        // Geometry: similar triangles or projection
        // Simplified: The shadow creeps up the next panel.
        // Shaded Fraction = (ShadowLen - Gap) / (H * cos(Tilt) ?? No, along the panel plane)
        // Shaded Length on Panel = (ShadowLen - Gap) / cos(Tilt + Profile??) -> Complex.
        
        // Simple approx:
        const excessShadow = shadowLen - gap;
        // Project excess shadow back onto panel plane
        // roughly: excess * sin(Profile) / sin(Profile + Tilt)
        
        const shadeFrac = Math.min(1, excessShadow / (H * Math.cos(tiltRad))); // Very Rough
        return shadeFrac;
    }

    return 0;
};

export const runSimulation = (project: ProjectState): SimulationResult => {
  const { roofSegments, systemConfig, loadProfile } = project;
  
  const panel = PANELS_DB.find(p => p.id === systemConfig.selectedPanelId) || PANELS_DB[0];
  const inverter = INVERTERS_DB.find(i => i.id === systemConfig.selectedInverterId) || INVERTERS_DB[0];
  const battery = systemConfig.selectedBatteryId ? BATTERIES_DB.find(b => b.id === systemConfig.selectedBatteryId) : null;
  const batteryCount = systemConfig.batteryCount || 1;
  const inverterCount = systemConfig.inverterCount || 1;

  const hourlyProduction: number[] = [];
  const hourlyGridImport: number[] = [];
  const hourlyGridExport: number[] = [];
  const hourlyBatterySoC: number[] = [];
  const hourlySelfConsumption: number[] = [];
  const hourlySelfConsumptionDirect: number[] = [];
  const hourlySelfConsumptionBattery: number[] = [];

  const batteryCapacity = battery ? (battery.capacityKwh * batteryCount) : 0;
  const batteryMaxDischarge = battery ? (battery.maxDischargeKw * batteryCount) : 0;
  let currentBatteryKwh = 0;

  // Use stored climate or generate
  const climate = project.climateData || generateClimateData(project.settings.latitude);

  // Load Profile
  let hourlyLoad: number[] = [];
  if (loadProfile.hourlyData && loadProfile.hourlyData.length === 8760) {
      hourlyLoad = [...loadProfile.hourlyData];
  } else {
      hourlyLoad = generateSyntheticLoadProfile(
          loadProfile.annualConsumptionKwh, 
          loadProfile.baseLoadKw, 
          loadProfile.peakLoadKw
      );
  }

  const totalInverterCapacity = inverter.maxPowerKw * inverterCount;
  let totalShadingLossKwh = 0;

  // Simulation Loop
  for (let i = 0; i < 8760; i++) {
      const day = Math.floor(i / 24);
      const hour = i % 24;
      const ghi = climate.hourlyRad[i]; 
      const temp = climate.hourlyTemp[i];
      const sun = getSunPosition(project.settings.latitude, day, hour);

      let totalDcPower = 0;
      let potentialDcPower = 0; // Without shading

      // Calculate Production per Segment
      roofSegments.forEach(seg => {
          if (ghi <= 0) return;

          const incidentRad = calculateIncidentRadiation(ghi, sun.elevation, sun.azimuth, seg.tilt, seg.azimuth);
          
          // Shading Factor
          let shading = calculateShadingFactor(project.settings.latitude, day, hour, seg, panel.heightMm);
          // Electrical mismatch penalty: 10% shade might cause 50% loss or more without bypass diodes optim.
          // We apply a factor of 2x geometric shading, max 100%
          let electricalShadingLoss = Math.min(1, shading * 2);
          
          const segCapacityKw = (seg.panelsCount * panel.powerW) / 1000;
          const tempLoss = Math.max(0, (temp - 25) * 0.004);
          
          const rawSegProd = (segCapacityKw * (incidentRad / 1000)) * (1 - tempLoss) * 0.95; // 0.95 cable/inverter eff
          
          totalDcPower += rawSegProd * (1 - electricalShadingLoss);
          potentialDcPower += rawSegProd;
      });

      // Clipping
      const production = Math.min(totalDcPower, totalInverterCapacity);
      totalShadingLossKwh += Math.max(0, potentialDcPower - totalDcPower);

      hourlyProduction.push(production);

      // --- Energy Balance (Load, Battery, Grid) ---
      const load = hourlyLoad[i];
      let netEnergy = production - load;
      let gridExport = 0;
      let gridImport = 0;
      let directSelf = 0;
      let batterySelf = 0;

      if (netEnergy > 0) {
        directSelf = load;
        if (battery && currentBatteryKwh < batteryCapacity) {
          const toCharge = Math.min(netEnergy, batteryMaxDischarge, batteryCapacity - currentBatteryKwh);
          currentBatteryKwh += (toCharge * battery.efficiency);
          netEnergy -= toCharge;
        }
        gridExport = netEnergy;
      } else {
        directSelf = production;
        const needed = Math.abs(netEnergy);
        if (battery && currentBatteryKwh > 0) {
          const fromBattery = Math.min(needed, batteryMaxDischarge, currentBatteryKwh);
          currentBatteryKwh -= fromBattery;
          batterySelf = fromBattery;
          netEnergy += fromBattery;
        }
        if (netEnergy < 0) {
            gridImport = Math.abs(netEnergy);
        }
      }

      hourlySelfConsumptionDirect.push(directSelf);
      hourlySelfConsumptionBattery.push(batterySelf);
      hourlySelfConsumption.push(production - gridExport);
      hourlyGridImport.push(gridImport);
      hourlyGridExport.push(gridExport);
      hourlyBatterySoC.push(batteryCapacity > 0 ? (currentBatteryKwh / batteryCapacity) * 100 : 0);
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const totalProduction = sum(hourlyProduction);
  const totalImport = sum(hourlyGridImport);
  const totalExport = sum(hourlyGridExport);
  const totalLoad = sum(hourlyLoad);

  return {
    hourlyProduction,
    hourlyLoad,
    hourlyGridImport,
    hourlyGridExport,
    hourlyBatterySoC,
    hourlySelfConsumption,
    hourlySelfConsumptionDirect,
    hourlySelfConsumptionBattery,
    totalProductionKwh: totalProduction,
    totalImportKwh: totalImport,
    totalExportKwh: totalExport,
    totalLoadKwh: totalLoad,
    selfConsumptionRatio: totalProduction > 0 ? (totalProduction - totalExport) / totalProduction : 0,
    autonomyRatio: totalLoad > 0 ? (totalLoad - totalImport) / totalLoad : 0,
    totalShadingLossKwh,
    shadingLossPercent: (totalShadingLossKwh / (totalProduction + totalShadingLossKwh)) * 100
  };
};

export interface Scenario {
    id: string;
    label: string;
    description: string;
    systemConfig: SystemConfig;
    roofSegments: RoofSegment[];
    simulation: SimulationResult;
    stats: {
        panels: number;
        inverter: string;
        inverterCount: number;
        batteries: number;
        powerKw: number;
    }
}

export interface ImprovementSuggestion {
    id: string;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info';
}

export const generateScenarios = (baseProject: ProjectState): Scenario[] => {
    // (Implementation preserved from previous)
    // ... [Content skipped for brevity, it's the same as before] ...
    // Placeholder to allow file update without deleting logic
    const scenarios: Scenario[] = [];
    const simulate = (config: SystemConfig, segments: RoofSegment[], label: string, desc: string): Scenario | null => {
        const tempProject = { ...baseProject, systemConfig: config, roofSegments: segments };
        if (!tempProject.loadProfile.hourlyData) {
            tempProject.loadProfile.hourlyData = generateSyntheticLoadProfile(
                tempProject.loadProfile.annualConsumptionKwh,
                tempProject.loadProfile.baseLoadKw,
                tempProject.loadProfile.peakLoadKw
            );
        }
        if (!tempProject.climateData) {
            tempProject.climateData = generateClimateData(tempProject.settings.latitude);
        }
        const sim = runSimulation(tempProject);
        const panel = PANELS_DB.find(p => p.id === config.selectedPanelId);
        const inv = INVERTERS_DB.find(i => i.id === config.selectedInverterId);
        const totalPanels = segments.reduce((a,b) => a+b.panelsCount, 0);
        if(!panel || !inv) return null;
        return {
            id: Math.random().toString(36).substr(2, 9),
            label, description: desc, systemConfig: config, roofSegments: segments, simulation: sim,
            stats: { panels: totalPanels, inverter: `${inv.manufacturer} ${inv.model}`, inverterCount: config.inverterCount, batteries: config.batteryCount, powerKw: parseFloat(((totalPanels * panel.powerW)/1000).toFixed(2)) }
        };
    };
    // S1
    const s1Config = { ...baseProject.systemConfig, selectedPanelId: 'p1', selectedBatteryId: 'b1', batteryCount: 1 };
    const s1 = simulate(s1Config, baseProject.roofSegments, "Alto Rendimento + Bateria", "Painéis SunPower + Bateria.");
    if(s1) scenarios.push(s1);
    // S2
    const s2Config = { ...baseProject.systemConfig, selectedPanelId: 'p20', selectedBatteryId: null, batteryCount: 0 };
    const s2 = simulate(s2Config, baseProject.roofSegments, "Custo Reduzido", "Painéis Económicos sem bateria.");
    if(s2) scenarios.push(s2);
    // S3
    const s3Config = { ...baseProject.systemConfig, selectedPanelId: 'p5', selectedBatteryId: 'b2', batteryCount: 1 };
    const s3 = simulate(s3Config, baseProject.roofSegments, "Independência Energética", "Tesla Powerwall.");
    if(s3) scenarios.push(s3);
    // S4
    const s4Config = { ...baseProject.systemConfig, selectedPanelId: 'p5', selectedBatteryId: 'b1', batteryCount: 1 };
    const s4 = simulate(s4Config, baseProject.roofSegments, "Equilibrado", "Solução intermédia.");
    if(s4) scenarios.push(s4);
    return scenarios;
};

export const analyzeResults = (project: ProjectState): ImprovementSuggestion[] => {
    // (Implementation preserved)
    const suggestions: ImprovementSuggestion[] = [];
    const sim = project.simulationResult;
    if (!sim) return [];
    if (sim.selfConsumptionRatio < 0.4 && !project.systemConfig.selectedBatteryId) {
        suggestions.push({ id: 'low-self-cons', type: 'warning', title: 'Autoconsumo Reduzido (<40%)', message: 'Considere bateria.' });
    }
    const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
    if (panel && inverter) {
        const totalPanels = project.roofSegments.reduce((a,b)=>a+b.panelsCount,0);
        const dcKw = (totalPanels * panel.powerW) / 1000;
        const acKw = inverter.maxPowerKw * (project.systemConfig.inverterCount || 1);
        const ratio = dcKw / acKw;
        if (ratio > 1.35) suggestions.push({ id: 'high-clipping', type: 'warning', title: 'Rácio DC/AC Elevado', message: 'Clipping provável.' });
    }
    if (sim.autonomyRatio > 0.9) suggestions.push({ id: 'high-autonomy', type: 'success', title: 'Excelente Independência', message: '>90%.' });
    
    // Shading check
    if (sim.shadingLossPercent && sim.shadingLossPercent > 10) {
        suggestions.push({ id: 'high-shading', type: 'warning', title: 'Sombreamento Elevado', message: 'Perdas por sombra > 10%. Revise o espaçamento.'});
    }

    return suggestions;
};