
const MAX_EXPECTED = {
    LAT_STD: 0.5,       // g
    YAW_STD: 30 * (Math.PI / 180), // rad/s, converting from 30 deg/s
    JERK_AVG: 3,        // m/s³
    JERK_MAX: 8,        // m/s³
    LONG_MIN: -6,       // m/s²
    LONG_MAX: 4,        // m/s²
};

const G_TO_MS2 = 9.81; // Conversion factor from g to m/s²

// Helper to calculate standard deviation
function std(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(variance);
}

// Helper to normalize a value
function norm(x, max_expected) {
    return Math.max(0, Math.min(x / max_expected, 1));
}

// 1. Compute Core Signals
function computeCoreSignals(sensorWindow, timeDelta) {
    const lateral_accel = sensorWindow.map(d => d.accel.x * G_TO_MS2);
    const forward_accel = sensorWindow.map(d => d.accel.y * G_TO_MS2);
    const yaw_rate = sensorWindow.map(d => d.gyro.z);

    const accel_magnitudes = forward_accel.map((val, i) => {
        // Simple magnitude for jerk calculation
        return Math.sqrt(val**2 + lateral_accel[i]**2);
    });

    const jerks = [];
    for (let i = 1; i < accel_magnitudes.length; i++) {
        const jerk = (accel_magnitudes[i] - accel_magnitudes[i-1]) / timeDelta;
        jerks.push(Math.abs(jerk));
    }

    return {
        lat_std: std(lateral_accel),
        yaw_std: std(yaw_rate),
        long_min: Math.min(...forward_accel),
        long_max: Math.max(...forward_accel),
        jerk_avg: jerks.length > 0 ? jerks.reduce((a, b) => a + b, 0) / jerks.length : 0,
        jerk_max: jerks.length > 0 ? Math.max(...jerks) : 0,
    };
}

// 2. Build Sub-Scores
function buildSubScores(signals) {
    const swerve = 0.5 * norm(signals.lat_std, MAX_EXPECTED.LAT_STD) + 0.5 * norm(signals.yaw_std, MAX_EXPECTED.YAW_STD);
    const brake = norm(-signals.long_min, -MAX_EXPECTED.LONG_MIN); // Note: -long_min is positive
    const accel = norm(signals.long_max, MAX_EXPECTED.LONG_MAX);
    const jerk_score = 0.7 * norm(signals.jerk_avg, MAX_EXPECTED.JERK_AVG) + 0.3 * norm(signals.jerk_max, MAX_EXPECTED.JERK_MAX);

    return { swerve, brake, accel, jerk_score };
}

// 3. Combine into ONE risk score
function combineScores(subScores, drowsinessRisk) {
    const drivingRisk =
        0.35 * subScores.swerve +
        0.25 * subScores.brake +
        0.15 * subScores.accel +
        0.25 * subScores.jerk_score;
        
    // 60% weight to drowsiness, 40% weight to driving signals
    const combinedRisk = 0.40 * drivingRisk + 0.60 * (drowsinessRisk / 100);
    return combinedRisk;
}

// Main function to calculate the risk score
export function calculateRiskScore(sensorWindow, lastRiskScore, drowsinessRisk = 0, timeDelta = 0.1) { // 100ms default interval
    if (sensorWindow.length < 2) {
        return lastRiskScore !== undefined ? lastRiskScore : 0;
    }

    const signals = computeCoreSignals(sensorWindow, timeDelta);
    const subScores = buildSubScores(signals);
    const risk_0_1 = combineScores(subScores, drowsinessRisk);

    // 4. Smooth the final score
    const smoothedRisk = 0.8 * (lastRiskScore / 100) + 0.2 * risk_0_1;

    // 5. Scale to 0-100
    return Math.round(smoothedRisk * 100);
}
