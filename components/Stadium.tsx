import React, { useMemo } from 'react';
import * as THREE from 'three';
import { DoubleSide } from 'three';
import { Text, Billboard } from '@react-three/drei';
import { STRIKE_ZONE_CONFIG } from '../types';

export const Stadium: React.FC = () => {
  
  // Generate Custom Outfield Wall Geometry
  const wallGeometry = useMemo(() => {
    // Define key points for the outfield fence based on specific distances
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-70.71, 0, 70.71),  // Left Pole
      new THREE.Vector3(-42.1, 0, 101.6),   // Left Center
      new THREE.Vector3(0, 0, 122),         // Center
      new THREE.Vector3(42.1, 0, 101.6),    // Right Center
      new THREE.Vector3(70.71, 0, 70.71),   // Right Pole
    ]);

    const points = curve.getPoints(64);
    const vertices: number[] = [];
    
    // Create vertical wall ribbon
    for (let i = 0; i < points.length - 1; i++) {
       const p1 = points[i];
       const p2 = points[i+1];
       
       // Triangle 1 (Bottom-Left, Bottom-Right, Top-Left)
       vertices.push(p1.x, 0, p1.z);
       vertices.push(p2.x, 0, p2.z);
       vertices.push(p1.x, 4, p1.z); // Height 4m
       
       // Triangle 2 (Top-Left, Bottom-Right, Top-Right)
       vertices.push(p1.x, 4, p1.z);
       vertices.push(p2.x, 0, p2.z);
       vertices.push(p2.x, 4, p2.z);
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Generate Home Plate Shape (Pentagon)
  const homePlateShape = useMemo(() => {
    const s = new THREE.Shape();
    const hw = STRIKE_ZONE_CONFIG.WIDTH / 2;
    const side = STRIKE_ZONE_CONFIG.SIDE_HEIGHT;
    
    // Calculated tip depth to match diagonal
    // diagonal^2 = hw^2 + tip^2
    const diag = STRIKE_ZONE_CONFIG.DIAGONAL;
    const tipExtension = Math.sqrt(diag*diag - hw*hw); 
    const totalDepth = side + tipExtension;

    // Shape defined pointing Negative Y in 2D space
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, -side);
    s.lineTo(0, -totalDepth);
    s.lineTo(-hw, -side);
    s.closePath();
    return s;
  }, []);

  return (
    <group>
      {/* Ground Plane (Grass) - Extended to cover view */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 50]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#3a9d23" roughness={0.8} />
      </mesh>
      
      {/* Dirt Infield */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 18.44]}>
         <circleGeometry args={[29, 64]} />
         <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      
      {/* Diamond Grass */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI/4]} position={[0, 0.01, 18.44]}>
         <planeGeometry args={[25, 25]} />
         <meshStandardMaterial color="#3a9d23" />
      </mesh>

      {/* Bases & Mound */}
      <group position={[0, 0.02, 0]}>
         {/* Home Plate */}
         {/* Rotated to face Catcher (Negative Z) and Up (Positive Y) */}
         <mesh rotation={[-Math.PI/2, 0, Math.PI]} position={[0,0,0]}>
             <shapeGeometry args={[homePlateShape]} />
             <meshStandardMaterial color="white" />
         </mesh>
         
         {/* Mound */}
         <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 18.44]}>
             <circleGeometry args={[2.5, 32]} />
             <meshStandardMaterial color="#8B4513" />
         </mesh>
         {/* Pitcher's Plate (Rubber) - Swapped dimensions to be 60cm wide x 15cm deep */}
         <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.21, 18.44]}>
            <planeGeometry args={[0.6, 0.15]} />
            <meshStandardMaterial color="white" />
         </mesh>
         {/* Bases (Approx 27.4m apart) */}
         <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[19.4, 0, 19.4]}>
             <planeGeometry args={[0.8, 0.8]} />
             <meshStandardMaterial color="white" />
         </mesh>
         <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[-19.4, 0, 19.4]}>
             <planeGeometry args={[0.8, 0.8]} />
             <meshStandardMaterial color="white" />
         </mesh>
         <mesh rotation={[-Math.PI/2, 0, Math.PI/4]} position={[0, 0, 38.8]}>
             <planeGeometry args={[0.8, 0.8]} />
             <meshStandardMaterial color="white" />
         </mesh>
      </group>

      {/* Foul Lines (100m length approx) */}
      <mesh position={[35, 0.02, 35]} rotation={[-Math.PI/2, 0, -Math.PI/4]}>
          <planeGeometry args={[100, 0.15]} />
          <meshBasicMaterial color="white" />
      </mesh>
      <mesh position={[-35, 0.02, 35]} rotation={[-Math.PI/2, 0, Math.PI/4]}>
          <planeGeometry args={[100, 0.15]} />
          <meshBasicMaterial color="white" />
      </mesh>

      {/* Custom Outfield Wall */}
      <mesh geometry={wallGeometry} material={new THREE.MeshStandardMaterial({ color: '#064e3b', side: DoubleSide })} />
      
      {/* Foul Poles (Yellow) */}
      <mesh position={[-70.71, 10, 70.71]}>
          <cylinderGeometry args={[0.2, 0.2, 20]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[70.71, 10, 70.71]}>
          <cylinderGeometry args={[0.2, 0.2, 20]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.5} />
      </mesh>

      {/* Distance Markers - Wrapped in Billboard to always face camera */}
      <Billboard position={[0, 2.5, 121.9]}>
          <Text fontSize={1.5} color="white" anchorX="center" anchorY="middle">122m</Text>
      </Billboard>
      <Billboard position={[-42, 2.5, 101.5]}>
          <Text fontSize={1.5} color="white" anchorX="center" anchorY="middle">110m</Text>
      </Billboard>
      <Billboard position={[42, 2.5, 101.5]}>
          <Text fontSize={1.5} color="white" anchorX="center" anchorY="middle">110m</Text>
      </Billboard>
      <Billboard position={[-69, 2.5, 70]}>
          <Text fontSize={1.5} color="white" anchorX="center" anchorY="middle">100m</Text>
      </Billboard>
       <Billboard position={[69, 2.5, 70]}>
          <Text fontSize={1.5} color="white" anchorX="center" anchorY="middle">100m</Text>
      </Billboard>
      
      {/* Scoreboard (Placed far back in Center) */}
      <group position={[0, 12, 140]}>
         <mesh position={[0, 0, 0]}>
             <boxGeometry args={[30, 16, 2]} />
             <meshStandardMaterial color="#1e293b" />
         </mesh>
         <mesh position={[0, 0, -1.1]}>
             <planeGeometry args={[28, 14]} />
             <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.2} />
         </mesh>
      </group>

      {/* Stadium Lights (Placed at corners) */}
      <group position={[-90, 0, 90]} rotation={[0, -Math.PI/4, 0]}>
          <mesh position={[0, 25, 0]}>
            <cylinderGeometry args={[1, 1.5, 50]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
          <mesh position={[0, 50, 0]} rotation={[Math.PI/4, 0, 0]}>
            <boxGeometry args={[12, 8, 2]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
      </group>
       <group position={[90, 0, 90]} rotation={[0, Math.PI/4, 0]}>
          <mesh position={[0, 25, 0]}>
            <cylinderGeometry args={[1, 1.5, 50]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
          <mesh position={[0, 50, 0]} rotation={[Math.PI/4, 0, 0]}>
            <boxGeometry args={[12, 8, 2]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
      </group>
    </group>
  );
};
