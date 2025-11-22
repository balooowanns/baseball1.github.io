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

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ 
  mode,
  battingParams, 
  pitchingParams,
  onResultUpdate, 
  simulationTrigger,
  onAnimationComplete
}) => {
  return (
    <div className="w-full h-full bg-gradient-to-b from-sky-400 via-sky-300 to-sky-100">
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

    // Shape defined pointing "Down" in 2D Y axis
    // When rotated X 90deg:
    // Local X -> World X
    // Local Y -> World Z (points Forward to pitcher if Y positive, Backwards to catcher if Y negative)
    // Local Z -> World -Y (points Down)
    
    // We want shape to point to Catcher (-Z). 
    // So we need Y coordinate to map to -Z.
    // X(90): z' = y.
    // So if we want z' < 0, we need y < 0.
    
    s.moveTo(-hw, 0);          // Front Left
    s.lineTo(hw, 0);           // Front Right
    s.lineTo(hw, -side);       // Side Right
    s.lineTo(0, -totalDepth);  // Back Tip
    s.lineTo(-hw, -side);      // Side Left
    s.closePath();
    return s;
  }, []);

  const extrudeSettings = useMemo(() => ({
    depth: STRIKE_ZONE_CONFIG.TOP - STRIKE_ZONE_CONFIG.BOTTOM, // 1.05 - 0.40 = 0.65m
    bevelEnabled: false,
  }), []);

  return (
    // Rotation [Math.PI / 2, 0, 0]:
    // 1. Extrusion happens along Local Z. Rotated, it points World -Y (Down).
    // 2. 2D Shape Y axis maps to World Z axis. Negative Y in shape -> Negative Z (Towards Catcher).
    // Position is at Top (1.05m). Extrudes down to 0.40m.
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

const SceneContent: React.FC<SimulationCanvasProps> = ({ 
  mode,
  battingParams, 
  pitchingParams,
  onResultUpdate, 
  simulationTrigger,
  onAnimationComplete 
}) => {
  const ballRef = useRef<any>(null);
  const startTimeRef = useRef(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Memoize calculation based on active mode
  const { points, distance, maxHeight, hangTime, finalPosition, plateCrossing } = useMemo(() => {
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

  // Update parent results
  useEffect(() => {
    onResultUpdate(distance, maxHeight, hangTime, finalPosition, plateCrossing);
  }, [distance, maxHeight, hangTime, finalPosition, plateCrossing, onResultUpdate]);

  // Convert points for Line component
  const linePoints = useMemo(() => {
    return points.map(p => new Vector3(p.x, p.y, p.z));
  }, [points]);

  // Handle Play Trigger
  useEffect(() => {
    if (simulationTrigger > 0) {
      setIsAnimating(true);
      startTimeRef.current = -1; 
    }
  }, [simulationTrigger]);

  // Animation Loop
  useFrame((state) => {
    if (ballRef.current) {
      if (isAnimating && points.length > 1) {
        if (startTimeRef.current < 0) {
          startTimeRef.current = state.clock.getElapsedTime();
        }

        const elapsed = state.clock.getElapsedTime() - startTimeRef.current;
        const totalDuration = points[points.length - 1].t;

        if (elapsed <= totalDuration) {
          // Use fixed time step from physics engine logic for lerping
          const dt = mode === 'batting' ? 0.01 : 0.002;
          const rawIndex = elapsed / dt;
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
          
          ballRef.current.visible = true;
        } else {
          setIsAnimating(false);
          const last = points[points.length - 1];
          ballRef.current.position.set(last.x, last.y, last.z);
          onAnimationComplete();
        }
      } else if (!isAnimating) {
        // Reset Position logic
        if (simulationTrigger === 0) {
           if (mode === 'batting') {
             ballRef.current.position.set(0, 0.5, 0);
           } else {
             // Start at pitcher release
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
      
      {/* Pitching Specific: Strike Zone & Target */}
      {mode === 'pitching' && (
        <group position={[0, 0, 0]}>
             {/* 3D Pentagonal Prism Strike Zone */}
             <StrikeZone3D />

             {/* Visual Target Indicator (Where user aimed) */}
             <mesh position={[pitchingParams.targetX, pitchingParams.targetY, 0]}>
                <sphereGeometry args={[0.03, 16, 16]} />
                <meshBasicMaterial color="#ef4444" opacity={0.8} transparent />
             </mesh>
        </group>
      )}

      {/* Trajectory Path */}
      <Line 
        points={linePoints} 
        color={mode === 'batting' ? "#fbbf24" : "#34d399"} 
        lineWidth={2} 
        opacity={0.5} 
        transparent 
      />

      {/* The Ball */}
      <group>
        {isAnimating && ballRef.current && (
            <Trail
              width={2} 
              length={mode === 'batting' ? 15 : 8} 
              color={mode === 'batting' ? "#fbbf24" : "#34d399"}
              attenuation={(t) => t * t}
              target={ballRef}
            />
        )}
        
        <mesh ref={ballRef} castShadow position={[0,0.5,0]}>
          <sphereGeometry args={[mode === 'batting' ? 0.35 : 0.037 * 2, 32, 32]} /> 
          <meshStandardMaterial color="white" roughness={0.2} metalness={0.1} />
        </mesh>
      </group>
      
      {/* Landing Spot Indicator (Batting) */}
      {mode === 'batting' && points.length > 0 && (
        <group position={[points[points.length-1].x, 0.05, points[points.length-1].z]}>
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
