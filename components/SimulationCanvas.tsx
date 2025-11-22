import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Line, Environment, ContactShadows, Trail, Billboard, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { Vector3 } from 'three';
import { Stadium } from './Stadium';
import { calculateTrajectory, calculatePitchTrajectory } from '../utils/physics';
import { SimulationParams, PitchingParams, AppMode, STRIKE_ZONE_CONFIG } from '../types';

interface SimulationCanvasProps {
  mode: AppMode;
  battingParams: SimulationParams;
  pitchingParams: PitchingParams;
  onResultUpdate: (distance: number, height: number, time: number, finalPos?: {x: number, y: number}, plateCrossing?: {x: number, y: number}) => void;
  simulationTrigger: number; 
  onAnimationComplete: () => void;
}

interface HUDRefs {
    speed: HTMLSpanElement | null;
    vBreak: HTMLSpanElement | null;
    hBreak: HTMLSpanElement | null;
    slowMotion: HTMLDivElement | null;
    container: HTMLDivElement | null;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ 
  mode,
  battingParams, 
  pitchingParams,
  onResultUpdate, 
  simulationTrigger,
  onAnimationComplete
}) => {
  // Refs for direct DOM manipulation (HUD)
  const speedRef = useRef<HTMLSpanElement>(null);
  const vBreakRef = useRef<HTMLSpanElement>(null);
  const hBreakRef = useRef<HTMLSpanElement>(null);
  const slowMotionRef = useRef<HTMLDivElement>(null);
  const hudContainerRef = useRef<HTMLDivElement>(null);

  // HUD Refs Object to pass to SceneContent
  const hudRefs = useRef<HUDRefs>({
      speed: null,
      vBreak: null,
      hBreak: null,
      slowMotion: null,
      container: null
  });

  // Update ref object when refs change
  useEffect(() => {
      hudRefs.current = {
          speed: speedRef.current,
          vBreak: vBreakRef.current,
          hBreak: hBreakRef.current,
          slowMotion: slowMotionRef.current,
          container: hudContainerRef.current
      };
  }, []);

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-sky-400 via-sky-300 to-sky-100">
      
      <Canvas shadows camera={{ position: [0, 5, mode === 'batting' ? -20 : 5], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[-50, 80, -30]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]} 
          shadow-bias={-0.0001}
        />
        <Environment preset="city" />
        
        <SceneContent 
          mode={mode}
          battingParams={battingParams} 
          pitchingParams={pitchingParams}
          onResultUpdate={onResultUpdate} 
          simulationTrigger={simulationTrigger}
          onAnimationComplete={onAnimationComplete}
          hudRefs={hudRefs}
        />
        
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          minDistance={2}
          maxDistance={300}
          target={[0, 1, mode === 'batting' ? 50 : 9]} // Focus point changes based on mode
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>

      {/* Fixed Pitching HUD (Outside Canvas) */}
      <div 
        ref={hudContainerRef}
        className={`absolute top-6 left-8 pointer-events-none z-10 ${mode === 'pitching' ? 'block' : 'hidden'}`}
      >
           <div className="flex flex-col gap-4">
               {/* Speed Section */}
               <div className="flex flex-col items-start">
                   <div className="flex items-center gap-2">
                      <div className="text-xs font-bold text-white/70 tracking-widest bg-black/20 px-2 py-0.5 rounded backdrop-blur-sm border border-white/10">VELOCITY</div>
                      <div ref={slowMotionRef} className="hidden text-xs font-black text-yellow-400 tracking-widest bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm border border-yellow-400/50 animate-pulse">
                        SLOW MOTION
                      </div>
                   </div>
                   <div className="text-7xl font-black italic text-white tracking-tighter" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                       <span ref={speedRef}>{pitchingParams.velocity.toFixed(1)}</span>
                       <span className="text-2xl not-italic text-emerald-400 ml-2 font-bold">km/h</span>
                   </div>
               </div>
    
               {/* Break Section */}
               <div className="flex gap-6">
                    <div className="flex flex-col items-start">
                        <div className="text-[10px] font-bold text-white/60 tracking-widest">V-BREAK</div>
                        <div className="text-3xl font-black text-white tracking-tighter flex items-baseline">
                            <span ref={vBreakRef}>0.0</span>
                            <span className="text-xs font-bold text-white/50 ml-1">cm</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-start">
                        <div className="text-[10px] font-bold text-white/60 tracking-widest">H-BREAK</div>
                        <div className="text-3xl font-black text-white tracking-tighter flex items-baseline">
                             <span ref={hBreakRef}>0.0</span>
                            <span className="text-xs font-bold text-white/50 ml-1">cm</span>
                        </div>
                    </div>
               </div>
           </div>
      </div>

    </div>
  );
};

const StrikeZone3D: React.FC = () => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const hw = STRIKE_ZONE_CONFIG.WIDTH / 2;
    const side = STRIKE_ZONE_CONFIG.SIDE_HEIGHT;
    const diag = STRIKE_ZONE_CONFIG.DIAGONAL;
    const tipExtension = Math.sqrt(diag*diag - hw*hw); 
    const totalDepth = side + tipExtension;

    s.moveTo(-hw, 0);          // Front Left
    s.lineTo(hw, 0);           // Front Right
    s.lineTo(hw, -side);       // Side Right
    s.lineTo(0, -totalDepth);  // Back Tip
    s.lineTo(-hw, -side);      // Side Left
    s.closePath();
    return s;
  }, []);

  const extrudeSettings = useMemo(() => ({
    depth: STRIKE_ZONE_CONFIG.TOP - STRIKE_ZONE_CONFIG.BOTTOM, 
    bevelEnabled: false,
  }), []);

  return (
    <group position={[0, STRIKE_ZONE_CONFIG.TOP, 0]} rotation={[Math.PI / 2, 0, 0]}>
       <mesh>
         <extrudeGeometry args={[shape, extrudeSettings]} />
         <meshBasicMaterial 
            color="#fbbf24" 
            transparent 
            opacity={0.2} 
            side={THREE.DoubleSide} 
            depthWrite={false} 
         />
         <Edges color="#fbbf24" threshold={15} />
       </mesh>
    </group>
  );
};

const WindIndicator: React.FC<{ speed: number, direction: number }> = ({ speed, direction }) => {
  const scale = 1 + (speed / 20);

  return (
    <group position={[0, 15, 50]}> 
      <Billboard>
        <Text 
          fontSize={5} 
          color="#0ea5e9" 
          anchorY="bottom" 
          position={[0, 3, 0]}
          outlineWidth={0.2}
          outlineColor="white"
          fontWeight="bold"
        >
          {speed} m/s
        </Text>
        <Text 
             fontSize={2} 
             color="white" 
             anchorY="top" 
             position={[0, 2.5, 0]}
             outlineWidth={0.1}
             outlineColor="#0ea5e9"
             fontWeight="bold"
        >
            WIND
        </Text>
      </Billboard>

      {/* Arrow Group - Rotated Clockwise for Negative X (Right) alignment */}
      <group rotation={[0, -direction * (Math.PI / 180), 0]} scale={scale}>
        <mesh position={[0, 0, -3]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 6, 16]} />
          <meshStandardMaterial color="#0ea5e9" />
        </mesh>
        
        <mesh position={[0, 0, 2]} rotation={[Math.PI / 2, 0, 0]}>
           <cylinderGeometry args={[0, 1.5, 4, 16]} />
           <meshStandardMaterial color="#0ea5e9" />
        </mesh>
      </group>
    </group>
  );
};

const LiveSpeedIndicator: React.FC<{ speed: number, visible: boolean }> = ({ speed, visible }) => {
  if (!visible) return null;
  
  return (
    <Billboard position={[0, 1.5, 0]}> 
      <Text
        fontSize={1.2}
        color="#ec4899"
        fontWeight="bold"
        outlineWidth={0.1}
        outlineColor="white"
        anchorY="bottom"
      >
        {speed.toFixed(0)} km/h
      </Text>
    </Billboard>
  );
};

type PlaybackPhase = 'idle' | 'normal' | 'waiting' | 'slow';

interface SceneContentProps extends SimulationCanvasProps {
    hudRefs: React.MutableRefObject<HUDRefs>;
}

const SceneContent: React.FC<SceneContentProps> = ({ 
  mode,
  battingParams, 
  pitchingParams,
  onResultUpdate, 
  simulationTrigger,
  onAnimationComplete,
  hudRefs
}) => {
  const ballRef = useRef<any>(null);
  const startTimeRef = useRef(0);
  
  const [playbackState, setPlaybackState] = useState<PlaybackPhase>('idle');
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  
  const { points, distance, maxHeight, hangTime, finalPosition, plateCrossing, landingPosition } = useMemo(() => {
    if (mode === 'batting') {
        return calculateTrajectory(
          battingParams.velocity, 
          battingParams.angle, 
          battingParams.direction,
          battingParams.windSpeed,
          battingParams.windDirection
        );
    } else {
        return calculatePitchTrajectory(pitchingParams);
    }
  }, [mode, battingParams, pitchingParams]);

  // Pre-calculate final break for idle display
  const finalBreak = useMemo(() => {
      if (mode === 'pitching' && points.length > 0) {
          const last = points[points.length - 1];
          return { v: last.breakY || 0, h: last.breakX || 0 };
      }
      return { v: 0, h: 0 };
  }, [points, mode]);

  useEffect(() => {
    onResultUpdate(distance, maxHeight, hangTime, finalPosition, plateCrossing);
  }, [distance, maxHeight, hangTime, finalPosition, plateCrossing, onResultUpdate]);

  const linePoints = useMemo(() => {
    return points.map(p => new Vector3(p.x, p.y, p.z));
  }, [points]);

  useEffect(() => {
    if (simulationTrigger > 0) {
      setPlaybackState('normal'); 
      startTimeRef.current = -1; 
      setCurrentSpeedKmh(mode === 'batting' ? battingParams.velocity : pitchingParams.velocity);
    }
  }, [simulationTrigger, mode, battingParams.velocity, pitchingParams.velocity]);

  // Helper to update DOM
  const updateHUD = (speed: number, vBreak: number, hBreak: number, isSlow: boolean) => {
      if (hudRefs.current.speed) hudRefs.current.speed.textContent = speed.toFixed(1);
      if (hudRefs.current.vBreak) {
          const sign = vBreak > 0 ? '+' : '';
          hudRefs.current.vBreak.textContent = `${sign}${vBreak.toFixed(1)}`;
      }
      if (hudRefs.current.hBreak) {
          const sign = hBreak > 0 ? '+' : '';
          hudRefs.current.hBreak.textContent = `${sign}${hBreak.toFixed(1)}`;
      }
      if (hudRefs.current.slowMotion) {
          hudRefs.current.slowMotion.style.display = isSlow ? 'block' : 'none';
      }
  };

  useFrame((state) => {
    if (mode === 'pitching') {
        // In idle mode, keep showing static stats
        if (playbackState === 'idle') {
             updateHUD(pitchingParams.velocity, finalBreak.v, finalBreak.h, false);
        }
    }

    if (ballRef.current) {
      if (playbackState === 'waiting') {
          const waitElapsed = state.clock.getElapsedTime() - startTimeRef.current;
          if (waitElapsed > 1.0) { 
              setPlaybackState('slow');
              startTimeRef.current = -1; 
          }
          return;
      }

      if (playbackState !== 'idle' && points.length > 1) {
        if (startTimeRef.current < 0) {
          startTimeRef.current = state.clock.getElapsedTime();
        }

        const rawElapsed = state.clock.getElapsedTime() - startTimeRef.current;
        const speedFactor = (mode === 'pitching' && playbackState === 'slow') ? 0.15 : 1.0;
        const simTime = rawElapsed * speedFactor;
        const totalDuration = points[points.length - 1].t;

        if (simTime <= totalDuration) {
          const dt = mode === 'batting' ? 0.01 : 0.002;
          const rawIndex = simTime / dt;
          const index = Math.floor(rawIndex);
          const nextIndex = Math.min(index + 1, points.length - 1);
          const fraction = rawIndex - index; 

          const p1 = points[Math.min(index, points.length - 1)];
          const p2 = points[nextIndex];

          ballRef.current.position.set(
            p1.x + (p2.x - p1.x) * fraction,
            p1.y + (p2.y - p1.y) * fraction,
            p1.z + (p2.z - p1.z) * fraction
          );
          
          let currentSpeed = 0;
          if (dt > 0) {
              const dist = Math.sqrt(
                  Math.pow(p2.x - p1.x, 2) + 
                  Math.pow(p2.y - p1.y, 2) + 
                  Math.pow(p2.z - p1.z, 2)
              );
             const speed = (dist / dt) * 3.6;
             currentSpeed = speed;
             setCurrentSpeedKmh(speed);
          }
          
          // Update HUD
          if (mode === 'pitching') {
             let cVB = 0, cHB = 0;
             if (p1.breakX !== undefined && p2.breakX !== undefined && p1.breakY !== undefined && p2.breakY !== undefined) {
                 cHB = p1.breakX + (p2.breakX - p1.breakX) * fraction;
                 cVB = p1.breakY + (p2.breakY - p1.breakY) * fraction;
             }
             updateHUD(currentSpeed, cVB, cHB, playbackState === 'slow');
          }

          ballRef.current.visible = true;
        } else {
          const last = points[points.length - 1];
          ballRef.current.position.set(last.x, last.y, last.z);
          
          setCurrentSpeedKmh(0); 

          if (mode === 'pitching' && playbackState === 'normal') {
              setPlaybackState('waiting');
              startTimeRef.current = state.clock.getElapsedTime(); 
          } else {
              setPlaybackState('idle');
              // Ensure final stats shown
              if (mode === 'pitching') {
                  updateHUD(pitchingParams.velocity, finalBreak.v, finalBreak.h, false);
              }
              onAnimationComplete();
          }
        }
      } else if (playbackState === 'idle') {
        if (simulationTrigger === 0) {
           if (mode === 'batting') {
             ballRef.current.position.set(0, 0.5, 0);
           } else {
             const start = points[0];
             if(start) ballRef.current.position.set(start.x, start.y, start.z);
           }
        }
      }
    }
  });

  return (
    <>
      <Stadium />
      
      {mode === 'batting' && (
        <WindIndicator speed={battingParams.windSpeed} direction={battingParams.windDirection} />
      )}
      
      {mode === 'pitching' && (
         <group position={[0, 0, 0]}>
            <StrikeZone3D />
            <mesh position={[pitchingParams.targetX, pitchingParams.targetY, 0]}>
                <sphereGeometry args={[0.03, 16, 16]} />
                <meshBasicMaterial color="#ef4444" opacity={0.8} transparent />
            </mesh>
         </group>
      )}

      <Line 
        points={linePoints} 
        color={mode === 'batting' ? "#ec4899" : "#34d399"} 
        lineWidth={2} 
        opacity={0.8} 
        transparent 
      />

      <group>
        {playbackState !== 'idle' && ballRef.current && (
            <Trail
              width={2} 
              length={mode === 'batting' ? 15 : 8} 
              color={mode === 'batting' ? "#ec4899" : "#34d399"} 
              attenuation={(t) => t * t}
              target={ballRef}
            />
        )}
        
        <mesh ref={ballRef} castShadow={false} position={[0,0.5,0]}>
          <sphereGeometry args={[mode === 'batting' ? 0.35 : 0.05, 32, 32]} /> 
          <meshStandardMaterial color="white" roughness={0.2} metalness={0.1} />
          
          {mode === 'batting' && <LiveSpeedIndicator speed={currentSpeedKmh} visible={playbackState !== 'idle'} />}
        </mesh>
      </group>
      
      {mode === 'batting' && (landingPosition || points.length > 0) && (
        <group position={landingPosition ? [landingPosition.x, 0.05, landingPosition.z] : [points[points.length-1].x, 0.05, points[points.length-1].z]}>
           <Billboard position={[0, 3, 0]}>
              <Text 
                fontSize={4} 
                color="white" 
                anchorX="center" 
                anchorY="bottom"
                outlineWidth={0.2}
                outlineColor="#0f172a"
                >
                {distance.toFixed(1)}m
              </Text>
           </Billboard>
        </group>
      )}
      
      <ContactShadows opacity={0.4} scale={40} blur={2} far={10} resolution={512} color="#000000" />
    </>
  );
};
