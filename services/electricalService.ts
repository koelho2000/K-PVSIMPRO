
import { ProjectState, SolarPanel, Inverter, SystemConfig } from "../types";
import { PANELS_DB, INVERTERS_DB } from "../constants";

export interface StringConfig {
    mpptId: number;
    numStrings: number; // Number of parallel strings on this MPPT
    panelsPerString: number;
    vocString: number; // Max Voltage (-10C)
    vmpString: number; // Nom Voltage
    iscString: number; // Max Current (Total for the MPPT)
    impString: number; // Nom Current
    powerKw: number;
}

export interface ElectricalVerification {
    valid: boolean;
    errors: string[];
    warnings: string[];
    strings: StringConfig[];
    metrics: {
        totalDcPowerKw: number;
        totalAcPowerKw: number;
        dcAcRatio: number;
        maxStringVoltage: number;
        maxStringCurrent: number;
    };
    cables: {
        dcStringMm2: number;
        acMm2: number;
    };
    protection: {
        dcFuseA: number;
        acBreakerA: number;
    };
}

export const calculateStringing = (project: ProjectState): ElectricalVerification => {
    const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
    const inverterCount = project.systemConfig.inverterCount || 1;

    const errors: string[] = [];
    const warnings: string[] = [];
    const strings: StringConfig[] = [];

    // Default sizing
    const sizing = {
        cables: { dcStringMm2: 0, acMm2: 0 },
        protection: { dcFuseA: 0, acBreakerA: 0 }
    };

    if (!panel || !inverter) {
        return { 
            valid: false, errors: ["Equipamento não selecionado"], warnings: [], 
            strings: [], metrics: { totalDcPowerKw: 0, totalAcPowerKw: 0, dcAcRatio: 0, maxStringVoltage: 0, maxStringCurrent: 0 },
            ...sizing
        };
    }

    const totalPanels = project.roofSegments.reduce((a, b) => a + b.panelsCount, 0);
    const totalDcPowerKw = (totalPanels * panel.powerW) / 1000;
    const totalAcPowerKw = inverter.maxPowerKw * inverterCount;
    const dcAcRatio = totalDcPowerKw / (totalAcPowerKw || 1);

    // --- 1. Temperature Coefficients & Limits ---
    const minTemp = -10; // Coldest day
    const maxTemp = 70;  // Hot cell temp
    
    // Voc increases as temp decreases
    const vocMax = panel.voc * (1 + (Math.abs(panel.tempCoeffVoc) / 100) * (25 - minTemp));
    // Vmp decreases as temp increases
    const vmpMin = panel.vmp * (1 - (Math.abs(panel.tempCoeffVoc) / 100) * (maxTemp - 25));

    // --- 2. Capacity Calculations ---
    
    // Max Panels in Series (Voltage Limit)
    const maxPanelsSeries = Math.floor(inverter.maxDcVoltage / vocMax);
    
    // Min Panels in Series (Start Voltage Limit)
    const minPanelsSeries = Math.ceil(inverter.startVoltage / vmpMin);

    // Max Parallel Strings per MPPT (Current Limit)
    // Some inverters allow I_sc > I_max_input slightly if I_imp is OK, but we use I_sc for safety
    const maxStringsParallel = Math.floor(inverter.maxInputCurrent / panel.isc) || 1; 
    // Note: If panel current > inverter max current, we assume 1 string but warn about clipping/safety if strictly enforced. 
    // Usually maxInputCurrent is I_sc_max for the inverter. If panel I_sc > Inverter I_max, it's incompatible.
    
    if (panel.isc > inverter.maxInputCurrent) {
        errors.push(`Corrente do painel (${panel.isc}A) excede entrada máx do inversor (${inverter.maxInputCurrent}A).`);
    }

    // Distribute Panels across Inverters
    const panelsPerInverter = Math.ceil(totalPanels / inverterCount);
    
    // --- 3. Stringing Algorithm ---
    
    let panelsToAssign = panelsPerInverter;
    const mpptCount = inverter.numMppts;
    
    // Strategy: Distribute evenly across MPPTs
    const panelsPerMpptIdeal = Math.floor(panelsToAssign / mpptCount);
    let panelsRemainder = panelsToAssign % mpptCount;

    for (let m = 1; m <= mpptCount; m++) {
        if (panelsToAssign <= 0) break;

        let targetForThisMppt = panelsPerMpptIdeal + (panelsRemainder > 0 ? 1 : 0);
        panelsRemainder--;

        if (targetForThisMppt === 0) continue;

        // Try to string this MPPT
        // We need to divide 'targetForThisMppt' into N parallel strings of length L
        // such that L <= maxPanelsSeries and N <= maxStringsParallel
        
        let bestConfig = null;

        // Try 1 string, then 2 strings, etc.
        for (let s = 1; s <= maxStringsParallel; s++) {
            if (targetForThisMppt % s === 0) {
                const len = targetForThisMppt / s;
                if (len <= maxPanelsSeries && len >= minPanelsSeries) {
                    bestConfig = { numStrings: s, panelsPerString: len };
                    break; // Found valid config
                }
            }
        }

        // If no perfect division, we might need to leave panels out or balance differently
        // For simulation simplicity, if we can't perfectly balance, we try to just fill series max
        if (!bestConfig) {
             // Try just max series length
             const len = Math.min(targetForThisMppt, maxPanelsSeries);
             if (len >= minPanelsSeries) {
                 bestConfig = { numStrings: 1, panelsPerString: len };
             }
        }

        if (bestConfig) {
            strings.push({
                mpptId: m,
                numStrings: bestConfig.numStrings,
                panelsPerString: bestConfig.panelsPerString,
                vocString: bestConfig.panelsPerString * vocMax,
                vmpString: bestConfig.panelsPerString * panel.vmp,
                iscString: bestConfig.numStrings * panel.isc,
                impString: bestConfig.numStrings * panel.imp,
                powerKw: (bestConfig.numStrings * bestConfig.panelsPerString * panel.powerW) / 1000
            });
            panelsToAssign -= (bestConfig.numStrings * bestConfig.panelsPerString);
        }
    }

    if (panelsToAssign > 0) {
        errors.push(`Não foi possível conectar ${panelsToAssign * inverterCount} painéis. Limite de tensão/corrente atingido ou configuração impossível.`);
    }

    // --- 4. Validation ---
    let maxStrVolts = 0;
    let maxStrAmps = 0;

    strings.forEach(str => {
        if (str.vocString > inverter.maxDcVoltage) errors.push(`MPPT ${str.mpptId}: Tensão ${str.vocString.toFixed(0)}V excede limite ${inverter.maxDcVoltage}V`);
        if (str.iscString > inverter.maxInputCurrent) errors.push(`MPPT ${str.mpptId}: Corrente ${str.iscString.toFixed(1)}A excede limite ${inverter.maxInputCurrent}A`);
        
        if (str.vmpString < inverter.mpptRange[0]) warnings.push(`MPPT ${str.mpptId}: Tensão nominal baixa. Pode não arrancar cedo.`);
        
        if (str.vocString > maxStrVolts) maxStrVolts = str.vocString;
        if (str.iscString > maxStrAmps) maxStrAmps = str.iscString;
    });

    if (dcAcRatio > 1.4) warnings.push(`Rácio DC/AC alto (${dcAcRatio.toFixed(2)}). Clipping severo.`);
    if (dcAcRatio < 0.7) warnings.push(`Inversor sobredimensionado (Rácio ${dcAcRatio.toFixed(2)}).`);


    // --- 5. Cabling & Protection ---
    const iDcDesign = panel.isc * 1.25;
    let dcMm2 = 4;
    if (iDcDesign > 30) dcMm2 = 6; // Parallel strings usually require thicker cable if combined before box, assuming separate runs here usually 4mm or 6mm

    const fuseA = Math.ceil(panel.isc * 1.25);
    
    // AC Sizing
    const iAcMax = (totalAcPowerKw * 1000) / (inverter.phases === 3 ? (Math.sqrt(3) * 400) : 230);
    // If multiple inverters, this current is Total. Per inverter cable is calculated based on single inverter.
    const iAcPerInverter = (inverter.maxPowerKw * 1000) / (inverter.phases === 3 ? (Math.sqrt(3) * 400) : 230);
    
    let acMm2 = 2.5;
    const iAcDesign = iAcPerInverter * 1.25;
    
    if (iAcDesign > 20) acMm2 = 4;
    if (iAcDesign > 32) acMm2 = 6;
    if (iAcDesign > 50) acMm2 = 10;
    if (iAcDesign > 80) acMm2 = 16;
    
    const breakerSizes = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    let breakerA = breakerSizes.find(b => b > iAcDesign) || 125;

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        strings,
        metrics: {
            totalDcPowerKw,
            totalAcPowerKw,
            dcAcRatio,
            maxStringVoltage: maxStrVolts,
            maxStringCurrent: maxStrAmps
        },
        cables: { dcStringMm2: dcMm2, acMm2 },
        protection: { dcFuseA: fuseA, acBreakerA: breakerA }
    };
};

export const findOptimalConfiguration = (project: ProjectState): { config: SystemConfig, reason: string } | null => {
    const panel = PANELS_DB.find(p => p.id === project.systemConfig.selectedPanelId);
    const totalPanels = project.roofSegments.reduce((a, b) => a + b.panelsCount, 0);
    const dcPowerKw = (totalPanels * (panel?.powerW || 0)) / 1000;
    
    if (!panel) return null;

    // 1. Try to Fix Quantity of Current Inverter
    const currentInv = INVERTERS_DB.find(i => i.id === project.systemConfig.selectedInverterId);
    if (currentInv) {
        const targetQty = Math.ceil(dcPowerKw / (currentInv.maxPowerKw * 1.1)); // Aim for 1.1 DC/AC
        if (targetQty !== project.systemConfig.inverterCount) {
             // Check if this fixes stringing
             const testProj = { ...project, systemConfig: { ...project.systemConfig, inverterCount: targetQty } };
             const check = calculateStringing(testProj);
             if (check.valid) {
                 return { 
                     config: testProj.systemConfig, 
                     reason: `Ajuste de quantidade: ${targetQty}x ${currentInv.model} para suportar a potência/tensão.` 
                 };
             }
        }
    }

    // 2. Try to find a better Inverter Model (Single Unit preference)
    // Filter inverters that can handle the Voltage
    const minTemp = -10;
    const vocMax = panel.voc * (1 + (Math.abs(panel.tempCoeffVoc) / 100) * (25 - minTemp));
    
    const candidates = INVERTERS_DB.filter(inv => {
        // Can it take the voltage?
        if (inv.maxDcVoltage < vocMax * 5) return false; // Basic filter, needs to hold at least 5 panels
        return true;
    });

    let bestSolution = null;

    for (const inv of candidates) {
        // How many needed?
        const qty = Math.ceil(dcPowerKw / (inv.maxPowerKw * 1.2));
        const testConfig = { ...project.systemConfig, selectedInverterId: inv.id, inverterCount: qty };
        const testProj = { ...project, systemConfig: testConfig };
        const check = calculateStringing(testProj);

        if (check.valid) {
            // Found a valid one. Is it better? 
            // Prefer fewer units, then same manufacturer
            if (!bestSolution || (qty < bestSolution.config.inverterCount)) {
                bestSolution = { config: testConfig, manufacturer: inv.manufacturer };
            }
        }
    }

    if (bestSolution) {
        return {
            config: bestSolution.config,
            reason: `Inversor recomendado: ${bestSolution.config.inverterCount}x ${INVERTERS_DB.find(i=>i.id===bestSolution?.config.selectedInverterId)?.model} (Compatível eletricamente).`
        };
    }

    return null;
};
