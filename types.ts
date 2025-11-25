

export enum PanelOrientation {
  Portrait = 'Portrait',
  Landscape = 'Landscape',
}

export interface Equipment {
  id: string;
  manufacturer: string;
  model: string;
  price: number;
  // Physical Specs
  weightKg?: number;
  dimensions?: {
      width: number;
      height: number;
      depth: number;
  };
}

export interface SolarPanel extends Equipment {
  powerW: number; // Watts
  widthMm: number;
  heightMm: number;
  efficiency: number;
  // Electrical Specs for Stringing
  voc: number; // Open Circuit Voltage (V)
  isc: number; // Short Circuit Current (A)
  vmp: number; // Voltage at Max Power (V)
  imp: number; // Current at Max Power (A)
  tempCoeffVoc: number; // %/°C (e.g., -0.29)
  depthMm?: number; // New
}

export interface Inverter extends Equipment {
  maxPowerKw: number;
  phases: 1 | 3;
  efficiency: number;
  // Electrical Specs
  maxDcVoltage: number; // V
  startVoltage: number; // V
  mpptRange: [number, number]; // [min, max] V
  maxInputCurrent: number; // A per MPPT
  numMppts: number;
}

export interface Battery extends Equipment {
  capacityKwh: number;
  maxDischargeKw: number;
  efficiency: number;
  nominalVoltage?: number; // V
}

export interface LoadProfile {
  type: 'simplified' | 'imported';
  profileName?: string; // e.g. "Residencial T3"
  baseLoadKw: number;
  peakLoadKw: number;
  annualConsumptionKwh: number;
  hourlyData?: number[]; // 8760 array
}

export interface Point {
  x: number;
  y: number;
}

export interface RoofSegment {
  id: string;
  width: number; // Used for Rect or Bounding Box width for Poly
  height: number; // Used for Rect or Bounding Box height for Poly
  azimuth: number; // 0 = South
  tilt: number;
  panelsCount: number;
  // New layout fields
  edgeMargin: number; // meters
  verticalSpacing: number; // meters
  horizontalSpacing: number; // meters
  // Visual Positioning
  x?: number; // X position on canvas (meters) - Top Left
  y?: number; // Y position on canvas (meters) - Top Left
  
  // Freeform shape support
  isPolygon?: boolean;
  vertices?: Point[]; // Array of points in meters (relative to canvas 0,0)
}

export interface ClimateData {
  monthlyTemp: number[];
  monthlyRad: number[];
  monthlyHum: number[]; // Humidity
  hourlyTemp: number[]; // 8760 (synthetic or real)
  hourlyRad: number[];  // 8760
  hourlyHum: number[];  // 8760
}

export interface ProjectSettings {
  name: string;
  clientName: string;
  address: string;
  latitude: number;
  longitude: number;
  climateDataSource: 'auto' | 'epw';
  climateDescription?: string;
  googleMapsUri?: string;
}

export interface FinancialSettings {
    electricityPriceEurKwh: number; // Cost to buy
    gridExportPriceEurKwh: number; // Price to sell
    inflationRate: number; // %
    panelDegradation: number; // % per year
}

export interface SystemConfig {
  selectedPanelId: string;
  selectedInverterId: string;
  inverterCount: number; // Number of inverters
  selectedBatteryId: string | null;
  batteryCount: number; // Number of battery units
  optimizationGoal: 'autoconsumption' | 'production' | 'injection' | 'balanced';
  // Cable Distances
  cableDcMeters: number; // Total distance from roof to inverter
  cableAcMeters: number; // Total distance from inverter to main board
}

export interface SimulationResult {
  hourlyProduction: number[];
  hourlyLoad: number[];
  hourlyGridImport: number[];
  hourlyGridExport: number[];
  hourlyBatterySoC: number[];
  hourlySelfConsumption: number[]; // New field for clearer charting
  totalProductionKwh: number;
  totalImportKwh: number;
  totalExportKwh: number;
  totalLoadKwh: number;
  selfConsumptionRatio: number; // 0-1
  autonomyRatio: number; // 0-1
}

export interface ProjectState {
  id: string;
  createdDate: string;
  version: string;
  settings: ProjectSettings;
  financialSettings: FinancialSettings; // New Financial Config
  climateData?: ClimateData; // Store generated or imported climate data
  loadProfile: LoadProfile;
  roofSegments: RoofSegment[];
  systemConfig: SystemConfig;
  simulationResult: SimulationResult | null;
}