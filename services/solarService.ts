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
 * Generates synthetic climate data based on latitude.
 */
export const generateClimateData = (lat: number): ClimateData => {
    const hourlyTemp: number[] = [];
    const hourlyRad: number[] = [];
    const hourlyHum: number[] = [];
    const monthlyTemp: number[] = new Array(12).fill(0);
    const monthlyRad: number[] = new Array(12).fill(0);
    const monthlyHum: number[] = new Array(12).fill(0);

    const isNorthern = lat > 0;
    
    // Simple seasonality model
    for (let d = 0; d < 365; d++) {
        const peakDay = isNorthern ? 172 : 355;
        const season = Math.cos(2 * Math.PI * (d - peakDay) / 365); 
        const avgTemp = 15 + (10 * season); 
        const dayRad = 5 + (3 * season); // kWh/m2/day
        const avgHum = 60 + (20 * season);

        for (let h = 0; h < 24; h++) {
            const hourCycle = -Math.cos(2 * Math.PI * (h - 4) / 24);
            const temp = avgTemp + (5 * hourCycle) + (Math.random() * 2 - 1);
            hourlyTemp.push(temp);

            let rad = 0;
            if (h > 6 && h < 20) {
                 const sunHeight = Math.sin(Math.PI * (h - 6) / 14);
                 rad = (dayRad * 1000 / 10) * sunHeight * (0.8 + Math.random() * 0.4); // W/m2
            }
            hourlyRad.push(rad);

            let hum = avgHum + (10 * -hourCycle) + (Math.random() * 10 - 5);
            hum = Math.max(20, Math.min(100, hum));
            hourlyHum.push(hum);
        }
    }

    for (let i = 0; i < 12; i++) {
        const start = i * 30 * 24;
        const end = start + (30 * 24);
        const monthSliceTemp = hourlyTemp.slice(start, end);
        const monthSliceRad = hourlyRad.slice(start, end);
        const monthSliceHum = hourlyHum.slice(start, end);
        
        monthlyTemp[i] = monthSliceTemp.reduce((a,b)=>a+b,0) / monthSliceTemp.length;
        monthlyRad[i] = (monthSliceRad.reduce((a,b)=>a+b,0) / 1000) / 30; // kWh/m2/day average
        monthlyHum[i] = monthSliceHum.reduce((a,b)=>a+b,0) / monthSliceHum.length;
    }

    return { hourlyTemp, hourlyRad, hourlyHum, monthlyTemp, monthlyRad, monthlyHum };
};

/**
 * Generates a synthetic load profile (8760 points) based on base/peak/annual params.
 * CRITICAL: It scales the resulting curve so the sum matches annualKwh EXACTLY.
 */
export const generateSyntheticLoadProfile = (annualKwh: number, baseKw: number, peakKw: number): number[] => {
    const rawData: number[] = [];
    
    // 1. Generate Shape
    for (let d = 0; d < 365; d++) {
        const isWeekend = (d % 7) === 0 || (d % 7) === 6;
        for (let h = 0; h < 24; h++) {
            const base = baseKw;
            const peak = peakKw;
            let factor = 0.1;
            
            // Standard Residential Shape Logic
            if (!isWeekend) {
                // Weekday: Morning Peak (7-9), Evening Peak (18-22)
                if ((h >= 7 && h <= 9) || (h >= 18 && h <= 22)) factor = 0.9;
                else if (h > 9 && h < 18) factor = 0.4;
            } else {
                // Weekend: More spread out day usage
                if (h > 9 && h < 22) factor = 0.6;
            }
            
            // Add slight randomness (5%) to make it look organic, but keep shape
            const noise = 1 + (Math.random() * 0.1 - 0.05);
            const val = (base + (peak - base) * factor) * noise;
            rawData.push(Math.max(0.1, val));
        }
    }

    // 2. Normalize to Match Annual Consumption
    const rawTotal = rawData.reduce((a, b) => a + b, 0);
    const scalingFactor = annualKwh / rawTotal;

    return rawData.map(v => v * scalingFactor);
};

/**
 * CORE SIMULATION ENGINE
 */
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

  // 1. Get Load Data (Use existing or generate normalized)
  let hourlyLoad: number[] = [];
  if (loadProfile.hourlyData && loadProfile.hourlyData.length === 8760) {
      hourlyLoad = [...loadProfile.hourlyData];
  } else {
      // Fallback: Generate and normalize on the fly if missing (e.g. legacy project)
      hourlyLoad = generateSyntheticLoadProfile(
          loadProfile.annualConsumptionKwh, 
          loadProfile.baseLoadKw, 
          loadProfile.peakLoadKw
      );
  }

  // 2. Hourly Loop
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

/**
 * Generates 4 strategic scenarios by resizing the system and running simulations for each.
 */
export const generateScenarios = (baseProject: ProjectState): Scenario[] => {
    const scenarios: Scenario[] = [];
    
    // Helper: Point in Polygon Algorithm
    const isPointInPoly = (p: Point, vertices: Point[]) => {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            const intersect = ((yi > p.y) !== (yj > p.y)) &&
                (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    // Helper to calculate max panels possible on current roof setup
    const getMaxPanelsForSegment = (seg: RoofSegment, panel: SolarPanel) => {
        const pW = panel.widthMm / 1000;
        const pH = panel.heightMm / 1000;
        const hSpace = seg.horizontalSpacing || 0.02;
        const vSpace = seg.verticalSpacing || 0.05;
        const edge = seg.edgeMargin || 0;

        if (seg.isPolygon && seg.vertices && seg.vertices.length > 2) {
            let count = 0;
            const xs = seg.vertices.map(v => v.x);
            const ys = seg.vertices.map(v => v.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const startX = minX + edge;
            const startY = minY + edge;

            for (let y = startY; y < maxY - edge; y += pH + vSpace) {
                for (let x = startX; x < maxX - edge; x += pW + hSpace) {
                    const cx = x + pW / 2;
                    const cy = y + pH / 2;
                    if (isPointInPoly({x: cx, y: cy}, seg.vertices)) {
                        count++;
                    }
                }
            }
            return count;
        } else {
            const usableW = Math.max(0, seg.width - (2 * edge));
            const usableH = Math.max(0, seg.height - (2 * edge));
            const cols = Math.floor((usableW + hSpace) / (pW + hSpace));
            const rows = Math.floor((usableH + vSpace) / (pH + vSpace));
            return cols * rows;
        }
    };

    const strategies = [
        { id: 'production', label: 'Max Produção', desc: 'Preenchimento total da cobertura para vender excedente.' },
        { id: 'autoconsumption', label: 'Max Autoconsumo', desc: 'Otimizado para cobrir consumo e bateria para noite.' },
        { id: 'injection', label: 'Min Injeção', desc: 'Sistema pequeno para evitar venda à rede.' },
        { id: 'balanced', label: 'Equilibrado', desc: 'Melhor retorno financeiro (ROI).' }
    ];

    const userPanel = PANELS_DB.find(p => p.id === baseProject.systemConfig.selectedPanelId) || PANELS_DB[0];
    const userInverter = INVERTERS_DB.find(i => i.id === baseProject.systemConfig.selectedInverterId) || INVERTERS_DB[0];
    const userBattery = baseProject.systemConfig.selectedBatteryId ? BATTERIES_DB.find(b => b.id === baseProject.systemConfig.selectedBatteryId) : BATTERIES_DB[0];

    strategies.forEach(strat => {
        const scProj: ProjectState = JSON.parse(JSON.stringify(baseProject));
        const totalMaxPanels = scProj.roofSegments.reduce((sum, seg) => sum + getMaxPanelsForSegment(seg, userPanel), 0);
        const annualLoad = scProj.loadProfile.annualConsumptionKwh;

        // Ensure load profile is populated for simulation
        if (!scProj.loadProfile.hourlyData) {
             scProj.loadProfile.hourlyData = generateSyntheticLoadProfile(
                 annualLoad, 
                 scProj.loadProfile.baseLoadKw, 
                 scProj.loadProfile.peakLoadKw
             );
        }

        let targetPanels = 0;
        if (strat.id === 'production') {
            targetPanels = totalMaxPanels;
        } else if (strat.id === 'autoconsumption') {
            const targetProd = annualLoad * 1.2;
            const kwNeeded = targetProd / 1450; 
            targetPanels = Math.ceil((kwNeeded * 1000) / userPanel.powerW);
        } else if (strat.id === 'injection') {
            const targetProd = annualLoad * 0.6;
            const kwNeeded = targetProd / 1450;
            targetPanels = Math.ceil((kwNeeded * 1000) / userPanel.powerW);
        } else {
            const targetProd = annualLoad;
            const kwNeeded = targetProd / 1450;
            targetPanels = Math.ceil((kwNeeded * 1000) / userPanel.powerW);
        }
        
        targetPanels = Math.min(targetPanels, totalMaxPanels);
        targetPanels = Math.max(targetPanels, 1);

        let remaining = targetPanels;
        scProj.roofSegments = scProj.roofSegments.map(seg => {
            const max = getMaxPanelsForSegment(seg, userPanel);
            const take = Math.min(remaining, max);
            remaining -= take;
            return { ...seg, panelsCount: take };
        });

        const totalPowerKw = (targetPanels * userPanel.powerW) / 1000;
        const sameBrandInverters = INVERTERS_DB.filter(i => i.manufacturer === userInverter.manufacturer);
        const candidateInverters = sameBrandInverters.length > 0 ? sameBrandInverters : INVERTERS_DB;

        let bestInverter = candidateInverters
            .filter(inv => inv.maxPowerKw >= totalPowerKw * 0.8)
            .sort((a,b) => a.maxPowerKw - b.maxPowerKw)[0];

        let invCount = 1;
        
        if (!bestInverter) {
            bestInverter = candidateInverters.sort((a,b) => b.maxPowerKw - a.maxPowerKw)[0];
            invCount = Math.ceil((totalPowerKw * 0.8) / bestInverter.maxPowerKw);
        }
        
        scProj.systemConfig.selectedInverterId = bestInverter.id;
        scProj.systemConfig.inverterCount = invCount;

        if (strat.id === 'production') {
             scProj.systemConfig.selectedBatteryId = null;
             scProj.systemConfig.batteryCount = 0;
        } else {
             const daily = annualLoad / 365;
             let targetBattKwh = 0;
             if (strat.id === 'autoconsumption') targetBattKwh = daily * 0.6;
             else if (strat.id === 'injection') targetBattKwh = daily * 0.4;
             else targetBattKwh = daily * 0.3; // Balanced

             if (userBattery) {
                 scProj.systemConfig.selectedBatteryId = userBattery.id;
                 scProj.systemConfig.batteryCount = Math.max(1, Math.round(targetBattKwh / userBattery.capacityKwh));
             } else {
                 const batt = BATTERIES_DB[0];
                 scProj.systemConfig.selectedBatteryId = batt.id;
                 scProj.systemConfig.batteryCount = Math.max(1, Math.round(targetBattKwh / batt.capacityKwh));
             }
        }

        const simResult = runSimulation(scProj);

        scenarios.push({
            id: strat.id,
            label: strat.label,
            description: strat.desc,
            systemConfig: scProj.systemConfig,
            roofSegments: scProj.roofSegments,
            simulation: simResult,
            stats: {
                panels: targetPanels,
                inverter: bestInverter.model,
                inverterCount: invCount,
                batteries: scProj.systemConfig.batteryCount || 0,
                powerKw: parseFloat(totalPowerKw.toFixed(2))
            }
        });
    });

    return scenarios;
}

export interface ImprovementSuggestion {
    type: 'warning' | 'info' | 'success';
    title: string;
    message: string;
}

/**
 * Analyzes the simulation result to provide intelligent improvement suggestions.
 */
export const analyzeResults = (project: ProjectState): ImprovementSuggestion[] => {
    const suggestions: ImprovementSuggestion[] = [];
    const sim = project.simulationResult;
    if (!sim) return [];

    const injectionRatio = sim.totalExportKwh / sim.totalProductionKwh;
    const autonomy = sim.autonomyRatio;
    
    // 1. High Injection Check
    if (injectionRatio > 0.5) {
        if (!project.systemConfig.selectedBatteryId) {
            suggestions.push({ 
                type: 'warning', 
                title: 'Alta Injeção na Rede (>50%)', 
                message: 'Está a desperdiçar muita energia. Considere adicionar baterias para armazenar o excedente diurno e usar à noite.' 
            });
        } else {
            suggestions.push({ 
                type: 'info', 
                title: 'Otimizar Armazenamento', 
                message: 'Mesmo com bateria, a injeção é alta. Considere aumentar a capacidade do banco de baterias se o orçamento permitir.' 
            });
        }
    }

    // 2. Low Autonomy Check
    if (autonomy < 0.4) {
        suggestions.push({
            type: 'warning',
            title: 'Baixa Autonomia (<40%)',
            message: 'A sua dependência da rede é alta. Se tiver espaço no telhado, aumente o número de painéis fotovoltaicos.'
        });
    }

    // 3. Battery Usage Check (Oversized?)
    if (project.systemConfig.selectedBatteryId) {
        const minSoc = Math.min(...sim.hourlyBatterySoC);
        if (minSoc > 50) {
            suggestions.push({
                type: 'info',
                title: 'Bateria Sobredimensionada',
                message: 'A bateria raramente desce abaixo de 50%. Pode reduzir a capacidade para poupar no investimento inicial.'
            });
        }
    }

    // 4. Inverter Clipping Check
    const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
    if (panel && inverter) {
        const totalDC = project.roofSegments.reduce((a,b)=>a+b.panelsCount,0) * panel.powerW / 1000;
        const totalAC = inverter.maxPowerKw * (project.systemConfig.inverterCount || 1);
        if (totalDC > totalAC * 1.35) {
             suggestions.push({
                type: 'warning',
                title: 'Inversor Subdimensionado',
                message: `Potência DC/AC elevada (${(totalDC/totalAC).toFixed(2)}). Haverá perdas por corte de potência (clipping) nas horas de sol forte.`
            });
        }
    }

    // 5. General Efficiency
    const yieldPerKw = sim.totalProductionKwh / ((project.roofSegments.reduce((a,b)=>a+b.panelsCount,0) * (panel?.powerW||0))/1000);
    if (yieldPerKw < 1200) {
        suggestions.push({
            type: 'info',
            title: 'Produtividade Baixa',
            message: `Rendimento de ${yieldPerKw.toFixed(0)} kWh/kWp parece baixo. Verifique se a inclinação (Ideal ~30-35°) e azimute (Ideal 0° Sul) estão otimizados.`
        });
    }

    if (suggestions.length === 0) {
        suggestions.push({
            type: 'success',
            title: 'Sistema Otimizado',
            message: 'O sistema apresenta um bom equilíbrio entre produção, autoconsumo e autonomia.'
        });
    }

    return suggestions;
};