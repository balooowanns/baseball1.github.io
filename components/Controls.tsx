import React, { useEffect, useRef } from 'react';
import { SimulationParams, PitchingParams, AppMode, STRIKE_ZONE_CONFIG } from '../types';
import { Sliders, Play, Loader2, Wind } from 'lucide-react';
import { calculatePitchTrajectory, solvePitchAngles } from '../utils/physics';

interface ControlsProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  battingParams: SimulationParams;
  setBattingParams: React.Dispatch<React.SetStateAction<SimulationParams>>;
  pitchingParams: PitchingParams;
  setPitchingParams: React.Dispatch<React.SetStateAction<PitchingParams>>;
  results: {
    distance: number;
    maxHeight: number;
    hangTime: number;
    finalPosition?: { x: number, y: number };
    plateCrossing?: { x: number, y: number };
  };
  onPlay: () => void;
  isPlaying: boolean;
}

export const Controls: React.FC<ControlsProps> = ({ 
  mode,
  setMode,
  battingParams, 
  setBattingParams,
  pitchingParams,
  setPitchingParams,
  results, 
  onPlay, 
  isPlaying
}) => {
  
  const handleBattingChange = (key: keyof SimulationParams, value: number) => {
    setBattingParams(prev => ({ ...prev, [key]: value }));
  };

  const handlePitchingChange = (key: keyof PitchingParams, value: number) => {
    setPitchingParams(prev => {
        let newState = { ...prev, [key]: value };

        // 1. Sync Spin Efficiency <-> Gyro Degree
        if (key === 'spinEfficiency') {
            const eff = Math.max(0, Math.min(100, value));
            const rad = Math.acos(eff / 100);
            newState.gyroDegree = Number((rad * (180/Math.PI)).toFixed(1));
        } else if (key === 'gyroDegree') {
            const gyro = Math.max(0, Math.min(90, value));
            const eff = Math.cos(gyro * (Math.PI/180)) * 100;
            newState.spinEfficiency = Number(eff.toFixed(1));
        }

        // 2. Logic Branch:
        // Case A: User changed Target X/Y directly -> Recalculate Angles to hit Target
        // Case B: User changed Angles directly -> Recalculate Target based on physics
        // Case C: User changed other physics (Velocity, Spin, Extension) -> Recalculate Angles to MAINTAIN Target
        
        if (key === 'targetX' || key === 'targetY') {
            // Case A: Inverse Kinematics (Solve Angles for new Target)
            const solution = solvePitchAngles(newState, newState.targetX, newState.targetY);
            newState.hAngle = Number(solution.hAngle.toFixed(2));
            newState.vAngle = Number(solution.vAngle.toFixed(2));
        } 
        else if (key === 'hAngle' || key === 'vAngle') {
            // Case B: Forward Kinematics (Calc Target from new Angles)
            // We run one simulation pass to see where it lands
            const result = calculatePitchTrajectory(newState);
            
            // Use plate crossing if available, otherwise final position
            const crossing = result.plateCrossing || result.finalPosition;
            if (crossing) {
                newState.targetX = crossing.x;
                newState.targetY = crossing.y;
            }
        }
        else {
            // Case C: Maintain Target by adjusting Angles
            // e.g. If I increase velocity, less gravity drop, so vAngle needs to go down to hit same spot.
            // We treat the current targetX/targetY as the "master" intent.
            // Check if velocity is valid before running solver
            if (newState.velocity > 0.1) {
                const solution = solvePitchAngles(newState, newState.targetX, newState.targetY);
                newState.hAngle = Number(solution.hAngle.toFixed(2));
                newState.vAngle = Number(solution.vAngle.toFixed(2));
            }
        }

        return newState;
    });
  };

  // Clock position helper
  const getClockTime = (deg: number) => {
    let hour = Math.floor(deg / 30);
    if (hour === 0) hour = 12;
    const minute = Math.round((deg % 30) * 2); 
    return `${hour}:${minute.toString().padStart(2, '0')} / ${deg}°`;
  };

  // Derived value
  const trueSpin = Math.round(pitchingParams.spinRate * (pitchingParams.spinEfficiency / 100));

  // Determine which Y value to show: Plate Crossing Y (Strike Zone height) is preferred
  const finalHeightDisplay = results.plateCrossing ? results.plateCrossing.y : (results.finalPosition ? results.finalPosition.y : 0);

  return (
    <div 
        className={`absolute bottom-4 left-4 right-4 max-h-[75dvh] md:left-auto md:right-4 md:top-4 md:bottom-4 md:w-[360px] md:max-h-none bg-white/30 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border border-white/40 z-20 ring-1 ring-black/5 flex flex-col transition-all duration-500 ease-in-out overflow-hidden
        ${isPlaying ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0 pointer-events-auto'}`}
    >
      
      {/* Mode Toggles - Fixed Header */}
      <div className="flex p-1 bg-slate-800/10 rounded-xl mb-4 flex-shrink-0">
        <button 
          onClick={() => setMode('batting')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'batting' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-white/50'}`}
        >
          打撃モード
        </button>
        <button 
          onClick={() => setMode('pitching')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'pitching' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:bg-white/50'}`}
        >
          投球モード
        </button>
      </div>

      {/* Scrollable Content Area */}
      {mode === 'batting' ? (
        // BATTING CONTROLS (Simple Sliders)
        <div className="space-y-6 flex-1 overflow-y-auto pb-4 px-1">
          <h2 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
             <Sliders className="w-4 h-4" /> 打撃設定
          </h2>
          
          {/* Exit Velocity */}
          <div className="relative group">
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-slate-800">打球速度</label>
              <span className="text-xs font-mono font-bold text-indigo-800 bg-indigo-100/50 px-2 py-0.5 rounded">{battingParams.velocity} km/h</span>
            </div>
            <input type="range" min="0" max="200" step="1" value={battingParams.velocity} onChange={(e) => handleBattingChange('velocity', Number(e.target.value))} className="w-full h-2 bg-slate-800/10 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
          </div>

          {/* Launch Angle */}
          <div className="relative group">
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-slate-800">角度</label>
              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100/50 px-2 py-0.5 rounded">{battingParams.angle}°</span>
            </div>
            <input type="range" min="-45" max="80" step="1" value={battingParams.angle} onChange={(e) => handleBattingChange('angle', Number(e.target.value))} className="w-full h-2 bg-slate-800/10 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
          </div>

          {/* Direction */}
          <div className="relative group">
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-slate-800">方向</label>
              <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100/50 px-2 py-0.5 rounded">{battingParams.direction}°</span>
            </div>
            <input type="range" min="-45" max="45" step="1" value={battingParams.direction} onChange={(e) => handleBattingChange('direction', Number(e.target.value))} className="w-full h-2 bg-slate-800/10 rounded-lg appearance-none cursor-pointer accent-amber-500" />
          </div>

          {/* Wind Settings */}
          <div className="bg-white/40 rounded-2xl p-3 border border-white/30 mt-4">
            <h2 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-sky-600" /> WIND CONDITION
            </h2>
            <div className="flex gap-4 items-start">
                {/* Wind Direction Widget */}
                <div className="flex flex-col items-center gap-1">
                    <div className="text-[9px] font-bold text-slate-500">DIRECTION</div>
                    <WindDirectionControl value={battingParams.windDirection} onChange={(v) => handleBattingChange('windDirection', v)} />
                </div>

                {/* Wind Speed Slider */}
                <div className="flex-1">
                    <div className="flex justify-between mb-2">
                        <label className="text-[9px] font-bold text-slate-500">SPEED (m/s)</label>
                        <span className="text-xs font-mono font-bold text-sky-800 bg-sky-100/50 px-2 py-0.5 rounded">{battingParams.windSpeed} m/s</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="20" 
                        step="1" 
                        value={battingParams.windSpeed} 
                        onChange={(e) => handleBattingChange('windSpeed', Number(e.target.value))} 
                        className="w-full h-2 bg-slate-800/10 rounded-lg appearance-none cursor-pointer accent-sky-500" 
                    />
                     <div className="flex justify-between text-[8px] text-slate-400 font-bold mt-1 px-1">
                        <span>CALM</span>
                        <span>STRONG</span>
                    </div>
                </div>
            </div>
          </div>
          
          {/* Results for Batting */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/20">
            <ResultBox label="飛距離" value={results.distance.toFixed(1)} unit="m" />
            <ResultBox label="高さ" value={results.maxHeight.toFixed(1)} unit="m" />
            <ResultBox label="滞空時間" value={results.hangTime.toFixed(1)} unit="s" />
          </div>
        </div>
      ) : (
        // PITCHING CONTROLS (Data Grid)
        <div className="flex-1 overflow-y-auto px-1 pb-1">
             {/* Visual Widgets Row */}
             <div className="flex gap-2 mb-3 h-36">
                {/* Spin Axis Widget */}
                <div className="flex-1 bg-white/50 rounded-2xl p-2 border border-white/40 flex flex-col items-center justify-between">
                    <div className="w-full flex justify-between text-[9px] font-bold text-slate-600 uppercase">
                        <span>Spin Axis</span>
                        <span className="truncate max-w-[60px]">{getClockTime(pitchingParams.spinDirection).split('/')[0]}</span>
                    </div>
                    <SpinAxisControl value={pitchingParams.spinDirection} onChange={(v) => handlePitchingChange('spinDirection', v)} />
                </div>
                
                {/* Zone Widget */}
                <div className="flex-1 bg-white/50 rounded-2xl p-2 border border-white/40 flex flex-col items-center justify-center overflow-hidden">
                    <div className="w-full flex justify-between text-[9px] font-bold text-slate-600 uppercase mb-1">
                        <span>Target</span>
                    </div>
                    {/* Enforce aspect ratio (1.0 width / 1.6 height = 5/8) to match meters mapping */}
                     <div className="w-full h-full flex items-center justify-center">
                        <div className="aspect-[5/8] h-full">
                            <ZoneControl 
                                targetX={pitchingParams.targetX} 
                                targetY={pitchingParams.targetY} 
                                onChange={(x, y) => {
                                    handlePitchingChange('targetX', x);
                                    handlePitchingChange('targetY', y);
                                }} 
                            />
                        </div>
                     </div>
                </div>
             </div>

             {/* Data Inputs Grid */}
             <div className="grid grid-cols-3 gap-1.5 pb-2">
                
                {/* Velocity */}
                <InputCell 
                    label="VELOCITY" 
                    unit="KPH" 
                    value={pitchingParams.velocity} 
                    onChange={(v) => handlePitchingChange('velocity', v)} 
                    min={0} max={180} step={0.1}
                />
                
                {/* Total Spin */}
                <InputCell 
                    label="TOTAL SPIN" 
                    unit="RPM" 
                    value={pitchingParams.spinRate} 
                    onChange={(v) => handlePitchingChange('spinRate', v)} 
                    min={0} max={3500} step={10}
                />

                {/* Spin Direction (Numerical) */}
                <div className="bg-white/40 rounded-lg p-1 border border-white/30 flex flex-col justify-center items-center h-[4.5rem]">
                     <div className="text-[7px] tracking-tighter font-bold text-slate-500 uppercase">SPIN DIRECTION</div>
                     <div className="text-lg font-black text-slate-800">{getClockTime(pitchingParams.spinDirection).split(' /')[0]}</div>
                </div>

                {/* Spin Efficiency */}
                <InputCell 
                    label="SPIN EFFICIENCY" 
                    unit="%" 
                    value={pitchingParams.spinEfficiency} 
                    onChange={(v) => handlePitchingChange('spinEfficiency', v)} 
                    min={0} max={100} step={0.1}
                />

                {/* H. Angle */}
                <InputCell 
                    label="H. ANGLE" 
                    unit="°" 
                    value={pitchingParams.hAngle} 
                    onChange={(v) => handlePitchingChange('hAngle', v)} 
                    min={-10} max={10} step={0.1}
                />

                {/* Release Angle (V) */}
                <InputCell 
                    label="RELEASE ANGLE" 
                    unit="°" 
                    value={pitchingParams.vAngle} 
                    onChange={(v) => handlePitchingChange('vAngle', v)} 
                    min={-10} max={10} step={0.1}
                />

                {/* Release Height */}
                <InputCell 
                    label="RELEASE HEIGHT" 
                    unit="M" 
                    value={pitchingParams.releaseHeight} 
                    onChange={(v) => handlePitchingChange('releaseHeight', v)} 
                    min={0.5} max={2.5} step={0.01}
                />

                {/* Extension */}
                <InputCell 
                    label="R. EXTENSION" 
                    unit="CM" 
                    value={pitchingParams.extension} 
                    onChange={(v) => handlePitchingChange('extension', v)} 
                    min={100} max={250} step={1}
                />

                {/* Release Side */}
                <InputCell 
                    label="RELEASE SIDE" 
                    unit="CM" 
                    value={pitchingParams.releaseSide} 
                    onChange={(v) => handlePitchingChange('releaseSide', v)} 
                    min={-100} max={100} step={1}
                />

                {/* Gyro Degree */}
                <InputCell 
                    label="GYRO DEGREE" 
                    unit="°" 
                    value={pitchingParams.gyroDegree} 
                    onChange={(v) => handlePitchingChange('gyroDegree', v)} 
                    min={0} max={90} step={0.1}
                />

                {/* True Spin (Read Only) */}
                <div className="bg-white/20 rounded-lg p-1 border border-white/30 flex flex-col justify-center items-center h-[4.5rem]">
                     <div className="text-[7px] tracking-tighter font-bold text-slate-500 uppercase">TRUE SPIN</div>
                     <div className="text-lg font-black text-slate-900">{trueSpin}</div>
                     <div className="text-[7px] text-slate-500 font-bold">RPM</div>
                </div>

                 {/* Final Y Calc */}
                 <div className="bg-white/20 rounded-lg p-1 border border-white/30 flex flex-col justify-center items-center h-[4.5rem]">
                     <div className="text-[7px] tracking-tighter font-bold text-slate-500 uppercase">FINAL HEIGHT</div>
                     <div className="text-lg font-black text-slate-900">{finalHeightDisplay !== undefined ? (finalHeightDisplay * 100).toFixed(0) : '-'}</div>
                     <div className="text-[7px] text-slate-500 font-bold">CM</div>
                </div>

             </div>
        </div>
      )}

      {/* Play Button - Fixed Footer */}
      <div className="mt-3 flex-shrink-0">
        <button
          onClick={onPlay}
          disabled={isPlaying}
          className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all duration-200 flex items-center justify-center gap-2 backdrop-blur-sm
            ${isPlaying 
              ? 'bg-slate-500/80 cursor-not-allowed' 
              : mode === 'batting' 
                ? 'bg-gradient-to-r from-indigo-600/90 to-violet-600/90 hover:from-indigo-500 hover:to-violet-500' 
                : 'bg-gradient-to-r from-emerald-600/90 to-teal-600/90 hover:from-emerald-500 hover:to-teal-500'
            }`}
        >
          {isPlaying ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> 
              {mode === 'batting' ? '計算中...' : '投球中...'}
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              シミュレーション開始
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// UI Components

const InputCell = ({ label, unit, value, onChange, min, max, step }: any) => (
    <div className="bg-white/40 rounded-lg p-1 border border-white/30 flex flex-col justify-center items-center h-[4.5rem] relative group hover:bg-white/60 transition-colors">
        <div className="text-[7px] tracking-tighter font-bold text-slate-500 uppercase text-center leading-none w-full whitespace-normal px-0.5 mb-0.5">{label}</div>
        <div className="flex items-baseline gap-0.5">
            <input 
                type="number" 
                className="w-14 bg-transparent text-center text-lg font-black text-slate-900 focus:outline-none focus:ring-0 p-0"
                value={value === 0 ? '' : value}
                onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                step={step}
            />
        </div>
        <div className="text-[7px] text-slate-500 font-bold">{unit}</div>
    </div>
);

const ResultBox = ({ label, value, unit }: { label: string, value: string, unit: string }) => (
  <div className="bg-white/40 backdrop-blur-sm p-2 rounded-xl border border-white/50 flex flex-col items-center justify-center hover:bg-white/60 transition-colors">
    <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">{label}</div>
    <div className="text-base font-black text-slate-900 leading-none">
      {value}<span className="text-[9px] font-medium text-slate-700 ml-0.5">{unit}</span>
    </div>
  </div>
);

const SpinAxisControl: React.FC<{ value: number, onChange: (deg: number) => void }> = ({ value, onChange }) => {
    const ref = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const updateAngle = (clientX: number, clientY: number) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let rad = Math.atan2(clientY - cy, clientX - cx);
        let deg = rad * (180 / Math.PI);
        deg += 90;
        if (deg < 0) deg += 360;
        onChange(Math.round(deg));
    };

    return (
        <div 
            ref={ref}
            onPointerDown={(e) => { isDragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); updateAngle(e.clientX, e.clientY); }}
            onPointerMove={(e) => { if(isDragging.current) updateAngle(e.clientX, e.clientY); }}
            onPointerUp={(e) => { isDragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
            className="relative w-full h-20 cursor-crosshair touch-none select-none flex items-center justify-center"
        >
             {/* Ball & Big Arrow */}
             <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-white to-slate-200 shadow-md flex items-center justify-center border border-slate-200" style={{transform: `rotate(${value}deg)`}}>
                <div className="absolute inset-0 rounded-full border-2 border-red-600/40 border-dashed opacity-50" />
                <div className="absolute w-1.5 h-full bg-red-600/90 top-0 left-1/2 -translate-x-1/2 shadow-sm"></div>
                <div className="absolute w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-red-600 top-1 left-1/2 -translate-x-1/2"></div>
             </div>
        </div>
    );
};

const WindDirectionControl: React.FC<{ value: number, onChange: (deg: number) => void }> = ({ value, onChange }) => {
    const ref = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const updateAngle = (clientX: number, clientY: number) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let rad = Math.atan2(clientY - cy, clientX - cx);
        let deg = rad * (180 / Math.PI);
        deg += 90; 
        if (deg < 0) deg += 360;
        onChange(Math.round(deg));
    };

    return (
        <div 
            ref={ref}
            onPointerDown={(e) => { isDragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); updateAngle(e.clientX, e.clientY); }}
            onPointerMove={(e) => { if(isDragging.current) updateAngle(e.clientX, e.clientY); }}
            onPointerUp={(e) => { isDragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
            className="relative w-12 h-12 cursor-crosshair touch-none select-none flex items-center justify-center bg-slate-200/50 rounded-full border border-slate-300"
        >
             {/* Compass Marks */}
             <div className="absolute top-0 text-[6px] font-bold text-slate-400">N</div>
             <div className="absolute bottom-0 text-[6px] font-bold text-slate-400">S</div>
             <div className="absolute left-1 text-[6px] font-bold text-slate-400">L</div>
             <div className="absolute right-1 text-[6px] font-bold text-slate-400">R</div>

             {/* Arrow */}
             <div className="relative w-full h-full flex items-center justify-center" style={{transform: `rotate(${value}deg)`}}>
                <div className="absolute w-1 h-6 bg-sky-500 bottom-1/2 left-1/2 -translate-x-1/2 rounded-b-full origin-bottom"></div>
                <div className="absolute w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-sky-500 top-1.5 left-1/2 -translate-x-1/2"></div>
             </div>
        </div>
    );
};

const ZoneControl: React.FC<{ targetX: number, targetY: number, onChange: (x: number, y: number) => void }> = ({ targetX, targetY, onChange }) => {
    const ref = useRef<HTMLDivElement>(null);
    
    // Define reachable area in meters
    // Width: -0.5m to 0.5m (Total 1.0m)
    // Height: 0.0m to 1.6m (Total 1.6m)
    const MAX_X_METERS = 0.5;
    const MIN_X_METERS = -0.5;
    const MAX_Y_METERS = 1.6;
    const MIN_Y_METERS = 0;
    
    const WIDTH_M = MAX_X_METERS - MIN_X_METERS; // 1.0
    const HEIGHT_M = MAX_Y_METERS - MIN_Y_METERS; // 1.6

    const handleClick = (e: React.MouseEvent | React.PointerEvent) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // 0 to 1
        const nx = Math.max(0, Math.min(1, clickX / rect.width));
        const ny = Math.max(0, Math.min(1, clickY / rect.height));
        
        // Map 0..1 to meters
        // X: 0 -> -0.5, 1 -> 0.5
        const xMeters = MIN_X_METERS + (nx * WIDTH_M);
        
        // Y: 0 (top) -> 1.6, 1 (bottom) -> 0
        const yMeters = MAX_Y_METERS - (ny * HEIGHT_M);
        
        onChange(xMeters, yMeters);
    };

    // Convert current target meters to percentages
    const leftPct = ((targetX - MIN_X_METERS) / WIDTH_M) * 100;
    const topPct = ((MAX_Y_METERS - targetY) / HEIGHT_M) * 100;
    
    // Strike Zone Definitions (meters) - IMPORTED FROM SHARED CONFIG
    const SZ_TOP = STRIKE_ZONE_CONFIG.TOP;
    const SZ_BOTTOM = STRIKE_ZONE_CONFIG.BOTTOM;
    const SZ_WIDTH = STRIKE_ZONE_CONFIG.WIDTH;
    
    const SZ_LEFT = -(SZ_WIDTH / 2);
    const SZ_RIGHT = (SZ_WIDTH / 2);
    
    // Convert SZ to CSS %
    const szTopPct = ((MAX_Y_METERS - SZ_TOP) / HEIGHT_M) * 100;
    const szHeightPct = ((SZ_TOP - SZ_BOTTOM) / HEIGHT_M) * 100;
    const szLeftPct = ((SZ_LEFT - MIN_X_METERS) / WIDTH_M) * 100;
    const szWidthPct = ((SZ_RIGHT - SZ_LEFT) / WIDTH_M) * 100;

    return (
        <div 
            ref={ref}
            className="relative w-full h-full bg-slate-200/80 rounded border border-slate-300 cursor-crosshair overflow-hidden shadow-inner aspect-[5/8]"
            onPointerDown={handleClick}
            onPointerMove={(e) => { if(e.buttons === 1) handleClick(e); }}
        >
            {/* Reference Lines */}
            <div className="absolute top-0 bottom-0 left-1/2 border-l border-slate-300/50" />
            
            {/* Strike Zone Box */}
            <div 
                className="absolute border-2 border-slate-400 bg-white/40" 
                style={{ 
                    top: `${szTopPct}%`, 
                    height: `${szHeightPct}%`, 
                    left: `${szLeftPct}%`, 
                    width: `${szWidthPct}%` 
                }}
            >
                 <div className="w-full h-full flex items-center justify-center opacity-20 text-[8px] font-black">ZONE</div>
            </div>
            
            {/* Marker */}
            <div 
                className="absolute w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            />
        </div>
    );
}