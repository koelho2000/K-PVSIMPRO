
import React, { useRef, useEffect, useState } from 'react';
import { RoofSegment, SolarPanel, Point } from '../types';
import { PANELS_DB } from '../constants';
import { calculateRecommendedSpacing } from '../services/solarService';
import { Square, Hexagon, MousePointer2, Info, ZoomIn, ZoomOut, Move, RotateCcw, Sun, AlertTriangle } from 'lucide-react';

interface RoofDesignerProps {
  roofSegments: RoofSegment[];
  onChange: (segments: RoofSegment[]) => void;
  selectedPanelId: string;
  latitude?: number;
}

export const RoofDesigner: React.FC<RoofDesignerProps> = ({ roofSegments, onChange, selectedPanelId, latitude = 38.7 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string>("");
  
  // Tools: Select, Pan, DrawRect, DrawPoly
  const [toolMode, setToolMode] = useState<'select' | 'pan' | 'rect' | 'poly'>('select');
  const [polyPoints, setPolyPoints] = useState<Point[]>([]); 
  
  // Viewport State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    mode: 'move_view' | 'move_seg' | 'resize_seg' | 'draw' | null;
    startX: number;
    startY: number;
    initialPanX?: number;
    initialPanY?: number;
    initialSegX?: number;
    initialSegY?: number;
    initialSegW?: number;
    initialSegH?: number;
    drawingId?: string;
  } | null>(null);

  const BASE_SCALE = 20; // 1 meter = 20 pixels at zoom 1
  
  // Update active segment if needed
  useEffect(() => {
     if ((!activeSegmentId || !roofSegments.find(s=>s.id === activeSegmentId)) && roofSegments.length > 0) {
         setActiveSegmentId(roofSegments[0].id);
     }
  }, [roofSegments, activeSegmentId]);

  const panel = PANELS_DB.find(p => p.id === selectedPanelId) || PANELS_DB[0];

  const updateSegment = (id: string, updates: Partial<RoofSegment>) => {
    const newSegments = roofSegments.map(s => {
        if (s.id !== id) return s;
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

  const removeSegment = (id: string) => {
    onChange(roofSegments.filter(s => s.id !== id));
    if (activeSegmentId === id) setActiveSegmentId("");
  };

  // Helper: Coordinate Transform
  const screenToWorld = (sx: number, sy: number) => {
      return {
          x: (sx - pan.x) / (BASE_SCALE * zoom),
          y: (sy - pan.y) / (BASE_SCALE * zoom)
      };
  };

  // Helper: Snap to Grid (Strict 0.5m vertices)
  const snapToGrid = (val: number) => {
      // 0.5 meter steps
      return Math.round(val * 2) / 2;
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

  // Canvas Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset transform to clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply View Transform
    ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y);

    // Draw Grid (World Space)
    // Draw a large enough grid to cover view. 
    // Optimization: Calculate visible bounds in world space
    const startX = -pan.x / (BASE_SCALE * zoom);
    const startY = -pan.y / (BASE_SCALE * zoom);
    const endX = (canvas.width - pan.x) / (BASE_SCALE * zoom);
    const endY = (canvas.height - pan.y) / (BASE_SCALE * zoom);

    const GRID_STEP = 0.5; // 0.5m grid
    
    ctx.lineWidth = 1 / zoom; // Maintain thin line despite zoom

    const iStart = Math.floor(startX / GRID_STEP) * GRID_STEP;
    const jStart = Math.floor(startY / GRID_STEP) * GRID_STEP;

    for (let i = iStart; i <= endX; i += GRID_STEP) {
        const x = i * BASE_SCALE;
        // Major line every 1m
        const isMajor = Math.abs(i % 1) < 0.01;
        ctx.strokeStyle = isMajor ? '#94a3b8' : '#e2e8f0'; 
        ctx.beginPath(); 
        ctx.moveTo(x, startY * BASE_SCALE); 
        ctx.lineTo(x, endY * BASE_SCALE); 
        ctx.stroke();
    }
    for (let j = jStart; j <= endY; j += GRID_STEP) {
        const y = j * BASE_SCALE;
        const isMajor = Math.abs(j % 1) < 0.01;
        ctx.strokeStyle = isMajor ? '#94a3b8' : '#e2e8f0';
        ctx.beginPath(); 
        ctx.moveTo(startX * BASE_SCALE, y); 
        ctx.lineTo(endX * BASE_SCALE, y); 
        ctx.stroke();
    }

    // Origin Marker
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();


    // Draw Segments
    roofSegments.forEach(segment => {
        const isActive = segment.id === activeSegmentId;
        const xPx = (segment.x || 0) * BASE_SCALE;
        const yPx = (segment.y || 0) * BASE_SCALE;
        
        ctx.fillStyle = isActive ? '#93c5fd' : '#cbd5e1';
        ctx.strokeStyle = isActive ? '#2563eb' : '#64748b';
        ctx.lineWidth = isActive ? (2/zoom) : (1/zoom);

        if (segment.isPolygon && segment.vertices && segment.vertices.length > 0) {
            ctx.beginPath();
            ctx.moveTo(segment.vertices[0].x * BASE_SCALE, segment.vertices[0].y * BASE_SCALE);
            for(let i=1; i<segment.vertices.length; i++) {
                ctx.lineTo(segment.vertices[i].x * BASE_SCALE, segment.vertices[i].y * BASE_SCALE);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw Panels logic (same as before but scaled)
            drawPanels(ctx, segment, isActive);

        } else {
            const wPx = segment.width * BASE_SCALE;
            const hPx = segment.height * BASE_SCALE;
            
            ctx.fillRect(xPx, yPx, wPx, hPx);
            ctx.strokeRect(xPx, yPx, wPx, hPx);

            drawPanels(ctx, segment, isActive);

            // Resize Handle
            if (isActive && toolMode === 'select') {
                ctx.fillStyle = '#2563eb';
                const handleSize = 8 / zoom;
                ctx.fillRect(xPx + wPx - handleSize, yPx + hPx - handleSize, handleSize, handleSize);
            }
        }
        
        if (isActive) {
            ctx.fillStyle = '#1e293b';
            ctx.font = `${12/zoom}px sans-serif`;
            ctx.fillText(`ID: ${segment.id}`, (segment.x || 0)*BASE_SCALE, (segment.y || 0)*BASE_SCALE - (5/zoom));
        }
    });

    // Draw Drawing Progress
    if (toolMode === 'poly' && polyPoints.length > 0) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(polyPoints[0].x * BASE_SCALE, polyPoints[0].y * BASE_SCALE);
        for(let i=1; i<polyPoints.length; i++) {
             ctx.lineTo(polyPoints[i].x * BASE_SCALE, polyPoints[i].y * BASE_SCALE);
        }
        ctx.stroke();
        
        ctx.fillStyle = '#ef4444';
        polyPoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x * BASE_SCALE, p.y * BASE_SCALE, 3/zoom, 0, Math.PI * 2);
            ctx.fill();
        });
    }

  }, [roofSegments, activeSegmentId, panel, polyPoints, zoom, pan, toolMode]);

  const drawPanels = (ctx: CanvasRenderingContext2D, segment: RoofSegment, isActive: boolean) => {
      const pW = panel.widthMm / 1000;
      const pH = panel.heightMm / 1000;
      const hSpace = segment.horizontalSpacing || 0.02;
      const vSpace = segment.verticalSpacing || 0.05;
      const edge = segment.edgeMargin || 0;
      
      // Setup styles
      ctx.fillStyle = '#1e40af';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 / zoom;

      if (segment.isPolygon && segment.vertices) {
            const xs = segment.vertices.map(v => v.x);
            const ys = segment.vertices.map(v => v.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            const startX = minX + edge;
            const startY = minY + edge;

            let drawn = 0;
            for (let y = startY; y <= maxY - edge - pH; y += pH + vSpace) {
                for (let x = startX; x <= maxX - edge - pW; x += pW + hSpace) {
                    if (drawn < segment.panelsCount) {
                        const corners = [
                            {x: x, y: y}, {x: x + pW, y: y}, {x: x, y: y + pH}, {x: x + pW, y: y + pH}
                        ];
                        if (corners.every(p => isPointInPoly(p, segment.vertices!))) {
                             ctx.fillRect(x * BASE_SCALE, y * BASE_SCALE, pW * BASE_SCALE, pH * BASE_SCALE);
                             ctx.strokeRect(x * BASE_SCALE, y * BASE_SCALE, pW * BASE_SCALE, pH * BASE_SCALE);
                             drawn++;
                        }
                    }
                }
            }
      } else {
            const xPx = (segment.x || 0) * BASE_SCALE;
            const yPx = (segment.y || 0) * BASE_SCALE;
            const usableW = Math.max(0, segment.width - (2 * edge));
            const usableH = Math.max(0, segment.height - (2 * edge));
            
            if (usableW >= pW && usableH >= pH) {
                const cols = Math.floor((usableW + hSpace) / (pW + hSpace));
                const rows = Math.floor((usableH + vSpace) / (pH + vSpace));
                
                const groupW = cols * pW + (cols - 1) * hSpace;
                const groupH = rows * pH + (rows - 1) * vSpace;
        
                const groupStartX = xPx + (edge * BASE_SCALE) + ((usableW * BASE_SCALE - groupW * BASE_SCALE) / 2);
                const groupStartY = yPx + (edge * BASE_SCALE) + ((usableH * BASE_SCALE - groupH * BASE_SCALE) / 2);
        
                let drawn = 0;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (drawn < segment.panelsCount) {
                            const px = groupStartX + (c * (pW + hSpace) * BASE_SCALE);
                            const py = groupStartY + (r * (pH + vSpace) * BASE_SCALE);
                            ctx.fillRect(px, py, pW * BASE_SCALE, pH * BASE_SCALE);
                            ctx.strokeRect(px, py, pW * BASE_SCALE, pH * BASE_SCALE);
                            drawn++;
                        }
                    }
                }
            }
      }
  };

  // --- MOUSE HANDLERS ---
  
  const handleMouseDown = (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      // Pan Tool or Middle Mouse
      if (toolMode === 'pan' || e.button === 1) {
          setDragState({
              isDragging: true,
              mode: 'move_view',
              startX: rawX, startY: rawY,
              initialPanX: pan.x, initialPanY: pan.y
          });
          return;
      }

      const worldPos = screenToWorld(rawX, rawY);
      const snappedX = snapToGrid(worldPos.x);
      const snappedY = snapToGrid(worldPos.y);

      // Polygon Drawing
      if (toolMode === 'poly') {
          if (polyPoints.length > 2) {
             const start = polyPoints[0];
             const dist = Math.sqrt(Math.pow(snappedX - start.x, 2) + Math.pow(snappedY - start.y, 2));
             if (dist < 0.2) { 
                 completePolygon();
                 return;
             }
          }
          setPolyPoints([...polyPoints, { x: snappedX, y: snappedY }]);
          return;
      }

      // Rect Drawing
      if (toolMode === 'rect') {
          const newId = Math.random().toString(36).substr(2, 9);
          const newSeg: RoofSegment = {
            id: newId,
            width: 0, height: 0, azimuth: 0, tilt: 30, panelsCount: 0,
            edgeMargin: 0.5, verticalSpacing: 0.05, horizontalSpacing: 0.02,
            x: snappedX, y: snappedY
          };
          onChange([...roofSegments, newSeg]);
          setActiveSegmentId(newId);
          setDragState({
              isDragging: true,
              mode: 'draw',
              startX: worldPos.x, startY: worldPos.y, // Logic uses world coords diff
              initialSegX: snappedX, initialSegY: snappedY,
              drawingId: newId
          });
          return;
      }

      // Select / Edit Mode
      if (toolMode === 'select') {
          // Check resize handle (Rect only)
          const activeSeg = roofSegments.find(s => s.id === activeSegmentId);
          if (activeSeg && !activeSeg.isPolygon) {
             const segX = activeSeg.x || 0;
             const segY = activeSeg.y || 0;
             const segW = activeSeg.width;
             const segH = activeSeg.height;
             
             // Check if click is near bottom right corner in world space
             // Tolerance 0.5m
             if (worldPos.x >= segX + segW - 0.5 && worldPos.x <= segX + segW + 0.5 &&
                 worldPos.y >= segY + segH - 0.5 && worldPos.y <= segY + segH + 0.5) {
                    setDragState({
                        isDragging: true,
                        mode: 'resize_seg',
                        startX: worldPos.x, startY: worldPos.y,
                        initialSegW: segW, initialSegH: segH
                    });
                    return;
             }
          }

          // Check hit on segment body
          for (let i = roofSegments.length - 1; i >= 0; i--) {
              const seg = roofSegments[i];
              const segX = seg.x || 0;
              const segY = seg.y || 0;
              
              // Simple bounding box hit test
              // (For poly, this is an approximation, but works for selection)
              let hit = false;
              if (seg.isPolygon && seg.vertices) {
                   const xs = seg.vertices.map(v => v.x);
                   const ys = seg.vertices.map(v => v.y);
                   if (worldPos.x >= Math.min(...xs) && worldPos.x <= Math.max(...xs) &&
                       worldPos.y >= Math.min(...ys) && worldPos.y <= Math.max(...ys)) {
                       hit = true;
                   }
              } else {
                  if (worldPos.x >= segX && worldPos.x <= segX + seg.width &&
                      worldPos.y >= segY && worldPos.y <= segY + seg.height) {
                      hit = true;
                  }
              }

              if (hit) {
                  setActiveSegmentId(seg.id);
                  setDragState({
                      isDragging: true,
                      mode: 'move_seg',
                      startX: worldPos.x, startY: worldPos.y,
                      initialSegX: segX, initialSegY: segY
                  });
                  return;
              }
          }
          
          // Clicked empty space
          setActiveSegmentId("");
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!dragState || !dragState.isDragging) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      if (dragState.mode === 'move_view') {
          const dx = rawX - dragState.startX;
          const dy = rawY - dragState.startY;
          setPan({
              x: (dragState.initialPanX || 0) + dx,
              y: (dragState.initialPanY || 0) + dy
          });
          return;
      }

      // World Logic
      const worldPos = screenToWorld(rawX, rawY);
      const snappedX = snapToGrid(worldPos.x);
      const snappedY = snapToGrid(worldPos.y);
      
      const deltaX = worldPos.x - dragState.startX; // Float diff
      const deltaY = worldPos.y - dragState.startY;

      if (dragState.mode === 'move_seg' && activeSegmentId) {
          // For movement, we typically want snapped movement
          // Calc new theoretical pos
          const newX = (dragState.initialSegX || 0) + deltaX;
          const newY = (dragState.initialSegY || 0) + deltaY;
          updateSegment(activeSegmentId, {
              x: snapToGrid(newX),
              y: snapToGrid(newY)
          });
      }
      else if (dragState.mode === 'resize_seg' && activeSegmentId) {
          const newW = Math.max(0.5, (dragState.initialSegW || 0) + deltaX);
          const newH = Math.max(0.5, (dragState.initialSegH || 0) + deltaY);
          updateSegment(activeSegmentId, {
              width: snapToGrid(newW),
              height: snapToGrid(newH)
          });
      }
      else if (dragState.mode === 'draw' && dragState.drawingId) {
          const currentX = snappedX;
          const currentY = snappedY;
          
          const startX = dragState.initialSegX || 0;
          const startY = dragState.initialSegY || 0;
          
          const x = Math.min(startX, currentX);
          const y = Math.min(startY, currentY);
          const w = Math.abs(currentX - startX);
          const h = Math.abs(currentY - startY);

          updateSegment(dragState.drawingId, { x, y, width: w, height: h });
      }
  };

  const handleMouseUp = () => {
      if (dragState?.mode === 'draw' && dragState.drawingId) {
          const seg = roofSegments.find(s => s.id === dragState.drawingId);
          if (seg && (seg.width < 0.5 || seg.height < 0.5)) {
              removeSegment(dragState.drawingId);
          } else {
              setToolMode('select'); // Auto switch back to select after draw?
          }
      }
      setDragState(null);
  };

  const completePolygon = () => {
      if (polyPoints.length < 3) return;
      
      const newId = Math.random().toString(36).substr(2, 9);
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
        vertices: polyPoints
      };

      onChange([...roofSegments, newSeg]);
      setActiveSegmentId(newId);
      setPolyPoints([]);
      setToolMode('select');
  };

  // --- Calculations ---
  const activeSegment = roofSegments.find(s => s.id === activeSegmentId);
  const totalPanels = roofSegments.reduce((a,b) => a + b.panelsCount, 0);
  const installedKw = (totalPanels * panel.powerW) / 1000;
  const yieldFactor = 1450; 
  const estProduction = installedKw * yieldFactor;

  // Shading Logic
  const suggestedSpacing = activeSegment ? calculateRecommendedSpacing(latitude, activeSegment.tilt, activeSegment.azimuth, panel.heightMm) : 0;
  const applySpacing = () => {
      if (activeSegment) {
          updateSegment(activeSegment.id, { 
              verticalSpacing: suggestedSpacing,
              horizontalSpacing: activeSegment.horizontalSpacing || 0.02
          });
      }
  };

  const getMaxPanels = (seg: RoofSegment) => {
      // (Keep existing logic or import from helper if refactored)
      // Re-implementing strictly for containment
      const pW = panel.widthMm / 1000;
      const pH = panel.heightMm / 1000;
      const hSpace = seg.horizontalSpacing || 0.02;
      const vSpace = seg.verticalSpacing || 0.05;
      const edge = seg.edgeMargin || 0;

      if (seg.isPolygon && seg.vertices) {
            let count = 0;
            const xs = seg.vertices.map(v => v.x);
            const ys = seg.vertices.map(v => v.y);
            const minX = Math.min(...xs); const maxX = Math.max(...xs);
            const minY = Math.min(...ys); const maxY = Math.max(...ys);
            const startX = minX + edge;
            const startY = minY + edge;
            for (let y = startY; y <= maxY - edge - pH; y += pH + vSpace) {
                for (let x = startX; x <= maxX - edge - pW; x += pW + hSpace) {
                     const corners = [{x,y}, {x:x+pW,y}, {x,y:y+pH}, {x:x+pW,y:y+pH}];
                     if (corners.every(p => isPointInPoly(p, seg.vertices!))) count++;
                }
            }
            return count;
      } else {
            const usableW = Math.max(0, seg.width - (2 * edge));
            const usableH = Math.max(0, seg.height - (2 * edge));
            if (usableW < pW || usableH < pH) return 0;
            const cols = Math.floor((usableW + hSpace) / (pW + hSpace));
            const rows = Math.floor((usableH + vSpace) / (pH + vSpace));
            return cols * rows;
      }
  };

  // Helper var for component render
  const maxPossiblePanels = activeSegment ? getMaxPanels(activeSegment) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Stats */}
      <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded border border-blue-200">
          <div>
              <p className="text-xs text-gray-500 uppercase font-bold">Potência Instalada</p>
              <p className="text-2xl font-bold text-blue-800">{installedKw.toFixed(2)} kWp</p>
          </div>
          <div>
              <p className="text-xs text-gray-500 uppercase font-bold">Prod. Anual Estimada</p>
              <p className="text-2xl font-bold text-green-700">~{Math.round(estProduction).toLocaleString()} kWh</p>
          </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* SIDEBAR CONTROLS */}
        <div className="w-full md:w-1/3 space-y-4 h-[600px] overflow-y-auto pr-2">
            
            {/* Toolbar */}
            <div className="grid grid-cols-2 gap-2 mb-2">
                <button 
                    onClick={() => { setToolMode('select'); setPolyPoints([]); }}
                    className={`py-2 rounded flex justify-center items-center gap-2 text-sm ${toolMode === 'select' ? 'bg-blue-600 text-white shadow' : 'bg-white border text-gray-600'}`}
                >
                    <MousePointer2 size={16} /> Selecionar
                </button>
                <button 
                    onClick={() => { setToolMode('pan'); setPolyPoints([]); }}
                    className={`py-2 rounded flex justify-center items-center gap-2 text-sm ${toolMode === 'pan' ? 'bg-blue-600 text-white shadow' : 'bg-white border text-gray-600'}`}
                >
                    <Move size={16} /> Mover Vista
                </button>
                <button 
                    onClick={() => { setToolMode('rect'); setPolyPoints([]); }}
                    className={`py-2 rounded flex justify-center items-center gap-2 text-sm ${toolMode === 'rect' ? 'bg-blue-600 text-white shadow' : 'bg-white border text-gray-600'}`}
                >
                    <Square size={16} /> Retângulo
                </button>
                <button 
                    onClick={() => { setToolMode('poly'); setPolyPoints([]); }}
                    className={`py-2 rounded flex justify-center items-center gap-2 text-sm ${toolMode === 'poly' ? 'bg-blue-600 text-white shadow' : 'bg-white border text-gray-600'}`}
                >
                    <Hexagon size={16} /> Polígono
                </button>
            </div>

            {/* View Controls */}
            <div className="flex gap-2 items-center bg-gray-50 p-2 rounded border justify-center">
                 <button onClick={() => setZoom(Math.max(0.2, zoom - 0.2))} className="p-1 hover:bg-gray-200 rounded"><ZoomOut size={16}/></button>
                 <span className="text-xs font-mono w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                 <button onClick={() => setZoom(Math.min(3, zoom + 0.2))} className="p-1 hover:bg-gray-200 rounded"><ZoomIn size={16}/></button>
                 <div className="h-4 w-[1px] bg-gray-300 mx-1"></div>
                 <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} className="p-1 hover:bg-gray-200 rounded" title="Reset View"><RotateCcw size={16}/></button>
            </div>

            {toolMode === 'poly' && (
                <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded border border-yellow-200 flex gap-2 items-start">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <p>Clique para adicionar vértices (Snap 0.5m). Duplo-clique para fechar.</p>
                </div>
            )}

            {/* Layer List */}
            <div className="bg-slate-100 p-4 rounded shadow-inner max-h-48 overflow-y-auto">
                <h4 className="font-bold mb-2 text-xs uppercase text-gray-500">Camadas</h4>
                {roofSegments.length === 0 && <p className="text-xs text-gray-400 italic">Sem superfícies desenhadas.</p>}
                {roofSegments.map(s => (
                    <div 
                    key={s.id} 
                    onClick={() => { setActiveSegmentId(s.id); setToolMode('select'); }}
                    className={`p-2 mb-2 rounded cursor-pointer flex justify-between items-center text-sm ${activeSegmentId === s.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}
                    >
                    <div className="flex items-center gap-2">
                        {s.isPolygon ? <Hexagon size={14}/> : <Square size={14}/>}
                        <span>{s.id.substr(0,4)} ({s.panelsCount} pn)</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeSegment(s.id); }} className="text-red-400 hover:text-red-200 font-bold">X</button>
                    </div>
                ))}
            </div>

            {/* Properties Panel */}
            {activeSegment && (
            <div className="bg-white p-4 rounded border border-gray-200 space-y-4">
                <h4 className="font-bold border-b pb-2 text-blue-900 text-sm">Propriedades: {activeSegment.id.substr(0,6)}</h4>
                
                {!activeSegment.isPolygon && (
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase">Largura (m)</label>
                        <input type="number" step="0.5" value={activeSegment.width.toFixed(1)} 
                            onChange={(e) => updateSegment(activeSegment.id, { width: parseFloat(e.target.value) })}
                            className="w-full border rounded p-1 text-sm" />
                        </div>
                        <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase">Comprimento (m)</label>
                        <input type="number" step="0.5" value={activeSegment.height.toFixed(1)} 
                            onChange={(e) => updateSegment(activeSegment.id, { height: parseFloat(e.target.value) })}
                            className="w-full border rounded p-1 text-sm" />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                    <div>
                        <label className="block text-[10px] font-bold text-blue-800 uppercase">Inclinação (°)</label>
                        <input type="number" min="0" max="90" value={activeSegment.tilt} 
                            onChange={(e) => updateSegment(activeSegment.id, { tilt: parseFloat(e.target.value) })}
                            className="w-full border border-blue-300 rounded p-1 font-bold text-sm" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-blue-800 uppercase">Azimute (°)</label>
                        <input type="number" min="-180" max="180" value={activeSegment.azimuth} 
                            onChange={(e) => updateSegment(activeSegment.id, { azimuth: parseFloat(e.target.value) })}
                            className="w-full border border-blue-300 rounded p-1 font-bold text-sm" />
                    </div>
                </div>

                <h4 className="font-bold border-b pb-1 text-blue-900 pt-2 text-sm">Margens & Layout</h4>
                <div className="grid grid-cols-3 gap-2">
                    <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Borda (m)</label>
                    <input type="number" step="0.1" value={activeSegment.edgeMargin || 0} 
                        onChange={(e) => updateSegment(activeSegment.id, { edgeMargin: parseFloat(e.target.value) })}
                        className="w-full border rounded p-1 text-sm" />
                    </div>
                    <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">H-Space</label>
                    <input type="number" step="0.01" value={activeSegment.horizontalSpacing || 0.02} 
                        onChange={(e) => updateSegment(activeSegment.id, { horizontalSpacing: parseFloat(e.target.value) })}
                        className="w-full border rounded p-1 text-sm" />
                    </div>
                    <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">V-Space</label>
                    <input type="number" step="0.01" value={activeSegment.verticalSpacing || 0.05} 
                        onChange={(e) => updateSegment(activeSegment.id, { verticalSpacing: parseFloat(e.target.value) })}
                        className="w-full border rounded p-1 text-sm" />
                    </div>
                </div>

                {/* Shading Analysis Card */}
                <div className="bg-orange-50 p-3 rounded border border-orange-200">
                    <h5 className="font-bold text-[10px] text-orange-900 uppercase flex items-center gap-1 mb-2"><Sun size={12}/> Análise de Sombreamento</h5>
                    <div className="flex justify-between items-center text-xs mb-2">
                        <span className="text-gray-600">Espaçamento Rec. (Inverno):</span>
                        <span className="font-bold text-orange-800">{suggestedSpacing.toFixed(2)} m</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-gray-500 mb-2">
                        <span>Fator Sombra (d/h):</span>
                        <span>{(suggestedSpacing / (panel.heightMm/1000)).toFixed(2)}</span>
                    </div>
                    {(activeSegment.verticalSpacing < suggestedSpacing) ? (
                        <button 
                            onClick={applySpacing}
                            className="w-full bg-orange-600 text-white text-xs font-bold py-1 px-2 rounded hover:bg-orange-700 animate-pulse"
                        >
                            Aplicar Sugestão
                        </button>
                    ) : (
                        <div className="text-center text-[10px] text-green-700 font-bold bg-green-100 rounded py-1">
                            Espaçamento Adequado
                        </div>
                    )}
                </div>

                <div className="bg-blue-50 p-2 rounded border border-blue-100">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Preenchimento de Painéis</label>
                    <div className="flex gap-2 items-center">
                        <input type="number" value={activeSegment.panelsCount} 
                            onChange={(e) => updateSegment(activeSegment.id, { panelsCount: parseInt(e.target.value) })}
                            className="w-20 border rounded p-1 font-bold text-lg text-blue-700 text-center" />
                        <button 
                            onClick={() => updateSegment(activeSegment.id, { panelsCount: maxPossiblePanels })}
                            className="text-xs bg-white border shadow-sm px-3 py-2 rounded hover:bg-gray-50 font-medium">
                            Auto Preencher
                        </button>
                    </div>
                    <p className="text-[10px] text-green-600 mt-1">Máximo Teórico: <strong>{maxPossiblePanels}</strong></p>
                    
                    {/* Alert if exceeded */}
                    {activeSegment.panelsCount > maxPossiblePanels && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200 flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5"/>
                            <span className="leading-tight">Atenção: O nº de painéis excede o máximo teórico ({maxPossiblePanels}) para a área disponível.</span>
                        </div>
                    )}
                </div>
            </div>
            )}
        </div>

        {/* CANVAS */}
        <div className="w-full md:w-2/3 bg-slate-800 rounded shadow border border-gray-600 relative overflow-hidden flex flex-col group h-[600px]">
            <canvas 
                ref={canvasRef} 
                width={800} 
                height={600} 
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={toolMode === 'poly' ? completePolygon : undefined}
                className={`w-full h-full object-cover bg-slate-200 ${toolMode === 'pan' ? 'cursor-move' : toolMode === 'poly' ? 'cursor-crosshair' : 'cursor-default'}`} 
            />
            {/* Overlay Info */}
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded pointer-events-none">
                Zoom: {(zoom*100).toFixed(0)}% | Grelha: 0.5m
            </div>
        </div>
      </div>
    </div>
  );
};
