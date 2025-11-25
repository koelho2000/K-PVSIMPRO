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

export const runSimulation = (project: ProjectState): SimulationResult => {
  const { roofSegments, systemConfig, loadProfile } = project;
  
  const panel = PANELS_DB.find(p => p.id === systemConfig.selectedPanelId) || PANELS_DB[0];
  const inverter = INVERTERS_DB.find(i => i.id === systemConfig.selectedInverterId) || INVERTERS_DB[0];
  const battery = systemConfig.selectedBatteryId ? BATTERIES_DB.find(b => b.id === systemConfig.selectedBatteryId) : null;
  const batteryCount = systemConfig.batteryCount || 1;
  const inverterCount = systemConfig.inverterCount || 1;

  let totalSystemPowerKw = 0;
  roofSegments.forEach(seg => {
    totalSystemPowerKw += (seg.panelsCount * panel.powerW) / 1000;
  });

  const hourlyProduction: number[] = [];
  const hourlyGridImport: number[] = [];
  const hourlyGridExport: number[] = [];
  const hourlyBatterySoC: number[] = [];
  const hourlySelfConsumption: number[] = [];

  const batteryCapacity = battery ? (battery.capacityKwh * batteryCount) : 0;
  const batteryMaxDischarge = battery ? (battery.maxDischargeKw * batteryCount) : 0;
  let currentBatteryKwh = 0;

  const climate = project.climateData || generateClimateData(project.settings.latitude);

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

  for (let i = 0; i < 8760; i++) {
      const rad = climate.hourlyRad[i]; 
      const temp = climate.hourlyTemp[i]; 
      const tempLoss = Math.max(0, (temp - 25) * 0.004);
      
      let production = (totalSystemPowerKw * (rad / 1000)) * (1 - tempLoss) * 0.9; 
      production = Math.min(production, totalInverterCapacity);
      
      hourlyProduction.push(production);

      const load = hourlyLoad[i];
      let netEnergy = production - load;
      let gridExport = 0;
      let gridImport = 0;

      if (netEnergy > 0) {
        if (battery && currentBatteryKwh < batteryCapacity) {
          const toCharge = Math.min(netEnergy, batteryMaxDischarge, batteryCapacity - currentBatteryKwh);
          currentBatteryKwh += (toCharge * battery.efficiency);
          netEnergy -= toCharge;
        }
        gridExport = netEnergy;
      } else {
        const needed = Math.abs(netEnergy);
        if (battery && currentBatteryKwh > 0) {
          const fromBattery = Math.min(needed, batteryMaxDischarge, currentBatteryKwh);
          currentBatteryKwh -= fromBattery;
          netEnergy += fromBattery;
        }
        if (netEnergy < 0) {
            gridImport = Math.abs(netEnergy);
        }
      }

      const selfConsumed = production - gridExport; 
      hourlySelfConsumption.push(selfConsumed > 0 ? selfConsumed : 0);
      
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
    totalProductionKwh: totalProduction,
    totalImportKwh: totalImport,
    totalExportKwh: totalExport,
    totalLoadKwh: totalLoad,
    selfConsumptionRatio: totalProduction > 0 ? (totalProduction - totalExport) / totalProduction : 0,
    autonomyRatio: totalLoad > 0 ? (totalLoad - totalImport) / totalLoad : 0
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
    const scenarios: Scenario[] = [];

    // Helper to run sim on a config
    const simulate = (config: SystemConfig, segments: RoofSegment[], label: string, desc: string): Scenario | null => {
        const tempProject = { ...baseProject, systemConfig: config, roofSegments: segments };
        // Ensure load profile has hourly data
        if (!tempProject.loadProfile.hourlyData) {
            tempProject.loadProfile.hourlyData = generateSyntheticLoadProfile(
                tempProject.loadProfile.annualConsumptionKwh,
                tempProject.loadProfile.baseLoadKw,
                tempProject.loadProfile.peakLoadKw
            );
        }
        // Ensure climate
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
            label,
            description: desc,
            systemConfig: config,
            roofSegments: segments,
            simulation: sim,
            stats: {
                panels: totalPanels,
                inverter: `${inv.manufacturer} ${inv.model}`,
                inverterCount: config.inverterCount,
                batteries: config.batteryCount,
                powerKw: parseFloat(((totalPanels * panel.powerW)/1000).toFixed(2))
            }
        };
    };

    // S1: High Efficiency Panels + Battery
    const s1Config = { ...baseProject.systemConfig, selectedPanelId: 'p1', selectedBatteryId: 'b1', batteryCount: 1 };
    const s1 = simulate(s1Config, baseProject.roofSegments, "Alto Rendimento + Bateria", "Painéis SunPower de alta eficiência com armazenamento para noite.");
    if(s1) scenarios.push(s1);

    // S2: Cost Effective (Budget Panels, No Battery)
    const s2Config = { ...baseProject.systemConfig, selectedPanelId: 'p20', selectedBatteryId: null, batteryCount: 0 };
    const s2 = simulate(s2Config, baseProject.roofSegments, "Custo Reduzido", "Painéis económicos sem baterias. Foco em ROI rápido.");
    if(s2) scenarios.push(s2);

    // S3: Autonomy Focus (More Batteries)
    const s3Config = { ...baseProject.systemConfig, selectedPanelId: 'p5', selectedBatteryId: 'b2', batteryCount: 1 }; // Tesla PW
    const s3 = simulate(s3Config, baseProject.roofSegments, "Independência Energética", "Capacidade de armazenamento superior para máxima autonomia.");
    if(s3) scenarios.push(s3);

    // S4: Balanced (Standard Panels, Small Battery)
    const s4Config = { ...baseProject.systemConfig, selectedPanelId: 'p5', selectedBatteryId: 'b1', batteryCount: 1 };
    const s4 = simulate(s4Config, baseProject.roofSegments, "Equilibrado", "Boa relação preço/qualidade com armazenamento híbrido.");
    if(s4) scenarios.push(s4);

    return scenarios;
};

export const analyzeResults = (project: ProjectState): ImprovementSuggestion[] => {
    const suggestions: ImprovementSuggestion[] = [];
    const sim = project.simulationResult;
    if (!sim) return [];

    // 1. Check Autoconsumption
    if (sim.selfConsumptionRatio < 0.4 && !project.systemConfig.selectedBatteryId) {
        suggestions.push({
            id: 'low-self-cons',
            type: 'warning',
            title: 'Autoconsumo Reduzido (<40%)',
            message: 'Grande parte da energia está a ser injetada na rede. Considere adicionar uma bateria para armazenar o excedente solar.'
        });
    }

    // 2. Check Clipping (Simplified check via DC/AC ratio)
    const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
    if (panel && inverter) {
        const totalPanels = project.roofSegments.reduce((a,b)=>a+b.panelsCount,0);
        const dcKw = (totalPanels * panel.powerW) / 1000;
        const acKw = inverter.maxPowerKw * (project.systemConfig.inverterCount || 1);
        const ratio = dcKw / acKw;
        
        if (ratio > 1.35) {
            suggestions.push({
                id: 'high-clipping',
                type: 'warning',
                title: 'Rácio DC/AC Elevado',
                message: `O campo solar (${dcKw.toFixed(1)}kW) é muito maior que a capacidade do inversor (${acKw}kW). Perda de produção por corte (clipping) é provável.`
            });
        }
        if (ratio < 0.7) {
             suggestions.push({
                id: 'oversized-inverter',
                type: 'info',
                title: 'Inversor Sobredimensionado',
                message: 'O inversor tem muito mais capacidade que os painéis. Poderá poupar dinheiro escolhendo um inversor de menor potência.'
            });
        }
    }

    // 3. Autonomy
    if (sim.autonomyRatio > 0.9) {
        suggestions.push({
            id: 'high-autonomy',
            type: 'success',
            title: 'Excelente Independência',
            message: 'O sistema cobre mais de 90% das necessidades energéticas.'
        });
    }

    return suggestions;
};
