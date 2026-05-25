'use strict';
/**
 * satpos.js — Pure-JS GPS satellite sky-view engine
 * Ported from gps-sdr-sim/gpssim.c (Keplerian propagator + RINEX 2/3 parser)
 */
const fs = require('fs');

// ── Constants ──────────────────────────────────────────────────────────────
const PI            = Math.PI;
const WGS84_RADIUS  = 6378137.0;
const WGS84_ECC     = 0.0818191908426;
const GM_EARTH      = 3.986005e14;
const OMEGA_EARTH   = 7.2921151467e-5;
const SEC_IN_WEEK   = 604800.0;
const SEC_IN_HALFWK = 302400.0;

// ── Coordinate helpers ─────────────────────────────────────────────────────
function llh2xyz(latRad, lonRad, alt) {
    const e2   = WGS84_ECC * WGS84_ECC;
    const clat = Math.cos(latRad), slat = Math.sin(latRad);
    const clon = Math.cos(lonRad), slon = Math.sin(lonRad);
    const n    = WGS84_RADIUS / Math.sqrt(1.0 - e2 * slat * slat);
    const nph  = n + alt;
    return [nph * clat * clon, nph * clat * slon, ((1.0 - e2) * n + alt) * slat];
}

function ltcmat(latRad, lonRad) {
    const sl = Math.sin(latRad), cl = Math.cos(latRad);
    const so = Math.sin(lonRad), co = Math.cos(lonRad);
    return [
        [-sl * co, -sl * so,  cl],
        [-so,       co,       0.0],
        [ cl * co,  cl * so,  sl]
    ];
}

function ecef2neu(dx, T) {
    return [
        T[0][0]*dx[0] + T[0][1]*dx[1] + T[0][2]*dx[2],
        T[1][0]*dx[0] + T[1][1]*dx[1] + T[1][2]*dx[2],
        T[2][0]*dx[0] + T[2][1]*dx[1] + T[2][2]*dx[2]
    ];
}

function neu2azel(neu) {
    let az = Math.atan2(neu[1], neu[0]);
    if (az < 0) az += 2.0 * PI;
    const el = Math.atan2(neu[2], Math.sqrt(neu[0]*neu[0] + neu[1]*neu[1]));
    return { az: az * 180 / PI, el: el * 180 / PI };
}

// ── GPS time ───────────────────────────────────────────────────────────────
function date2gps(y, mo, d, hh, mm, ss) {
    const doy = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const ye = y - 1980;
    let lpdays = Math.floor(ye / 4) + 1;
    if (ye % 4 === 0 && mo <= 2) lpdays--;
    const de = ye * 365 + doy[mo - 1] + d + lpdays - 6;
    return { week: Math.floor(de / 7), sec: (de % 7) * 86400 + hh * 3600 + mm * 60 + ss };
}

function parseTimeStr(str) {
    // Accepts "YYYY/MM/DD,HH:mm:ss"
    const [dt, tm] = str.split(',');
    const [y, mo, d]    = dt.split('/').map(Number);
    const [hh, mm, ss]  = tm.split(':').map(Number);
    return date2gps(y, mo, d, hh, mm, ss);
}

// ── Keplerian propagator (mirrors satpos() in gpssim.c) ───────────────────
function satposECEF(eph, gpsWeek, gpsSec) {
    let tk = gpsSec - eph.toe_sec;
    // Account for week crossover
    const weekDiff = (gpsWeek - eph.toe_week) * SEC_IN_WEEK;
    tk += weekDiff;
    if (tk >  SEC_IN_HALFWK) tk -= SEC_IN_WEEK;
    if (tk < -SEC_IN_HALFWK) tk += SEC_IN_WEEK;

    const A  = eph.sqrta * eph.sqrta;
    const n0 = Math.sqrt(GM_EARTH / (A * A * A));
    const n  = n0 + eph.deltan;
    const mk = eph.m0 + n * tk;

    // Solve Kepler's equation E = M + e*sin(E) iteratively
    let ek = mk;
    for (let i = 0; i < 12; i++) {
        ek = ek - (ek - eph.ecc * Math.sin(ek) - mk) / (1.0 - eph.ecc * Math.cos(ek));
    }
    const cek = Math.cos(ek), sek = Math.sin(ek);
    const OneMinusecosE = 1.0 - eph.ecc * cek;

    const pk   = Math.atan2(Math.sqrt(1.0 - eph.ecc * eph.ecc) * sek, cek - eph.ecc) + eph.aop;
    const s2pk = Math.sin(2.0 * pk), c2pk = Math.cos(2.0 * pk);

    const uk = pk  + eph.cus * s2pk + eph.cuc * c2pk;
    const rk = A * OneMinusecosE + eph.crc * c2pk + eph.crs * s2pk;
    const ik = eph.inc0 + eph.idot * tk + eph.cic * c2pk + eph.cis * s2pk;

    const xpk = rk * Math.cos(uk), ypk = rk * Math.sin(uk);
    const ok  = eph.omg0 + tk * eph.omgkdot - OMEGA_EARTH * eph.toe_sec;
    const cok = Math.cos(ok), sok = Math.sin(ok);
    const cik = Math.cos(ik), sik = Math.sin(ik);

    return [
        xpk * cok - ypk * cik * sok,
        xpk * sok + ypk * cik * cok,
        ypk * sik
    ];
}

// ── RINEX helpers ──────────────────────────────────────────────────────────
const parseD = s => parseFloat((s || '').trim().replace(/[Dd]/g, 'E'));

// ── RINEX 3 → RINEX 2 conversion ──────────────────────────────────────────
function rinex3to2(content) {
    const lines = content.split(/\r?\n/);
    const out   = [];
    let inHeader = true;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (inHeader) {
            if (line.includes('RINEX VERSION / TYPE')) {
                out.push('     2.11           N: NAVIGATION DATA                      RINEX VERSION / TYPE');
            } else if (line.toUpperCase().includes('END OF HEADER')) {
                out.push(line);
                inHeader = false;
            } else {
                out.push(line);
            }
            continue;
        }

        // GPS epoch line: G## YYYY MM DD HH MM SS ...
        if (/^G\d{2} \d{4}/.test(line)) {
            const prn  = line.substring(1, 3).trim();
            const yyyy = line.substring(4, 8);
            const mm   = line.substring(9, 11).trim().padStart(2, ' ');
            const dd   = line.substring(12, 14).trim().padStart(2, ' ');
            const hh   = line.substring(15, 17).trim().padStart(2, ' ');
            const mi   = line.substring(18, 20).trim().padStart(2, ' ');
            const ss   = line.substring(21, 23);
            const rest = line.substring(23);
            const yy   = yyyy.substring(2);
            const secStr = parseFloat(ss || '0').toFixed(1).padStart(5, ' ');
            out.push(prn.padStart(2, ' ') + ' ' + yy + ' ' + mm + ' ' + dd + ' ' + hh + ' ' + mi + secStr + rest);
        } else if (line.startsWith('    ')) {
            // Continuation: 4-space RINEX 3 indent → 3-space RINEX 2 indent
            out.push('   ' + line.substring(4));
        } else if (line.trim().length > 0 && /^[REJCSM]/.test(line)) {
            // Non-GPS satellite record — skip entirely
        } else if (line.trim().length > 0) {
            out.push(line);
        }
    }
    return out.join('\n');
}

// ── RINEX 2 navigation parser ──────────────────────────────────────────────
function parseRinex2(content) {
    const lines = content.split(/\r?\n/);
    const ephs  = [];
    let i = 0;

    // Skip header
    while (i < lines.length && !lines[i].toUpperCase().includes('END OF HEADER')) i++;
    i++;

    while (i < lines.length) {
        const line = lines[i];
        if (!line || line.trim() === '') { i++; continue; }

        const prn = parseInt(line.substring(0, 2), 10);
        if (isNaN(prn) || prn < 1 || prn > 32) { i++; continue; }

        let yy  = parseInt(line.substring(3, 5).trim(),  10);
        const mo  = parseInt(line.substring(6, 8).trim(),  10);
        const d   = parseInt(line.substring(9, 11).trim(), 10);
        const hh  = parseInt(line.substring(12, 14).trim(), 10);
        const mm  = parseInt(line.substring(15, 17).trim(), 10);
        const ss  = parseFloat(line.substring(17, 22).trim());
        if (isNaN(prn) || isNaN(mo) || mo < 1 || mo > 12) { i++; continue; }
        const year = yy < 80 ? 2000 + yy : 1900 + yy;
        const { week: toe_week, sec: toe_sec } = date2gps(year, mo, d, hh, mm, Math.round(ss));

        // Clock corrections (on epoch line)
        const af0 = parseD(line.substring(22, 41));
        const af1 = parseD(line.substring(41, 60));
        const af2 = parseD(line.substring(60, 79));

        // Broadcast orbit records (8 continuation lines, 4 values each)
        const r = (n) => {
            const l = lines[i + n] || '';
            return [
                parseD(l.substring(3, 22)),
                parseD(l.substring(22, 41)),
                parseD(l.substring(41, 60)),
                parseD(l.substring(60, 79))
            ];
        };

        const [/* IODE */, crs, deltan, m0]       = r(1);
        const [cuc, ecc, cus, sqrta]               = r(2);
        const [/* toe_raw */, cic, omg0, cis]      = r(3);
        const [inc0, crc, aop, omgkdot]            = r(4);
        const [idot]                               = r(5);
        // r(6) = sv_acc, sv_health, tgd, iodc  — not needed for position
        // r(7) = tx_time, fit_interval           — not needed

        ephs.push({ prn, toe_week, toe_sec, crs, deltan, m0, cuc, ecc, cus, sqrta, cic, omg0, cis, inc0, crc, aop, omgkdot, idot });
        i += 8;
    }
    return ephs;
}

// ── Public API ─────────────────────────────────────────────────────────────
/**
 * Compute satellite az/el for every GPS SV visible from (lat, lon, alt)
 * at the given GPS simulation time string "YYYY/MM/DD,HH:mm:ss".
 * @returns {Array<{prn, azimuth, elevation, visible}>}
 */
function getSkyView(lat, lon, alt, timeStr, rinexPath) {
    const raw   = fs.readFileSync(rinexPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const isR3  = lines.slice(0, 15).some(l =>
        l.includes('RINEX VERSION / TYPE') && (l.includes(' 3') || l.includes(' 4'))
    );

    const content = isR3 ? rinex3to2(raw) : raw;
    const ephs    = parseRinex2(content);
    if (!ephs.length) return [];

    const gt = parseTimeStr(timeStr);

    // Pick closest-in-time ephemeris per PRN
    const best = {};
    for (const eph of ephs) {
        const weekDiff = (eph.toe_week - gt.week) * SEC_IN_WEEK;
        const dt = Math.abs(eph.toe_sec + weekDiff - gt.sec);
        if (!best[eph.prn] || dt < best[eph.prn].dt) {
            best[eph.prn] = { eph, dt };
        }
    }

    // Observer ECEF position and LTC matrix
    const latR   = lat * PI / 180.0;
    const lonR   = lon * PI / 180.0;
    const obsXYZ = llh2xyz(latR, lonR, alt);
    const T      = ltcmat(latR, lonR);

    const results = [];
    for (const { eph } of Object.values(best)) {
        try {
            const satXYZ = satposECEF(eph, gt.week, gt.sec);
            const dx  = [satXYZ[0]-obsXYZ[0], satXYZ[1]-obsXYZ[1], satXYZ[2]-obsXYZ[2]];
            const neu = ecef2neu(dx, T);
            const { az, el } = neu2azel(neu);
            if (el > -5) {
                results.push({
                    prn:       eph.prn,
                    azimuth:   Math.round(az * 10) / 10,
                    elevation: Math.round(el * 10) / 10,
                    visible:   el > 5
                });
            }
        } catch (_) { /* skip degenerate SV */ }
    }

    return results.sort((a, b) => b.elevation - a.elevation);
}

module.exports = { getSkyView };
