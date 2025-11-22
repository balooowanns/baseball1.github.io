
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SimulationCanvas } from './components/SimulationCanvas';
import { Controls } from './components/Controls';
import { SimulationParams, PitchingParams, AppMode } from './types';
import { Info, Square } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('batting');

  // Batting State
  const [battingParams, setBattingParams] = useState<SimulationParams>({
    velocity: 160,
    angle: 30,
    direction: 0,
    windSpeed: 0,
    windDirection: 0, // 0 = Tailwind (to Center)
  });

  // Pitching State - Defaults based on image example
  const [pitchingParams, setPitchingParams] = useState<PitchingParams>({
    velocity: 145.1,
    spinRate: 2175,
    spinDirection: 38, // Approx 1:16 on clock
    spinEfficiency: 89.3,
    hAngle: 2.2,
    vAngle: -2.3,
    releaseHeight: 1.8,
    releaseSide: 50.5, // cm
    extension: 182.9, // cm
    targetX: 0, // Will be synced by controls on mount/update
    targetY: 0.76,
    gyroDegree: 26.7,
  });

  const [results, setResults] = useState({
    distance: 0,
    maxHeight: 0,
    hangTime: 0,
    finalPosition: undefined as {x: number, y: number} | undefined,
    plateCrossing: undefined as {x: number, y: number} | undefined
  });

  const [simulationTrigger, setSimulationTrigger] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  
  // Ref to track looping state inside timeouts to prevent stale closures
  const isLoopingRef = useRef(isLooping);
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  const handleResultUpdate = useCallback((distance: number, maxHeight: number, hangTime: number, finalPos?: {x: number, y: number}, plateCrossing?: {x: number, y: number}) => {
    setResults({ distance, maxHeight, hangTime, finalPosition: finalPos, plateCrossing });
  }, []);

  const handlePlay = () => {
    setIsLooping(true);
    setSimulationTrigger(prev => prev + 1);
    setIsPlaying(true);
  };

  const handleStop = () => {
    setIsLooping(false);
    setIsPlaying(false);
  };

  const handleAnimationComplete = () => {
    if (isLoopingRef.current) {
        // Delay restart for 1 second to show the result
        setTimeout(() => {
            if (isLoopingRef.current) {
                setSimulationTrigger(prev => prev + 1);
            } else {
                // If stopped during the delay
                setIsPlaying(false);
            }
        }, 1000);
    } else {
        setIsPlaying(false);
    }
  };

  return (
    <div className="relative w-full h-[100dvh] bg-slate-900 overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* 3D Scene Container */}
      <div className="absolute inset-0 z-0">
        <SimulationCanvas 
          mode={mode}
          battingParams={battingParams}
          pitchingParams={pitchingParams} 
          onResultUpdate={handleResultUpdate} 
          simulationTrigger={simulationTrigger}
          onAnimationComplete={handleAnimationComplete}
        />
      </div>

      {/* Controls & Stats */}
      <Controls 
        mode={mode}
        setMode={setMode}
        battingParams={battingParams} 
        setBattingParams={setBattingParams}
        pitchingParams={pitchingParams}
        setPitchingParams={setPitchingParams}
        results={results} 
        onPlay={handlePlay}
        isPlaying={isPlaying}
      />

      {/* Stop Button (Only visible when playing) */}
      <div className={`absolute top-4 right-16 z-50 transition-all duration-300 ${isPlaying ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
         <button 
            onClick={handleStop}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-sm border border-white/20"
         >
            <Square className="w-4 h-4 fill-current" />
            <span>停止</span>
         </button>
      </div>

      {/* Info / Help Overlay */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-black/30 backdrop-blur-md p-2 rounded-full hover:bg-black/50 transition cursor-help group relative border border-white/10">
            <Info className="w-6 h-6 text-white" />
            <div className="hidden group-hover:block absolute right-0 top-full mt-2 w-72 bg-slate-900/95 border border-slate-700 text-white text-xs p-4 rounded-xl shadow-2xl z-50">
                <h3 className="font-bold text-sm mb-2 text-indigo-300">シミュレーターについて</h3>
                <p className="mb-2 text-slate-300">
                   打撃と投球の物理シミュレーションを行います。
                </p>
                <div className="space-y-2">
                    <div>
                        <strong className="text-white block border-b border-white/10 pb-1 mb-1">打撃モード</strong>
                        <ul className="list-disc pl-4 space-y-1 text-slate-400">
                            <li>速度・角度・方向を指定して飛距離を計測</li>
                            <li>風向・風速を設定可能</li>
                        </ul>
                    </div>
                     <div>
                        <strong className="text-white block border-b border-white/10 pb-1 mb-1">投球モード</strong>
                        <ul className="list-disc pl-4 space-y-1 text-slate-400">
                            <li>回転数と回転軸(Tilt)による変化を再現</li>
                            <li>コース指定で狙った場所への投球軌道を確認</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;
