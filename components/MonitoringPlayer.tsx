import React, { useState, useEffect, useMemo } from 'react';
import { ProjectState } from '../types';
import { Play, Pause, Square, Rewind, FastForward, Sun, Cloud, CloudRain, Moon, Zap, BatteryCharging, Home, UtilityPole, Download } from 'lucide-react';
import { MONTH_NAMES } from '../constants';

interface MonitoringPlayerProps {
    project: ProjectState;
}

export const MonitoringPlayer: React.FC<MonitoringPlayerProps> = ({ project }) => {
    const [currentHour, setCurrentHour] = useState(0); // 0 to 8759
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(100); // ms per hour tick
    const [speedMultiplier, setSpeedMultiplier] = useState(1);
    
    const sim = project.simulationResult;
    const climate = project.climateData;

    // Timer Logic - Always define hooks at top level
    useEffect(() => {
        let interval: any;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentHour(prev => {
                    if (prev >= 8759) {
                        setIsPlaying(false);
                        return 8759; // STOP at end
                    }
                    return prev + 1;
                });
            }, speed);
        }
        return () => clearInterval(interval);
    }, [isPlaying, speed]);

    // Calculate Cumulative Totals (Totalizers) - Always run hook
    const totals = useMemo(() => {
        if (!sim) return { totProd: 0, totLoad: 0, totImp: 0, totExp: 0, totBatChg: 0, totBatDis: 0 };

        let totProd = 0;
        let totLoad = 0;
        let totImp = 0;
        let totExp = 0;
        let totBatChg = 0;
        let totBatDis = 0;

        // Sum up to current hour
        for (let i = 0; i <= currentHour; i++) {
            const p = sim.hourlyProduction[i] || 0;
            const l = sim.hourlyLoad[i] || 0;
            const imp = sim.hourlyGridImport[i] || 0;
            const exp = sim.hourlyGridExport[i] || 0;

            totProd += p;
            totLoad += l;
            totImp += imp;
            totExp += exp;

            // Battery flow derivation
            const flow = p - l - exp + imp;
            if (flow > 0.001) totBatChg += flow;
            else if (flow < -0.001) totBatDis += Math.abs(flow);
        }

        return { totProd, totLoad, totImp, totExp, totBatChg, totBatDis };
    }, [currentHour, sim]);

    // --- Render Logic (Conditional Checks Here) ---

    if (!sim || !climate) {
        return (
            <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded border border-dashed text-gray-400">
                <Zap size={48} className="mb-4 opacity-50"/>
                <p>Execute a simulação primeiro para aceder à monitorização.</p>
            </div>
        );
    }

    // Export Function
    const exportMonitoringData = () => {
        const rows = [
            ["Hora", "Dia", "Mes", "Producao_kWh", "Consumo_kWh", "Importacao_Rede", "Exportacao_Rede", "Bateria_SoC", "Autoconsumo_Direto", "Descarga_Bateria", "Temp_C", "Radiacao_W/m2"]
        ];
        
        for (let i = 0; i < 8760; i++) {
            const d = Math.floor(i / 24);
            const date = new Date(2023, 0, d + 1);
            rows.push([
                i.toString(),
                date.getDate().toString(),
                MONTH_NAMES[date.getMonth()],
                (sim.hourlyProduction[i] || 0).toFixed(3),
                (sim.hourlyLoad[i] || 0).toFixed(3),
                (sim.hourlyGridImport[i] || 0).toFixed(3),
                (sim.hourlyGridExport[i] || 0).toFixed(3),
                (sim.hourlyBatterySoC[i] || 0).toFixed(1),
                (sim.hourlySelfConsumptionDirect?.[i] || 0).toFixed(3),
                (sim.hourlySelfConsumptionBattery?.[i] || 0).toFixed(3),
                (climate.hourlyTemp[i] || 0).toFixed(1),
                (climate.hourlyRad[i] || 0).toFixed(0)
            ]);
        }

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `monitorizacao_${project.settings.name.replace(/\s+/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Update Speed
    const changeSpeed = (mult: number) => {
        setSpeedMultiplier(mult);
        setSpeed(1000 / (10 * mult)); // Base 10 hours per sec at 1x
    };

    // Data at Current Hour
    const prod = sim.hourlyProduction[currentHour] || 0;
    const load = sim.hourlyLoad[currentHour] || 0;
    const gridImport = sim.hourlyGridImport[currentHour] || 0;
    const gridExport = sim.hourlyGridExport[currentHour] || 0;
    const soc = sim.hourlyBatterySoC[currentHour] || 0;
    
    // Battery Delta for instant display
    const net = prod - load;
    const battPower = net - gridExport + gridImport; 
    
    const temp = climate.hourlyTemp[currentHour] || 0;
    const rad = climate.hourlyRad[currentHour] || 0;
    const hum = climate.hourlyHum[currentHour] || 0;

    // Date Info
    const dayOfYear = Math.floor(currentHour / 24);
    const hourOfDay = currentHour % 24;
    const date = new Date(2023, 0, dayOfYear + 1);
    const monthName = MONTH_NAMES[date.getMonth()];
    const dayNum = date.getDate();

    // Weather Icon
    const WeatherIcon = () => {
        if (rad > 200) return <Sun className="text-yellow-500 w-16 h-16 animate-pulse-slow" />;
        if (rad > 50) return <Cloud className="text-gray-400 w-16 h-16" />;
        if (hum > 80 && temp < 15) return <CloudRain className="text-blue-400 w-16 h-16" />;
        return <Moon className="text-slate-600 w-16 h-16" />;
    };

    // Flow Animation Helper
    const FlowLine = ({ from, to, active, reverse, color }: any) => {
        if (!active) return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#e2e8f0" strokeWidth="2" />;
        
        return (
            <g>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth="4" opacity="0.3" />
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth="4" strokeDasharray="10,10" className={reverse ? "animate-flow-reverse" : "animate-flow"} />
            </g>
        );
    };

    // Helper Component for Odometer/Counter
    const CounterBox = ({ label, value, colorClass }: any) => (
        <div className="bg-black/90 border-2 border-slate-600 rounded p-1 mt-1 shadow-inner min-w-[80px]">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider text-center mb-0.5">{label}</p>
            <p className={`text-sm font-mono font-bold text-center ${colorClass}`}>
                {Math.floor(value).toString().padStart(5, '0')} <span className="text-[9px]">kWh</span>
            </p>
        </div>
    );

    // Coordinates for nodes (0-100 scale relative to svg viewBox)
    // Adjusted for visual balance: PV (Top) -> Inverter (Middle) -> Home (Bottom)
    const pos = {
        pv: { x: 400, y: 60 },      // Top
        inv: { x: 400, y: 250 },    // Middle (Visually centered between 60 and 440)
        bat: { x: 120, y: 250 },    // Left Middle
        load: { x: 400, y: 440 },   // Bottom
        grid: { x: 680, y: 250 }    // Right Middle
    };

    return (
        <div className="space-y-6">
            <style>{`
                @keyframes flow {
                    from { stroke-dashoffset: 20; }
                    to { stroke-dashoffset: 0; }
                }
                @keyframes flow-reverse {
                    from { stroke-dashoffset: 0; }
                    to { stroke-dashoffset: 20; }
                }
                .animate-flow { animation: flow 0.5s linear infinite; }
                .animate-flow-reverse { animation: flow-reverse 0.5s linear infinite; }
                .animate-pulse-slow { animation: pulse 3s infinite; }
            `}</style>

            {/* Dashboard Header */}
            <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="bg-slate-800 p-2 rounded-lg">
                        <WeatherIcon />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">{dayNum} {monthName}</h2>
                        <p className="text-xl font-mono text-blue-400">{hourOfDay.toString().padStart(2, '0')}:00</p>
                    </div>
                    <div className="ml-8 text-sm text-slate-400 space-y-1">
                        <p>Temp: <span className="text-white font-bold">{temp.toFixed(1)}°C</span></p>
                        <p>Rad: <span className="text-white font-bold">{Math.round(rad)} W/m²</span></p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                     <button onClick={exportMonitoringData} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs font-bold flex items-center gap-2 shadow" title="Exportar CSV Completo">
                        <Download size={16}/> Exportar
                     </button>
                     <div className="h-8 w-[1px] bg-slate-700 mx-2"></div>
                     <div className="flex bg-slate-800 rounded-lg p-1">
                        <button onClick={() => changeSpeed(1)} className={`px-3 py-1 rounded text-xs font-bold ${speedMultiplier === 1 ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>1x</button>
                        <button onClick={() => changeSpeed(10)} className={`px-3 py-1 rounded text-xs font-bold ${speedMultiplier === 10 ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>10x</button>
                        <button onClick={() => changeSpeed(100)} className={`px-3 py-1 rounded text-xs font-bold ${speedMultiplier === 100 ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>100x</button>
                     </div>
                     <div className="h-8 w-[1px] bg-slate-700 mx-2"></div>
                     <button onClick={() => setCurrentHour(Math.max(0, currentHour - 1))} className="p-2 hover:bg-slate-800 rounded-full"><Rewind /></button>
                     <button 
                        onClick={() => setIsPlaying(!isPlaying)} 
                        className={`p-4 rounded-full shadow-lg transition-transform hover:scale-105 ${isPlaying ? 'bg-yellow-500 text-black' : 'bg-green-600 text-white'}`}
                     >
                        {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                     </button>
                     <button onClick={() => { setIsPlaying(false); setCurrentHour(0); }} className="p-2 hover:bg-slate-800 rounded-full"><Square fill="currentColor" size={16}/></button>
                     <button onClick={() => setCurrentHour(Math.min(8759, currentHour + 1))} className="p-2 hover:bg-slate-800 rounded-full"><FastForward /></button>
                </div>
            </div>
            
            {/* Timeline Slider */}
            <div className="bg-white p-4 rounded shadow border">
                <input 
                    type="range" 
                    min="0" max="8759" 
                    value={currentHour} 
                    onChange={(e) => setCurrentHour(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                    {MONTH_NAMES.map(m => <span key={m}>{m}</span>)}
                </div>
            </div>

            {/* Visualizer */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 relative h-[600px] overflow-hidden">
                <svg viewBox="0 0 800 600" className="w-full h-full absolute top-0 left-0 z-0">
                    {/* Wiring */}
                    {/* PV to Inv */}
                    <FlowLine from={pos.pv} to={pos.inv} active={prod > 0} color="#eab308" />
                    {/* Inv to Load */}
                    <FlowLine from={pos.inv} to={pos.load} active={load > 0} color="#3b82f6" />
                    {/* Inv to Bat */}
                    <FlowLine from={pos.inv} to={pos.bat} active={Math.abs(battPower) > 0.01} reverse={battPower < 0} color="#22c55e" />
                    {/* Inv to Grid */}
                    <FlowLine from={pos.inv} to={pos.grid} active={gridImport > 0 || gridExport > 0} reverse={gridImport > 0} color="#ef4444" />
                </svg>

                {/* Nodes (HTML Overlay) */}
                
                {/* PV Array (Top ~5%) */}
                <div className="absolute top-[5%] left-[50%] -translate-x-1/2 flex flex-col items-center">
                    <div className={`p-4 rounded-full shadow-xl border-4 ${prod > 0 ? 'bg-yellow-100 border-yellow-400' : 'bg-gray-100 border-gray-300'}`}>
                        <Sun size={40} className={prod > 0 ? "text-yellow-600" : "text-gray-400"} />
                    </div>
                    <div className="mt-2 text-center bg-white/90 p-2 rounded shadow backdrop-blur-sm z-10">
                        <p className="text-xl font-bold text-slate-800">{prod.toFixed(2)} kW</p>
                    </div>
                    <CounterBox label="Total Prod." value={totals.totProd} colorClass="text-yellow-400" />
                </div>

                {/* Inverter (Center ~42%) */}
                <div className="absolute top-[42%] left-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
                    <div className="w-32 h-20 bg-slate-800 rounded-lg shadow-2xl flex items-center justify-center border-b-4 border-slate-600">
                        <Zap className="text-yellow-400 animate-pulse" size={32} />
                        <span className="text-white font-bold ml-2">INV</span>
                    </div>
                </div>

                {/* Battery (Left ~42%) */}
                <div className="absolute top-[42%] left-[12%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                    <div className="relative w-20 h-32 border-4 border-slate-700 rounded-lg bg-gray-200 overflow-hidden shadow-xl">
                        {/* Fill Level */}
                        <div 
                            className={`absolute bottom-0 left-0 w-full transition-all duration-300 ${battPower > 0 ? 'bg-green-500' : 'bg-green-600'}`} 
                            style={{ height: `${soc}%` }}
                        ></div>
                        <div className="absolute inset-0 flex items-center justify-center text-white font-bold drop-shadow-md z-10">
                            {soc.toFixed(0)}%
                        </div>
                        {battPower > 0.01 && <BatteryCharging className="absolute top-1 right-1 text-white w-4 h-4 animate-bounce" />}
                    </div>
                    <div className="mt-2 text-center bg-white/90 p-2 rounded shadow backdrop-blur-sm">
                        <p className={`text-xl font-bold ${battPower > 0 ? 'text-green-600' : battPower < 0 ? 'text-red-500' : 'text-slate-600'}`}>
                            {battPower > 0 ? '+' : ''}{battPower.toFixed(2)} kW
                        </p>
                    </div>
                    <div className="flex gap-1">
                        <CounterBox label="Tot. Carga" value={totals.totBatChg} colorClass="text-green-400" />
                        <CounterBox label="Tot. Desc." value={totals.totBatDis} colorClass="text-red-400" />
                    </div>
                </div>

                {/* Grid (Right ~88%) */}
                <div className="absolute top-[42%] left-[88%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                    <div className={`p-4 rounded-full shadow-xl border-4 ${gridImport > 0 ? 'bg-red-100 border-red-400' : gridExport > 0 ? 'bg-green-100 border-green-400' : 'bg-gray-100 border-gray-300'}`}>
                        <UtilityPole size={40} className="text-slate-700" />
                    </div>
                    <div className="mt-2 text-center bg-white/90 p-2 rounded shadow backdrop-blur-sm">
                        {gridImport > 0 && <p className="text-xl font-bold text-red-600">Imp: {gridImport.toFixed(2)} kW</p>}
                        {gridExport > 0 && <p className="text-xl font-bold text-green-600">Exp: {gridExport.toFixed(2)} kW</p>}
                        {gridImport === 0 && gridExport === 0 && <p className="text-xl font-bold text-slate-400">0.00 kW</p>}
                    </div>
                    <div className="flex gap-1">
                        <CounterBox label="Tot. Imp." value={totals.totImp} colorClass="text-red-400" />
                        <CounterBox label="Tot. Exp." value={totals.totExp} colorClass="text-green-400" />
                    </div>
                </div>

                {/* Load / Home (Bottom ~73%) */}
                <div className="absolute top-[73%] left-[50%] -translate-x-1/2 flex flex-col items-center">
                    <div className="p-4 rounded-full shadow-xl border-4 bg-blue-100 border-blue-400">
                        <Home size={40} className="text-blue-600" />
                    </div>
                    <div className="mt-2 text-center bg-white/90 p-2 rounded shadow backdrop-blur-sm">
                        <p className="text-xl font-bold text-slate-800">{load.toFixed(2)} kW</p>
                    </div>
                    <CounterBox label="Tot. Consumo" value={totals.totLoad} colorClass="text-blue-300" />
                </div>

            </div>
        </div>
    );
};