import { ProjectState } from "../types";
import { calculateDetailedBudget } from "./pricing";

export interface YearlyFinancial {
    year: number;
    productionKwh: number;
    electricityPrice: number;
    savingsEur: number;
    revenueEur: number;
    totalBenefitEur: number;
    cumulativeCashflowEur: number;
}

export interface FinancialResult {
    totalInvestmentEur: number;
    paybackPeriodYears: number;
    totalSavings15YearsEur: number;
    roiPercent: number;
    yearlyData: YearlyFinancial[];
}

export const calculateFinancials = (project: ProjectState): FinancialResult => {
    // 1. Get Total Investment (CAPEX)
    const budgetItems = calculateDetailedBudget(project);
    const subtotal = budgetItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalInvestmentEur = subtotal * 1.06; // Assuming 6% IVA as in pricing.ts

    // 2. Base Simulation Data
    const sim = project.simulationResult;
    if (!sim) {
        return {
            totalInvestmentEur,
            paybackPeriodYears: 0,
            totalSavings15YearsEur: 0,
            roiPercent: 0,
            yearlyData: []
        };
    }

    const { financialSettings } = project;
    const initialElecPrice = financialSettings.electricityPriceEurKwh || 0.20;
    const exportPrice = financialSettings.gridExportPriceEurKwh || 0.05;
    const inflation = (financialSettings.inflationRate || 3) / 100;
    const degradation = (financialSettings.panelDegradation || 0.5) / 100;

    const yearlyData: YearlyFinancial[] = [];
    let cumulative = -totalInvestmentEur;
    let paybackYear = 0;

    const baseProduction = sim.totalProductionKwh;
    const baseExport = sim.totalExportKwh;
    const baseSelfConsumption = sim.totalProductionKwh - sim.totalExportKwh;
    
    // Ratios assuming profile remains similar, just scaled by production degradation
    const exportRatio = baseProduction > 0 ? baseExport / baseProduction : 0;
    const selfConsRatio = baseProduction > 0 ? baseSelfConsumption / baseProduction : 0;

    for (let y = 1; y <= 15; y++) {
        // Apply degradation
        const degradFactor = Math.pow(1 - degradation, y - 1);
        const yearProd = baseProduction * degradFactor;
        const yearSelfCons = yearProd * selfConsRatio;
        const yearExport = yearProd * exportRatio;

        // Apply Inflation
        const currentElecPrice = initialElecPrice * Math.pow(1 + inflation, y - 1);
        
        // Benefits
        const savings = yearSelfCons * currentElecPrice;
        const revenue = yearExport * exportPrice;
        const totalBenefit = savings + revenue;

        cumulative += totalBenefit;

        if (cumulative >= 0 && paybackYear === 0) {
            // Precise payback calculation (previous cumulative / this year flow)
            const prevCumulative = cumulative - totalBenefit;
            const fraction = Math.abs(prevCumulative) / totalBenefit;
            paybackYear = (y - 1) + fraction;
        }

        yearlyData.push({
            year: y,
            productionKwh: yearProd,
            electricityPrice: currentElecPrice,
            savingsEur: savings,
            revenueEur: revenue,
            totalBenefitEur: totalBenefit,
            cumulativeCashflowEur: cumulative
        });
    }

    const totalSavings15YearsEur = yearlyData.reduce((sum, d) => sum + d.totalBenefitEur, 0);
    
    // ROI = (Net Profit / Investment) * 100
    // Net Profit = Total Benefits - Investment
    const netProfit = totalSavings15YearsEur - totalInvestmentEur;
    const roiPercent = (netProfit / totalInvestmentEur) * 100;

    return {
        totalInvestmentEur,
        paybackPeriodYears: paybackYear,
        totalSavings15YearsEur,
        roiPercent,
        yearlyData
    };
};