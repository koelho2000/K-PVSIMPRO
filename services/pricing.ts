
import { ProjectState } from "../types";
import { PRICING_DB, PANELS_DB, INVERTERS_DB, BATTERIES_DB } from "../constants";

export interface BudgetItem {
    category: 'Modules' | 'Inverter' | 'Battery' | 'Structure' | 'Electrical' | 'Labor' | 'Services';
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
}

export const calculateDetailedBudget = (project: ProjectState): BudgetItem[] => {
    const items: BudgetItem[] = [];
    const { roofSegments, systemConfig } = project;

    // 1. Equipment
    const panel = PANELS_DB.find(p => p.id === systemConfig.selectedPanelId);
    const inverter = INVERTERS_DB.find(i => i.id === systemConfig.selectedInverterId);
    const battery = BATTERIES_DB.find(b => b.id === systemConfig.selectedBatteryId);
    
    const totalPanels = roofSegments.reduce((acc, seg) => acc + seg.panelsCount, 0);

    if (panel) {
        items.push({
            category: 'Modules',
            description: `Painel Fotovoltaico ${panel.manufacturer} ${panel.model} ${panel.powerW}W`,
            unit: 'un',
            quantity: totalPanels,
            unitPrice: panel.price,
            totalPrice: totalPanels * panel.price
        });
    }

    if (inverter) {
        const qty = systemConfig.inverterCount || 1;
        items.push({
            category: 'Inverter',
            description: `Inversor ${inverter.phases === 1 ? 'Monofásico' : 'Trifásico'} ${inverter.manufacturer} ${inverter.model}`,
            unit: 'un',
            quantity: qty,
            unitPrice: inverter.price,
            totalPrice: qty * inverter.price
        });
    }

    if (battery) {
        const qty = systemConfig.batteryCount || 1;
        items.push({
            category: 'Battery',
            description: `Bateria ${battery.manufacturer} ${battery.model} (${battery.capacityKwh} kWh)`,
            unit: 'un',
            quantity: qty,
            unitPrice: battery.price,
            totalPrice: qty * battery.price
        });
    }

    // 2. Structure (Estimative)
    // Assume 2.2m rail per 2 panels (portrait) or roughly 1.2m rail per panel
    const railMeters = totalPanels * 2.2; 
    items.push({
        category: 'Structure',
        description: PRICING_DB.structure_rail.name,
        unit: PRICING_DB.structure_rail.unit,
        quantity: Math.ceil(railMeters),
        unitPrice: PRICING_DB.structure_rail.price,
        totalPrice: Math.ceil(railMeters) * PRICING_DB.structure_rail.price
    });

    // Fixations (Hooks/Triangles) - approx 4 per 2 panels
    const hooks = Math.ceil(totalPanels * 1.5);
    items.push({
        category: 'Structure',
        description: PRICING_DB.structure_hook.name,
        unit: PRICING_DB.structure_hook.unit,
        quantity: hooks,
        unitPrice: PRICING_DB.structure_hook.price,
        totalPrice: hooks * PRICING_DB.structure_hook.price
    });

    // Clamps
    const midClamps = Math.max(0, (totalPanels - 1) * 2); // Simplified
    const endClamps = 4 * roofSegments.length; // 4 per array group approx
    items.push({
        category: 'Structure',
        description: 'Kit Grampos Fixação (Intermédios + Finais)',
        unit: 'un',
        quantity: midClamps + endClamps,
        unitPrice: PRICING_DB.structure_clamp_mid.price, // Avg price
        totalPrice: (midClamps + endClamps) * PRICING_DB.structure_clamp_mid.price
    });

    // 3. Electrical (Cables & Protection)
    
    // DC Cables
    // 2 cables (+/-) * distance * number of strings (assume 1 string per 10 panels approx)
    const numStrings = Math.ceil(totalPanels / 10) || 1;
    const dcDist = systemConfig.cableDcMeters || 15; // default 15m
    const dcCableQty = (dcDist * 2 * numStrings) + (totalPanels * 1.5); // Run + Interconnects
    
    items.push({
        category: 'Electrical',
        description: PRICING_DB.cable_dc_solar_6mm.name,
        unit: PRICING_DB.cable_dc_solar_6mm.unit,
        quantity: Math.ceil(dcCableQty),
        unitPrice: PRICING_DB.cable_dc_solar_6mm.price,
        totalPrice: Math.ceil(dcCableQty) * PRICING_DB.cable_dc_solar_6mm.price
    });

    // MC4
    const mc4Qty = numStrings * 4; // 2 pairs per string
    items.push({
        category: 'Electrical',
        description: PRICING_DB.connector_mc4.name,
        unit: PRICING_DB.connector_mc4.unit,
        quantity: mc4Qty,
        unitPrice: PRICING_DB.connector_mc4.price,
        totalPrice: mc4Qty * PRICING_DB.connector_mc4.price
    });

    // AC Cable
    const acDist = systemConfig.cableAcMeters || 10;
    const isThreePhase = inverter?.phases === 3;
    const acCableType = isThreePhase ? PRICING_DB.cable_ac_5x6mm : PRICING_DB.cable_ac_3x4mm;
    items.push({
        category: 'Electrical',
        description: acCableType.name,
        unit: acCableType.unit,
        quantity: Math.ceil(acDist),
        unitPrice: acCableType.price,
        totalPrice: Math.ceil(acDist) * acCableType.price
    });

    // Protection Boards
    items.push({
        category: 'Electrical',
        description: PRICING_DB.protection_board_dc.name,
        unit: 'un',
        quantity: numStrings > 2 ? 2 : 1, // 1 box supports up to 2 strings typically
        unitPrice: PRICING_DB.protection_board_dc.price,
        totalPrice: (numStrings > 2 ? 2 : 1) * PRICING_DB.protection_board_dc.price
    });

    items.push({
        category: 'Electrical',
        description: isThreePhase ? PRICING_DB.protection_board_ac_3ph.name : PRICING_DB.protection_board_ac_1ph.name,
        unit: 'un',
        quantity: 1,
        unitPrice: isThreePhase ? PRICING_DB.protection_board_ac_3ph.price : PRICING_DB.protection_board_ac_1ph.price,
        totalPrice: isThreePhase ? PRICING_DB.protection_board_ac_3ph.price : PRICING_DB.protection_board_ac_1ph.price
    });
    
    // Smart Meter
    items.push({
        category: 'Electrical',
        description: PRICING_DB.smart_meter.name,
        unit: 'un',
        quantity: 1,
        unitPrice: PRICING_DB.smart_meter.price,
        totalPrice: PRICING_DB.smart_meter.price
    });

    // 4. Labor & Services
    // Estimate 2 man-hours per panel (structure + mounting + electric)
    const hours = Math.ceil(totalPanels * 2.5) + 8; // +8h base setup
    items.push({
        category: 'Labor',
        description: PRICING_DB.labor_specialized.name,
        unit: PRICING_DB.labor_specialized.unit,
        quantity: hours,
        unitPrice: PRICING_DB.labor_specialized.price,
        totalPrice: hours * PRICING_DB.labor_specialized.price
    });

    items.push({
        category: 'Services',
        description: PRICING_DB.project_licensing.name,
        unit: 'un',
        quantity: 1,
        unitPrice: PRICING_DB.project_licensing.price,
        totalPrice: PRICING_DB.project_licensing.price
    });
    
    items.push({
        category: 'Services',
        description: PRICING_DB.commissioning.name,
        unit: 'un',
        quantity: 1,
        unitPrice: PRICING_DB.commissioning.price,
        totalPrice: PRICING_DB.commissioning.price
    });

    return items;
};
