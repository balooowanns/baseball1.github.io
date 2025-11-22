
import { Point3D, TrajectoryResult, PitchingParams } from '../types';

// Constants
const GRAVITY = 9.81; // m/s^2
const AIR_DENSITY = 1.225; // kg/m^3
const BALL_MASS = 0.145; // kg
const BALL_RADIUS = 0.037; // m (approx 74mm diameter)
const BALL_AREA = Math.PI * (BALL_RADIUS ** 2);
const DRAG_COEFFICIENT = 0.30; 
const BATTING_LIFT_COEFFICIENT = 0.15; 

// Distance from Pitcher's plate to Home Plate apex (approx)
const MOUND_DISTANCE = 18.44; // m
const CATCHER_DEPTH = 1.5; // m (Behind home plate)

/**
 * Existing Batting Trajectory Calculation
 * Updated to include Wind parameters
 */
export const calculateTrajectory = (
  velocityKmh: number,
  launchAngleDeg: number,
  sprayAngleDeg: number,
  windSpeedMs: number = 0,
  windDirectionDeg: number = 0
): TrajectoryResult => {
  const dt = 0.01; 
  const maxTime = 20; 

  const v0 = velocityKmh * (1000 / 3600); 
  const theta = launchAngleDeg * (Math.PI / 180); 
  
  // Negate the spray angle because the camera is looking from -Z towards +Z (reversed standard view).
  // In this view, +X is Left. We want Positive Slider (Right) -> Right Field (-X).
  // sin(-phi) = -sin(phi).
  const phi = -sprayAngleDeg * (Math.PI / 180); 

  let vx = v0 * Math.cos(theta) * Math.sin(phi);
  let vy = v0 * Math.sin(theta);
  let vz = v0 * Math.cos(theta) * Math.cos(phi);

  // Wind Vector Calculation
  // windDirectionDeg: 0 = Tailwind (to Center/+Z), 90 = Crosswind to Right Field (-X), 180 = Headwind
  // In world coordinates:
  // +Z is Center Field.
  // -X is Right Field.
  // 0 deg (Up) -> +Z
  // 90 deg (Right) -> -X
  const windRad = windDirectionDeg * (Math.PI / 180);
  
  // Note: If windDirectionDeg=90 (Right on UI), we want wind blowing to Right Field (-X).
  // sin(90) = 1. So we need -1 for X.
  const wx = -windSpeedMs * Math.sin(windRad);
  const wz = windSpeedMs * Math.cos(windRad);
  const wy = 0; // Assuming horizontal wind only

  let x = 0;
  let y = 0.5; 
  let z = 0;
  let t = 0;

  const points: Point3D[] = [];
  let maxHeight = y;

  while (y >= 0 && t < maxTime) {
    points.push({ x, y, z, t });
    if (y > maxHeight) maxHeight = y;

    // Relative Velocity (Airspeed) = Ball Velocity - Wind Velocity
    const vrx = vx - wx;
    const vry = vy - wy;
    const vrz = vz - wz;

    const vRelTotal = Math.sqrt(vrx*vrx + vry*vry + vrz*vrz);
    
    let ax = 0, ay = -GRAVITY, az = 0;

    if (vRelTotal > 0) {
        // Drag Force depends on Relative Velocity
        // Fd direction is opposite to Relative Velocity
        const Fd = 0.5 * AIR_DENSITY * (vRelTotal ** 2) * DRAG_COEFFICIENT * BALL_AREA;
        const ad = Fd / BALL_MASS;
        
        const axDrag = -ad * (vrx / vRelTotal);
        const ayDrag = -ad * (vry / vRelTotal);
        const azDrag = -ad * (vrz / vRelTotal);

        // Simple Lift for Batting (Backspin approximation)
        // Lift acts perpendicular to velocity vector. 
        // For simplicity in batting, we keep it relative to ground speed direction or simplify
        // but accurate physics would use vRel for magnitude.
        // Let's scale Lift by vRel^2 for magnitude
        const Fl = 0.5 * AIR_DENSITY * (vRelTotal ** 2) * BATTING_LIFT_COEFFICIENT * BALL_AREA;
        const al = Fl / BALL_MASS;
        
        // Apply lift roughly upwards/backwards relative to trajectory
        // Simplified: Lift acts mostly Up (+Y) and against forward motion slightly
        // Using ground velocity for direction to keep the arc stable visually
        const vGroundTotal = Math.sqrt(vx*vx + vy*vy + vz*vz);
        const horizontalSpeed = Math.sqrt(vx*vx + vz*vz);
        
        // Lift component (simplified)
        const ayLift = al * (horizontalSpeed / vGroundTotal);

        ax = axDrag;
        ay = -GRAVITY + ayDrag + ayLift;
        az = azDrag;
    }

    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;
  }

  if (points.length > 0 && y < 0) {
      const last = points[points.length - 1];
      points.push({ x, y: 0, z, t });
  } else if (points.length === 0) {
      points.push({ x:0, y:0, z:0, t:0});
  }

  const distance = Math.sqrt(x*x + z*z);

  return {
    points,
    distance,
    maxHeight,
    hangTime: t
  };
};

/**
 * New Pitching Trajectory Calculation
 * Uses Release Angles (H/V) for initial direction.
 * Uses Spin Efficiency for Magnus Force magnitude.
 */
export const calculatePitchTrajectory = (params: PitchingParams): TrajectoryResult => {
  // Safety Check: If velocity is 0 or negative, return empty result immediately
  if (params.velocity <= 0.1) {
      return {
          points: [{x: params.releaseSide/100, y: params.releaseHeight, z: MOUND_DISTANCE - params.extension/100, t: 0}],
          distance: 0,
          maxHeight: params.releaseHeight,
          hangTime: 0,
          finalPosition: { x: params.releaseSide/100, y: params.releaseHeight },
          plateCrossing: { x: params.releaseSide/100, y: params.releaseHeight }
      };
  }

  const dt = 0.002; // Fine time step for pitching accuracy
  const MAX_SIMULATION_TIME = 5.0; // Failsafe time limit (seconds)
  
  // Convert units
  const v0 = params.velocity * (1000 / 3600); // m/s
  const extensionM = params.extension / 100; // cm -> m
  const sideM = params.releaseSide / 100; // cm -> m
  const heightM = params.releaseHeight; // m

  // Starting Position
  let startZ = MOUND_DISTANCE - extensionM;
  let x = sideM;
  let y = heightM;
  let z = startZ;
  let t = 0;

  // Initial Velocity Vector based on Angles
  const hRad = params.hAngle * (Math.PI / 180);
  const vRad = params.vAngle * (Math.PI / 180);

  // Construct direction vector.
  // Main component is -Z.
  let vx = v0 * Math.sin(hRad) * Math.cos(vRad);
  let vy = v0 * Math.sin(vRad);
  let vz = -v0 * Math.cos(hRad) * Math.cos(vRad);

  // True Spin Calculation
  const trueSpin = params.spinRate * (params.spinEfficiency / 100);

  // Calculate Angular Velocity (rad/s) for Magnus calculation
  const omega = (trueSpin * 2 * Math.PI) / 60;

  const points: Point3D[] = [];
  let maxHeight = y;
  let plateCrossing: { x: number, y: number } | undefined;

  // Simulation Loop (until ball passes catcher at z = -CATCHER_DEPTH)
  while (z > -CATCHER_DEPTH) {
    const prevX = x;
    const prevY = y;
    const prevZ = z;

    points.push({ x, y, z, t });
    if (y > maxHeight) maxHeight = y;
    
    // Failsafe break to prevent freezing
    if (t > MAX_SIMULATION_TIME) break;

    // Ground check (bounce or stop) - simplified to stop
    if (y <= 0) break;

    const vTotal = Math.sqrt(vx*vx + vy*vy + vz*vz);
    
    // 1. Drag Force
    const Fd = 0.5 * AIR_DENSITY * (vTotal ** 2) * DRAG_COEFFICIENT * BALL_AREA;
    const ad = Fd / BALL_MASS;
    const axDrag = -ad * (vx / vTotal);
    const ayDrag = -ad * (vy / vTotal);
    const azDrag = -ad * (vz / vTotal);

    // 2. Magnus Force (Lift/Side)
    const S = (BALL_RADIUS * omega) / vTotal;
    // Correct Lift Coefficient based on Spin Factor (S)
    // Typical baseball Cl ranges from 0.1 to 0.3 depending on S
    // Formula approx: Cl = 1 / (2.32 + (0.4/S)) is one model, or simpler linear models.
    // Using a fit for baseball: Cl = 0.30 * S approx for typical range
    const Cl = S; 

    const liftForceMag = 0.5 * AIR_DENSITY * (vTotal ** 2) * BALL_AREA * Cl;

    const radAxis = params.spinDirection * (Math.PI / 180);
    
    const fMagX = liftForceMag * Math.sin(radAxis);
    const fMagY = liftForceMag * Math.cos(radAxis);
    
    const axMag = fMagX / BALL_MASS;
    const ayMag = fMagY / BALL_MASS;
    
    // Total Acceleration
    const ax = axDrag + axMag;
    const ay = -GRAVITY + ayDrag + ayMag;
    const az = azDrag;

    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;

    // Check if we just crossed Home Plate (z=0)
    if (prevZ >= 0 && z < 0) {
        // Interpolate to find exact x,y at z=0
        const fraction = (0 - prevZ) / (z - prevZ);
        plateCrossing = {
            x: prevX + (x - prevX) * fraction,
            y: prevY + (y - prevY) * fraction
        };
    }
  }

  // Final point
  points.push({ x, y, z, t });

  return {
    points,
    distance: MOUND_DISTANCE - z, 
    maxHeight,
    hangTime: t,
    finalPosition: { x, y },
    plateCrossing: plateCrossing || { x, y } // Fallback if it didn't reach plate
  };
};

/**
 * Solver for Inverse Kinematics
 * Finds the required hAngle and vAngle to hit a specific Target (x, y) at the plate.
 */
export const solvePitchAngles = (params: PitchingParams, targetX: number, targetY: number): { hAngle: number, vAngle: number } => {
  // Safety check
  if (params.velocity <= 0.1) {
      return { hAngle: params.hAngle, vAngle: params.vAngle };
  }

  // Create a mutable copy of params to use in the solver
  let currentParams = { ...params };
  
  // Initial Guess: Linear path (Geometric angle)
  const distZ = 18.44 - (params.extension / 100);
  const relX = params.releaseSide / 100;
  const relY = params.releaseHeight;
  
  // Basic trigonometry for straight line
  let hAngle = Math.atan2(targetX - relX, distZ) * (180 / Math.PI);
  let vAngle = Math.atan2(targetY - relY, distZ) * (180 / Math.PI);

  // Iterative Solver (Simple Gradient Descent / Newton-like)
  // Usually converges in 3-5 iterations
  for (let i = 0; i < 10; i++) {
    currentParams.hAngle = hAngle;
    currentParams.vAngle = vAngle;
    
    const result = calculatePitchTrajectory(currentParams);
    
    // IMPORTANT: We must optimize for the position AT THE PLATE (z=0), not the final catcher position
    const crossing = result.plateCrossing || result.finalPosition;

    if (!crossing) break;
    
    const actualX = crossing.x;
    const actualY = crossing.y;
    
    const errorX = targetX - actualX;
    const errorY = targetY - actualY;
    
    // Check convergence (e.g. within 0.5mm)
    if (Math.abs(errorX) < 0.0005 && Math.abs(errorY) < 0.0005) {
        break;
    }
    
    // Adjustment factors
    const gain = 2.5;
    
    hAngle += errorX * gain;
    vAngle += errorY * gain;
  }
  
  return { hAngle, vAngle };
};
