
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

// Physics Constants for Batting
const WALL_HEIGHT = 4.0; // m
const COR_GROUND = 0.45; // Coefficient of Restitution (Bounce) on Grass
const COR_WALL = 0.7; // Bounciness of wall
const STOP_VELOCITY = 0.1; // m/s

// Ground Friction Constants
// Previous 0.85 multiplier per frame was too aggressive. 
// Use 0.92 retention for bounce impact.
const FRICTION_BOUNCE = 0.92; 
// Kinetic friction coefficient for rolling ball on grass (approx 0.2 - 0.4)
// Deceleration a = mu * g. 
const MU_ROLLING = 0.25; 

// Define Wall Geometry (Linear Approximation of Stadium.tsx curve)
// x1, z1 to x2, z2
const WALL_SEGMENTS = [
    { x1: -70.71, z1: 70.71, x2: -42.1, z2: 101.6 }, // Left
    { x1: -42.1, z1: 101.6, x2: 0, z2: 122 },        // Left Center
    { x1: 0, z1: 122, x2: 42.1, z2: 101.6 },         // Right Center
    { x1: 42.1, z1: 101.6, x2: 70.71, z2: 70.71 }    // Right
];

/**
 * Batting Trajectory Calculation
 * Now includes Ground Bouncing, Rolling, and Wall Collision
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
  const phi = -sprayAngleDeg * (Math.PI / 180); 

  let vx = v0 * Math.cos(theta) * Math.sin(phi);
  let vy = v0 * Math.sin(theta);
  let vz = v0 * Math.cos(theta) * Math.cos(phi);

  // Wind Vector Calculation
  const windRad = windDirectionDeg * (Math.PI / 180);
  // Note: If windDirectionDeg=90 (Right on UI), we want wind blowing to Right Field (-X).
  // sin(90) = 1. So we need -1 for X.
  const wx = -windSpeedMs * Math.sin(windRad);
  const wz = windSpeedMs * Math.cos(windRad);
  const wy = 0; 

  let x = 0;
  let y = 0.5; 
  let z = 0;
  let t = 0;

  const points: Point3D[] = [];
  let maxHeight = y;
  let carryDistance = 0;
  let hasHitGround = false;

  while (t < maxTime) {
    const prevX = x;
    const prevZ = z;

    points.push({ x, y, z, t });
    if (y > maxHeight) maxHeight = y;

    // Relative Velocity (Airspeed)
    const vrx = vx - wx;
    const vry = vy - wy;
    const vrz = vz - wz;
    const vRelTotal = Math.sqrt(vrx*vrx + vry*vry + vrz*vrz);
    
    let ax = 0, ay = -GRAVITY, az = 0;

    // Apply Aerodynamics if moving through air (and not rolling)
    // If rolling, aerodynamics are negligible compared to friction, but wind might still push.
    // For simplicity, apply drag always but lift only in air.
    if (vRelTotal > 0.1) {
        // Drag
        const Fd = 0.5 * AIR_DENSITY * (vRelTotal ** 2) * DRAG_COEFFICIENT * BALL_AREA;
        const ad = Fd / BALL_MASS;
        const axDrag = -ad * (vrx / vRelTotal);
        const ayDrag = -ad * (vry / vRelTotal);
        const azDrag = -ad * (vrz / vRelTotal);

        // Lift (only applies when in air)
        let axLift = 0, ayLift = 0;
        if (y > 0.05) { // Slightly above ground
             const Fl = 0.5 * AIR_DENSITY * (vRelTotal ** 2) * BATTING_LIFT_COEFFICIENT * BALL_AREA;
             const al = Fl / BALL_MASS;
             // Simplified Lift Direction (Upwards relative to horizontal motion)
             const vHorizontal = Math.sqrt(vx*vx + vz*vz);
             const vTotal = Math.sqrt(vHorizontal*vHorizontal + vy*vy);
             if(vTotal > 0) ayLift = al * (vHorizontal / vTotal);
        }

        ax = axDrag + axLift;
        ay = -GRAVITY + ayDrag + ayLift;
        az = azDrag;
    }

    // Update Velocity & Position
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;

    // --- COLLISION DETECTION ---

    // 1. Wall Collision (Outfield Fence)
    // Check only if we are "deep" enough (z > 60m to save perf) and low enough (< Wall Height)
    if (z > 60 && y >= 0 && y <= WALL_HEIGHT) {
        for (const seg of WALL_SEGMENTS) {
            // Check intersection of Line(prevX,prevZ -> x,z) with Segment(x1,z1 -> x2,z2)
            const intersect = getLineIntersection(prevX, prevZ, x, z, seg.x1, seg.z1, seg.x2, seg.z2);
            if (intersect) {
                // Hit the wall!
                
                // Wall Vector
                const dx = seg.x2 - seg.x1;
                const dz = seg.z2 - seg.z1;
                const len = Math.sqrt(dx*dx + dz*dz);
                
                // Calculate Midpoint of segment to determine "Inward" direction
                const midX = (seg.x1 + seg.x2) / 2;
                const midZ = (seg.z1 + seg.z2) / 2;

                // Normal Calculation (Rotate 90 deg)
                // Try (-dz, dx) first
                let nx = -dz / len;
                let nz = dx / len;

                // If Normal dot Midpoint > 0, it points Outwards (away from origin). Flip it.
                // (Assuming origin (0,0) is inside)
                if (nx * midX + nz * midZ > 0) {
                    nx = -nx;
                    nz = -nz;
                }

                // Reflection: Check if velocity is opposing normal (entering wall)
                const vDotN = vx * nx + vz * nz;
                
                if (vDotN < 0) {
                    // Reflect: V_new = V - 2(V . N)N
                    vx = (vx - 2 * vDotN * nx) * COR_WALL;
                    vz = (vz - 2 * vDotN * nz) * COR_WALL;
                    
                    // Dampen Y slightly if it hits the wall
                    vy *= 0.8;

                    // Anti-sticking: Push ball slightly off the wall (Inwards)
                    // Use intersection point + offset
                    x = intersect.x + nx * 0.2;
                    z = intersect.z + nz * 0.2;
                }
                
                break; // Handled collision
            }
        }
    }

    // 2. Ground Collision
    if (y <= 0) {
        y = 0; // Clamp
        
        // Record carry distance on first bounce
        if (!hasHitGround) {
            hasHitGround = true;
            carryDistance = Math.sqrt(x*x + z*z);
        }

        // If vertical velocity is very low, treat as rolling
        if (Math.abs(vy) < 1.0) {
            // Rolling phase
            vy = 0;
            
            // Apply Rolling Friction (Kinetic Friction)
            // Deceleration = mu * g
            const speedXZ = Math.sqrt(vx*vx + vz*vz);
            
            if (speedXZ > 0) {
                const deceleration = MU_ROLLING * GRAVITY; // ~ 2.5 m/s^2
                const speedLoss = deceleration * dt;
                
                if (speedXZ <= speedLoss + STOP_VELOCITY) {
                    vx = 0;
                    vz = 0;
                    break; // Stopped
                } else {
                    // Reduce speed by constant amount
                    const newSpeed = speedXZ - speedLoss;
                    const ratio = newSpeed / speedXZ;
                    vx *= ratio;
                    vz *= ratio;
                }
            } else {
                break; // Already stopped
            }

        } else {
            // Bouncing phase
            vy = -vy * COR_GROUND; 
            
            // Friction on impact (Momentary loss of horizontal speed)
            vx *= FRICTION_BOUNCE;
            vz *= FRICTION_BOUNCE;
        }
    }
  }

  // If simulation ended in air (e.g. over the wall or time out), calc distance
  if (!hasHitGround) {
      carryDistance = Math.sqrt(x*x + z*z);
  }

  return {
    points,
    distance: carryDistance,
    maxHeight,
    hangTime: t
  };
};

// Helper: Line Segment Intersection
function getLineIntersection(p0_x: number, p0_y: number, p1_x: number, p1_y: number, p2_x: number, p2_y: number, p3_x: number, p3_y: number) {
    const s1_x = p1_x - p0_x;
    const s1_y = p1_y - p0_y;
    const s2_x = p3_x - p2_x;
    const s2_y = p3_y - p2_y;

    const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
    const t = ( s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);

    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return { x: p0_x + (t * s1_x), z: p0_y + (t * s1_y) };
    }
    return null;
}


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

    // Ground check (bounce or stop) - simplified to stop for pitching
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
