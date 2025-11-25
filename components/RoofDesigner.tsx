import React, { useRef, useEffect, useState } from 'react';
import { RoofSegment, SolarPanel, Point } from '../types';
import { PANELS_DB } from '../constants';
import { Square, Hexagon, MousePointer2, Info } from 'lucide-react';

interface RoofDesignerProps {
  roofSegments: RoofSegment[];
  onChange: (segments: RoofSegment[]) => void;
  selectedPanelId: string;
  latitude?: number;
}

export const RoofDesigner: React.FC<RoofDesignerProps> = ({ roofSegments, onChange, selectedPanelId, latitude = 38.7 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string>("");
  const [drawMode, setDrawMode] = useState<'rect' | 'poly'>('rect');
  const [polyPoints, setPolyPoints] = useState<Point[]>([]); // Current polygon being drawn
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    mode: 'move' | 'resize' | 'draw' | null;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    drawingId?: string;
  } | null>(null);

  const SCALE_PX_PER_M = 20; // 1 meter = 20 pixels
  
  // Update active segment if roofSegments change and active is empty or invalid
  useEffect(() => {
     if ((!activeSegmentId || !roofSegments.find(s=>s.id === activeSegmentId)) && roofSegments.length > 0) {
         setActiveSegmentId(roofSegments[0].id);
     }
  }, [roofSegments, activeSegmentId]);

  const panel = PANELS_DB.find(p => p.id === selectedPanelId) || PANELS_DB[0];

  const updateSegment = (id: string, updates: Partial<RoofSegment>) => {
    const newSegments = roofSegments.map(s => {
        if (s.id !== id) return s;
        
        // Special handle for polygon move - need to shift all vertices
        if (s.isPolygon && s.vertices && updates.x !== undefined && updates.y !== undefined) {
             const deltaX = updates.x - (s.x || 0);
             const deltaY = updates.y - (s.y || 0);
             const newVertices = s.vertices.map(v => ({ x: v.x + deltaX, y: v.y + deltaY }));
             return { ...s, ...updates, vertices: newVertices };
        }
        return { ...s, ...updates };
    });
    onChange(newSegments);
  };

  const addSegment = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    onChange([...roofSegments, { 
        id: newId, 
        width: 10, height: 6, azimuth: 0, tilt: 30, panelsCount: 0,
        edgeMargin: 0.5, verticalSpacing: 0.05, horizontalSpacing: 0.02,
        x: 2, y: 2 // Default pos
    }]);
    setActiveSegmentId(newId);
  };

  const removeSegment = (id: string) => {
    onChange(roofSegments.filter(s => s.id !== id));
    if (activeSegmentId === id) setActiveSegmentId("");
  };

  // Helper: Point in Polygon
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

  // Helper: Snap to Grid (0.5m)
  const snapToGrid = (val: number) => {
      // 0.5 meter steps
      return Math.round(val * 2) / 2;
  };

  // Canvas Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw logic
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid (1m lines)
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i+= SCALE_PX_PER_M) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i+= SCALE_PX_PER_M) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Draw Segments
    roofSegments.forEach(segment => {
        const isActive = segment.id === activeSegmentId;
        const xPx = (segment.x || 0) * SCALE_PX_PER_M;
        const yPx = (segment.y || 0) * SCALE_PX_PER_M;
        
        ctx.fillStyle = isActive ? '#93c5fd' : '#cbd5e1';
        ctx.strokeStyle = isActive ? '#2563eb' : '#64748b';
        ctx.lineWidth = isActive ? 2 : 1;

        if (segment.isPolygon && segment.vertices && segment.vertices.length > 0) {
            // Draw Polygon
            ctx.beginPath();
            ctx.moveTo(segment.vertices[0].x * SCALE_PX_PER_M, segment.vertices[0].y * SCALE_PX_PER_M);
            for(let i=1; i<segment.vertices.length; i++) {
                ctx.lineTo(segment.vertices[i].x * SCALE_PX_PER_M, segment.vertices[i].y * SCALE_PX_PER_M);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw Panels (Polygon)
            const pW = panel.widthMm / 1000;
            const pH = panel.heightMm / 1000;
            const hSpace = segment.horizontalSpacing || 0.02;
            const vSpace = segment.verticalSpacing || 0.05;
            const edge = segment.edgeMargin || 0;
            
            // Calc Bounding Box of Polygon
            const xs = segment.vertices.map(v => v.x);
            const ys = segment.vertices.map(v => v.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            const startX = minX + edge;
            const startY = minY + edge;

            ctx.fillStyle = '#1e40af';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;

            let drawn = 0;
            for (let y = startY; y < maxY - edge; y += pH + vSpace) {
                for (let x = startX; x < maxX - edge; x += pW + hSpace) {
                    // Check logic
                    if (drawn < segment.panelsCount) {
                         const cx = x + pW / 2;
                         const cy = y + pH / 2;
                         if (isPointInPoly({x: cx, y: cy}, segment.vertices)) {
                             const px = x * SCALE_PX_PER_M;
                             const py = y * SCALE_PX_PER_M;
                             ctx.fillRect(px, py, pW * SCALE_PX_PER_M, pH * SCALE_PX_PER_M);
                             ctx.strokeRect(px, py, pW * SCALE_PX_PER_M, pH * SCALE_PX_PER_M);
                             drawn++;
                         }
                    }
                }
            }

        } else {
            // Draw Rectangle
            const wPx = segment.width * SCALE_PX_PER_M;
            const hPx = segment.height * SCALE_PX_PER_M;
            
            ctx.fillRect(xPx, yPx, wPx, hPx);
            ctx.strokeRect(xPx, yPx, wPx, hPx);

            // Draw Panels (Rectangle)
            const pW = panel.widthMm / 1000;
            const pH = panel.heightMm / 1000;
            const hSpace = segment.horizontalSpacing || 0.02;
            const vSpace = segment.verticalSpacing || 0.05;
            const edge = segment.edgeMargin || 0;
            const usableW = Math.max(0, segment.width - (2 * edge));
            const usableH = Math.max(0, segment.height - (2 * edge));
            
            if (usableW > pW && usableH > pH) {
                const cols = Math.floor((usableW + hSpace) / (pW + hSpace));
                const rows = Math.floor((usableH + vSpace) / (pH + vSpace));
                
                const groupW = cols * pW + (cols - 1) * hSpace;
                const groupH = rows * pH + (rows - 1) * vSpace;
        
                const groupStartX = xPx + (edge * SCALE_PX_PER_M) + ((usableW * SCALE_PX_PER_M - groupW * SCALE_PX_PER_M) / 2);
                const groupStartY = yPx + (edge * SCALE_PX_PER_M) + ((usableH * SCALE_PX_PER_M - groupH * SCALE_PX_PER_M) / 2);
        
                ctx.fillStyle = '#1e40af';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;

                let drawn = 0;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (drawn < segment.panelsCount) {
                            const px = groupStartX + (c * (pW + hSpace) * SCALE_PX_PER_M);
                            const py = groupStartY + (r * (pH + vSpace) * SCALE_PX_PER_M);
                            ctx.fillRect(px, py, pW * SCALE_PX_PER_M, pH * SCALE_PX_PER_M);
                            ctx.strokeRect(px, py, pW * SCALE_PX_PER_M, pH * SCALE_PX_PER_M);
                            drawn++;
                        }
                    }
                }
            }

            // Draw Resize Handle (bottom right) - Only for Rectangles
            if (isActive) {
                ctx.fillStyle = '#2563eb';
                ctx.fillRect(xPx + wPx - 10, yPx + hPx - 10, 10, 10);
            }
        }
        
        // Label
        if (isActive) {
            ctx.fillStyle = '#1e293b';
            ctx.font = '12px sans-serif';
            ctx.fillText(`ID: ${segment.id}`, (segment.x || 0)*SCALE_PX_PER_M + 5, (segment.y || 0)*SCALE_PX_PER_M - 5);
        }
    });

    // Draw Polygon in Progress
    if (polyPoints.length > 0) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(polyPoints[0].x * SCALE_PX_PER_M, polyPoints[0].y * SCALE_PX_PER_M);
        for(let i=1; i<polyPoints.length; i++) {
             ctx.lineTo(polyPoints[i].x * SCALE_PX_PER_M, polyPoints[i].y * SCALE_PX_PER_M);
        }
        // Close for visual loop
        // ctx.lineTo(polyPoints[0].x * SCALE_PX_PER_M, polyPoints[0].y * SCALE_PX_PER_M);
        ctx.stroke();
        
        // Draw circles at vertices
        ctx.fillStyle = '#ef4444';
        polyPoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x * SCALE_PX_PER_M, p.y * SCALE_PX_PER_M, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

  }, [roofSegments, activeSegmentId, panel, polyPoints]);

  // Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const mouseXM = mouseX / SCALE_PX_PER_M;
      const mouseYM = mouseY / SCALE_PX_PER_M;
      const snappedX = snapToGrid(mouseXM);
      const snappedY = snapToGrid(mouseYM);

      // --- POLYGON DRAWING MODE ---
      if (drawMode === 'poly') {
          // If close to first point, close poly
          if (polyPoints.length > 2) {
             const start = polyPoints[0];
             const dist = Math.sqrt(Math.pow(snappedX - start.x, 2) + Math.pow(snappedY - start.y, 2));
             if (dist < 0.2) { // very close snap to close
                 completePolygon();
                 return;
             }
          }
          setPolyPoints([...polyPoints, { x: snappedX, y: snappedY }]);
          return;
      }

      // --- RECTANGLE / EDIT MODE ---

      // 1. Check for resize handle on Active Segment (Rect Only)
      const activeSeg = roofSegments.find(s => s.id === activeSegmentId);
      if (activeSeg && !activeSeg.isPolygon) {
          const xPx = (activeSeg.x || 0) * SCALE_PX_PER_M;
          const yPx = (activeSeg.y || 0) * SCALE_PX_PER_M;
          const wPx = activeSeg.width * SCALE_PX_PER_M;
          const hPx = activeSeg.height * SCALE_PX_PER_M;

          if (mouseX >= xPx + wPx - 15 && mouseX <= xPx + wPx + 5 &&
              mouseY >= yPx + hPx - 15 && mouseY <= yPx + hPx + 5) {
                setDragState({
                    isDragging: true,
                    mode: 'resize',
                    startX: mouseX, startY: mouseY,
                    initialX: activeSeg.x || 0, initialY: activeSeg.y || 0,
                    initialW: activeSeg.width, initialH: activeSeg.height
                });
                return;
          }
      }

      // 2. Check for move hit on any segment
      // Use bounding box logic for both rect and poly for simplicity of selection
      for (let i = roofSegments.length - 1; i >= 0; i--) {
          const seg = roofSegments[i];
          const xPx = (seg.x || 0) * SCALE_PX_PER_M;
          const yPx = (seg.y || 0) * SCALE_PX_PER_M;
          const wPx = seg.width * SCALE_PX_PER_M;
          const hPx = seg.height * SCALE_PX_PER_M;

          if (mouseX >= xPx && mouseX <= xPx + wPx && mouseY >= yPx && mouseY <= yPx + hPx) {
              setActiveSegmentId(seg.id);
              setDragState({
                  isDragging: true,
                  mode: 'move',
                  startX: mouseX, startY: mouseY,
                  initialX: seg.x || 0, initialY: seg.y || 0,
                  initialW: seg.width, initialH: seg.height
              });
              return;
          }
      }

      // 3. Clicked on Empty Space -> Draw New Rectangle
      const startXMeter = snappedX;
      const startYMeter = snappedY;
      const newId = Math.random().toString(36).substr(2, 9);
      
      const newSeg: RoofSegment = {
        id: newId,
        width: 0, height: 0, azimuth: 0, tilt: 30, panelsCount: 0,
        edgeMargin: 0.5, verticalSpacing: 0.05, horizontalSpacing: 0.02,
        x: startXMeter, y: startYMeter
      };

      onChange([...roofSegments, newSeg]);
      setActiveSegmentId(newId);
      setDragState({
          isDragging: true,
          mode: 'draw',
          startX: mouseX, startY: mouseY,
          initialX: startXMeter, initialY: startYMeter,
          initialW: 0, initialH: 0,
          drawingId: newId
      });
  };

  const completePolygon = () => {
      if (polyPoints.length < 3) return;
      
      const newId = Math.random().toString(36).substr(2, 9);
      // Calculate Bounding Box
      const xs = polyPoints.map(p => p.x);
      const ys = polyPoints.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const newSeg: RoofSegment = {
        id: newId,
        width: maxX - minX,
        height: maxY - minY,
        x: minX,
        y: minY,
        azimuth: 0, tilt: 30, panelsCount: 0,
        edgeMargin: 0.5, verticalSpacing: 0.05, horizontalSpacing: 0.02,
        isPolygon: true,
        vertices: polyPoints // Keep original vertices relative to canvas origin
      };

      onChange([...roofSegments, newSeg]);
      setActiveSegmentId(newId);
      setPolyPoints([]);
      setDrawMode('rect'); // Switch back to select/rect mode?
  };

  const handleDoubleClick = () => {
      if (drawMode === 'poly') {
          completePolygon();
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!dragState || !dragState.isDragging) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const deltaX = (mouseX - dragState.startX) / SCALE_PX_PER_M;
      const deltaY = (mouseY - dragState.startY) / SCALE_PX_PER_M;

      if (dragState.mode === 'move' && activeSegmentId) {
          updateSegment(activeSegmentId, {
              x: dragState.initialX + deltaX,
              y: dragState.initialY + deltaY
          });
      } else if (dragState.mode === 'resize' && activeSegmentId) {
          updateSegment(activeSegmentId, {
              width: Math.max(1, dragState.initialW + deltaX),
              height: Math.max(1, dragState.initialH + deltaY)
          });
      } else if (dragState.mode === 'draw' && dragState.drawingId) {
          // Calculate new dimensions allowing for negative drag (drawing upwards/leftwards)
          // Snap dragging for rectangles too if desired, or keep fluid
          const currentXMeter = mouseX / SCALE_PX_PER_M;
          const currentYMeter = mouseY / SCALE_PX_PER_M;
          
          const newX = Math.min(dragState.initialX, currentXMeter);
          const newY = Math.min(dragState.initialY, currentYMeter);
          const newW = Math.abs(currentXMeter - dragState.initialX);
          const newH = Math.abs(currentYMeter - dragState.initialY);

          updateSegment(dragState.drawingId, {
              x: newX,
              y: newY,
              width: newW,
              height: newH
          });
      }
  };

  const handleMouseUp = () => {
      // If we were drawing and the size is too small, remove it (accidental click)
      if (dragState?.mode === 'draw' && dragState.drawingId) {
          const seg = roofSegments.find(s => s.id === dragState.drawingId);
          if (seg && (seg.width < 0.5 || seg.height < 0.5)) {
              removeSegment(dragState.drawingId);
          }
      }
      setDragState(null);
  };

  const activeSegment = roofSegments.find(s => s.id === activeSegmentId);
  
  const getMaxPanels = (seg: RoofSegment) => {
      const pW = panel.widthMm / 1000;
      const pH = panel.heightMm / 1000;
      const hSpace = seg.horizontalSpacing || 0.02;
      const vSpace = seg.verticalSpacing || 0.05;
      const edge = seg.edgeMargin || 0;

      if (seg.isPolygon && seg.vertices) {
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

  const totalPanels = roofSegments.reduce((a,b) => a + b.panelsCount, 0);
  const installedKw = (totalPanels * panel.powerW) / 1000;
  const yieldFactor = 1450; 
  const estProduction = installedKw * yieldFactor;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded border border-blue-200">
          <div>
              <p className="text-xs text-gray-500 uppercase font-bold">Potência Instalada</p>
              <p className="text-2xl font-bold text-blue-800">{installedKw.toFixed(2)} kWp</p>
          </div>
          <div>
              <p className="text-xs text-gray-500 uppercase font-bold">Prod. Anual Estimada ({latitude.toFixed(1)}° Lat)</p>
              <p className="text-2xl font-bold text-green-700">~{Math.round(estProduction).toLocaleString()} kWh</p>
          </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/3 space-y-4 h-[600px] overflow-y-auto pr-2">
            
            {/* TOOLBAR */}
            <div className="flex gap-2 mb-2">
                <button 
                    onClick={() => { setDrawMode('rect'); setPolyPoints([]); }}
                    className={`flex-1 py-2 rounded flex justify-center items-center gap-2 ${drawMode === 'rect' ? 'bg-blue-600 text-white shadow' : 'bg-white border text-gray-600'}`}
                >
                    <Square size={16} /> Retângulo
                </button>
                <button 
                    onClick={() => { setDrawMode('poly'); setPolyPoints([]); }}
                    className={`flex-1 py-2 rounded flex justify-center items-center gap-2 ${drawMode === 'poly' ? 'bg-blue-600 text-white shadow' : 'bg-white border text-gray-600'}`}
                >
                    <Hexagon size={16} /> Polígono
                </button>
            </div>
            {drawMode === 'poly' && (
                <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded border border-yellow-200 flex gap-2 items-start">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <p>Clique no mapa para adicionar pontos (Snap 0.5m). Duplo-clique para fechar a forma.</p>
                </div>
            )}

            <div className="bg-slate-100 p-4 rounded shadow-inner">
            <h4 className="font-bold mb-2">Superfícies</h4>
            {roofSegments.map(s => (
                <div 
                key={s.id} 
                onClick={() => setActiveSegmentId(s.id)}
                className={`p-2 mb-2 rounded cursor-pointer flex justify-between items-center ${activeSegmentId === s.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}
                >
                <div className="flex items-center gap-2">
                    {s.isPolygon ? <Hexagon size={14}/> : <Square size={14}/>}
                    <span>{s.isPolygon ? 'Poly' : 'Rect'} {s.id.substr(0,4)} ({s.panelsCount} pn)</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeSegment(s.id); }} className="text-red-400 hover:text-red-200">X</button>
                </div>
            ))}
            </div>

            {activeSegment && (
            <div className="bg-white p-4 rounded border border-gray-200 space-y-4">
                <h4 className="font-bold border-b pb-2 text-blue-900">1. Dimensões</h4>
                
                {!activeSegment.isPolygon ? (
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                        <label className="block text-xs font-bold text-gray-500">Largura (m)</label>
                        <input type="number" step="0.1" value={activeSegment.width.toFixed(1)} 
                            onChange={(e) => updateSegment(activeSegment.id, { width: parseFloat(e.target.value) })}
                            className="w-full border rounded p-1" />
                        </div>
                        <div>
                        <label className="block text-xs font-bold text-gray-500">Comprimento (m)</label>
                        <input type="number" step="0.1" value={activeSegment.height.toFixed(1)} 
                            onChange={(e) => updateSegment(activeSegment.id, { height: parseFloat(e.target.value) })}
                            className="w-full border rounded p-1" />
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500 italic">Dimensões definidas pelos vértices desenhados.</p>
                )}

                <div className="grid grid-cols-2 gap-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                    <div>
                        <label className="block text-xs font-bold text-blue-800">Inclinação (°)</label>
                        <input type="number" min="0" max="90" value={activeSegment.tilt} 
                            onChange={(e) => updateSegment(activeSegment.id, { tilt: parseFloat(e.target.value) })}
                            className="w-full border border-blue-300 rounded p-1 font-bold" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-blue-800">Azimute (°)</label>
                        <input type="number" min="-180" max="180" value={activeSegment.azimuth} 
                            onChange={(e) => updateSegment(activeSegment.id, { azimuth: parseFloat(e.target.value) })}
                            className="w-full border border-blue-300 rounded p-1 font-bold" />
                        <span className="text-[10px] text-gray-500">0=Sul, -90=Este</span>
                    </div>
                </div>

                <h4 className="font-bold border-b pb-2 text-blue-900 pt-2">2. Layout & Margens</h4>
                <div>
                    <label className="block text-xs font-bold text-gray-500">Distância Bordas (m)</label>
                    <input type="number" step="0.1" value={activeSegment.edgeMargin || 0} 
                    onChange={(e) => updateSegment(activeSegment.id, { edgeMargin: parseFloat(e.target.value) })}
                    className="w-full border rounded p-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                    <label className="block text-xs font-bold text-gray-500">Espaço Horiz. (m)</label>
                    <input type="number" step="0.01" value={activeSegment.horizontalSpacing || 0.02} 
                        onChange={(e) => updateSegment(activeSegment.id, { horizontalSpacing: parseFloat(e.target.value) })}
                        className="w-full border rounded p-1" />
                    </div>
                    <div>
                    <label className="block text-xs font-bold text-gray-500">Espaço Vert. (m)</label>
                    <input type="number" step="0.01" value={activeSegment.verticalSpacing || 0.05} 
                        onChange={(e) => updateSegment(activeSegment.id, { verticalSpacing: parseFloat(e.target.value) })}
                        className="w-full border rounded p-1" />
                    </div>
                </div>

                <h4 className="font-bold border-b pb-2 text-blue-900 pt-2">3. Preenchimento</h4>
                <div>
                <label className="block text-xs font-bold text-gray-500">Nº de Painéis</label>
                <div className="flex gap-2 items-center">
                    <input type="number" value={activeSegment.panelsCount} 
                        onChange={(e) => updateSegment(activeSegment.id, { panelsCount: parseInt(e.target.value) })}
                        className="w-full border rounded p-1 font-bold text-lg text-blue-700" />
                    <button 
                        onClick={() => updateSegment(activeSegment.id, { panelsCount: getMaxPanels(activeSegment) })}
                        className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300">Auto (Max)</button>
                </div>
                <p className="text-xs text-green-600 mt-1">Máximo Teórico: {getMaxPanels(activeSegment)}</p>
                </div>
            </div>
            )}
        </div>

        <div className="w-full md:w-2/3 bg-slate-800 rounded shadow border border-gray-600 relative overflow-hidden flex flex-col">
            <div className="absolute top-4 right-4 bg-white/90 p-2 rounded text-xs z-10 pointer-events-none shadow">
                <div className="font-bold mb-1">Modo: {drawMode === 'rect' ? 'Retângulo' : 'Polígono'}</div>
                {drawMode === 'rect' && <div>✏️ Clique e arraste para desenhar</div>}
                {drawMode === 'poly' && <div>✏️ Clique (Snap 0.5m) | Duplo-clique fecha</div>}
                <div>🖱️ Clique para selecionar</div>
                <div>✋ Arraste para mover</div>
            </div>
            <canvas 
                ref={canvasRef} 
                width={800} 
                height={600} 
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                className={`w-full h-full object-contain bg-slate-200 ${drawMode === 'poly' ? 'cursor-crosshair' : 'cursor-default'}`} 
            />
            <div className="bg-slate-900 text-white text-xs p-1 text-center">
                Área de Trabalho: 40m x 30m (Grelha 1m)
            </div>
        </div>
      </div>
    </div>
  );
};